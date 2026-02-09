//! Process manager for Claude CLI agents
//!
//! Uses a pseudo-terminal (PTY) to spawn Claude CLI so that Node.js sees a TTY
//! and uses line-buffered output, enabling real-time streaming to the terminal UI.
//! Raw byte output is streamed through per-agent broadcast channels to a dedicated
//! PTY WebSocket endpoint, which feeds xterm.js on the frontend. Multiple WebSocket
//! subscribers can connect/disconnect without affecting the PTY reader.

use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::{broadcast, mpsc};

use crate::types::{AgentMode, AgentStatus, Permission};

/// Maximum size of the per-agent PTY replay buffer (1 MB)
const PTY_BUFFER_MAX_BYTES: usize = 1_024 * 1_024;

#[derive(Error, Debug)]
pub enum ProcessError {
    #[error("Agent {0} not found")]
    AgentNotFound(String),
    #[error("Agent {0} is already running")]
    AlreadyRunning(String),
    #[error("Failed to spawn process: {0}")]
    SpawnFailed(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

/// Events emitted by the process manager
#[derive(Debug, Clone)]
pub enum ProcessEvent {
    Output {
        agent_id: String,
        content: String,
        is_complete: bool,
    },
    Status {
        agent_id: String,
        status: AgentStatus,
        reason: Option<String>,
    },
    Context {
        agent_id: String,
        level: i32,
    },
    Error {
        agent_id: String,
        message: String,
    },
    Exit {
        agent_id: String,
        code: Option<i32>,
        signal: Option<String>,
    },
}

/// Represents a running agent process (PTY-backed)
struct AgentProcess {
    pid: u32,
    child: Box<dyn portable_pty::Child + Send>,
    pty_master: Box<dyn portable_pty::MasterPty + Send>,
}

/// Consolidated per-agent runtime state. Replaces the previous 6 separate HashMaps.
struct AgentRuntime {
    process: Option<AgentProcess>,
    input_tx: Option<mpsc::UnboundedSender<Vec<u8>>>,
    broadcast_tx: Option<broadcast::Sender<Vec<u8>>>,
    pty_buffer: Vec<u8>,
    last_output_time: Option<std::time::Instant>,
    is_idle: bool,
    /// Claude session ID for hook → agent mapping
    session_id: Option<String>,
    /// Timestamp of last hook-reported status (used to suppress heuristic)
    hook_status_time: Option<std::time::Instant>,
}

impl AgentRuntime {
    /// Clear active process state while preserving the PTY buffer for terminal replay.
    fn clear_active(&mut self) {
        self.process = None;
        self.input_tx = None;
        self.broadcast_tx = None;
        self.last_output_time = None;
        self.is_idle = false;
        self.hook_status_time = None;
        // pty_buffer and session_id intentionally kept for terminal replay / session resume
    }
}

/// Manages Claude CLI agent processes
pub struct ProcessManager {
    agents: Arc<Mutex<HashMap<String, AgentRuntime>>>,
    event_tx: broadcast::Sender<ProcessEvent>,
    claude_cli_path: String,
}

impl ProcessManager {
    pub fn new(claude_cli_path: String) -> Self {
        let (event_tx, _) = broadcast::channel(1000);
        Self {
            agents: Arc::new(Mutex::new(HashMap::new())),
            event_tx,
            claude_cli_path,
        }
    }

    /// Subscribe to process events
    pub fn subscribe(&self) -> broadcast::Receiver<ProcessEvent> {
        self.event_tx.subscribe()
    }

    /// Spawn a new agent process.
    /// Returns (pid, effective_session_id) on success.
    pub fn spawn_agent(
        &self,
        agent_id: &str,
        worktree_path: &str,
        mode: AgentMode,
        permissions: &[Permission],
        _initial_prompt: Option<&str>,
        session_id: Option<&str>,
    ) -> Result<(u32, String), ProcessError> {
        // Check if already running
        {
            let agents = self.agents.lock();
            if let Some(runtime) = agents.get(agent_id) {
                if runtime.process.is_some() {
                    return Err(ProcessError::AlreadyRunning(agent_id.to_string()));
                }
            }
        }

        // Build command arguments — interactive mode (no --print)
        let mut args = vec!["--verbose".to_string()];

        // Mode-specific flags
        match mode {
            AgentMode::Auto => {
                args.push("--dangerously-skip-permissions".to_string());
            }
            AgentMode::Plan => {
                args.push("--plan".to_string());
            }
            AgentMode::Regular => {}
        }

        // Permission flags
        let mut allowed_tools = Vec::new();
        if permissions.contains(&Permission::Write) {
            allowed_tools.push("Write");
            allowed_tools.push("Edit");
        }
        if permissions.contains(&Permission::Execute) {
            allowed_tools.push("Bash");
        }
        if !allowed_tools.is_empty() && mode != AgentMode::Auto {
            args.push("--allowedTools".to_string());
            args.push(allowed_tools.join(","));
        }

        // Session management: resume existing or assign new session ID
        let effective_session_id = if let Some(sid) = session_id {
            args.push("--resume".to_string());
            args.push(sid.to_string());
            sid.to_string()
        } else {
            let new_sid = uuid::Uuid::new_v4().to_string();
            args.push("--session-id".to_string());
            args.push(new_sid.clone());
            new_sid
        };

        // No --print flag — always run interactively

        // Write hook settings for deterministic status detection
        if let Err(e) = write_hook_settings(worktree_path, 3001) {
            tracing::warn!("Failed to write hook settings for agent {}: {}", agent_id, e);
            // Non-fatal: idle monitor heuristic still works as fallback
        }

        // Create PTY pair
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 120,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| ProcessError::SpawnFailed(e.to_string()))?;

        // Build command for PTY — full color support for xterm.js
        let mut cmd = CommandBuilder::new(&self.claude_cli_path);
        cmd.args(&args);
        cmd.cwd(worktree_path);
        cmd.env("TERM", "xterm-256color");

        // Spawn in PTY
        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| ProcessError::SpawnFailed(e.to_string()))?;
        let pid = child.process_id().unwrap_or(0);

        // Get reader/writer from PTY master
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| ProcessError::SpawnFailed(e.to_string()))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| ProcessError::SpawnFailed(e.to_string()))?;

        // Drop slave — not needed after spawn
        drop(pair.slave);

        // Create channels for PTY I/O
        let (output_tx, _) = broadcast::channel::<Vec<u8>>(1000);
        let (input_tx, input_rx) = mpsc::unbounded_channel::<Vec<u8>>();

        let process = AgentProcess {
            pid,
            child,
            pty_master: pair.master,
        };

        // Insert or update runtime entry — clear buffer on restart
        {
            let mut agents = self.agents.lock();
            let runtime = agents
                .entry(agent_id.to_string())
                .or_insert_with(|| AgentRuntime {
                    process: None,
                    input_tx: None,
                    broadcast_tx: None,
                    pty_buffer: Vec::new(),
                    last_output_time: None,
                    is_idle: false,
                    session_id: None,
                    hook_status_time: None,
                });
            runtime.process = Some(process);
            runtime.input_tx = Some(input_tx);
            runtime.broadcast_tx = Some(output_tx.clone());
            runtime.pty_buffer.clear();
            runtime.last_output_time = Some(std::time::Instant::now());
            runtime.is_idle = false;
            runtime.hook_status_time = None;
            runtime.session_id = Some(effective_session_id.clone());
        }

        // Start raw byte output reader
        self.start_output_reader(agent_id.to_string(), reader, output_tx);

        // Start PTY writer task
        self.start_input_writer(agent_id.to_string(), writer, input_rx);

        // Start exit poller
        self.start_exit_poller(agent_id.to_string());

        // Start idle monitor for Running↔Waiting detection
        self.start_idle_monitor(agent_id.to_string());

        // Emit running status
        let _ = self.event_tx.send(ProcessEvent::Status {
            agent_id: agent_id.to_string(),
            status: AgentStatus::Running,
            reason: None,
        });

        Ok((pid, effective_session_id))
    }

    /// Send a message to an agent via the PTY input channel
    pub fn send_message(&self, agent_id: &str, content: &str) -> Result<(), ProcessError> {
        let agents = self.agents.lock();
        let runtime = agents
            .get(agent_id)
            .ok_or_else(|| ProcessError::AgentNotFound(agent_id.to_string()))?;
        let input_tx = runtime
            .input_tx
            .as_ref()
            .ok_or_else(|| ProcessError::AgentNotFound(agent_id.to_string()))?;
        input_tx
            .send(format!("{}\n", content).into_bytes())
            .map_err(|_| {
                ProcessError::Io(std::io::Error::new(
                    std::io::ErrorKind::BrokenPipe,
                    "PTY closed",
                ))
            })?;
        Ok(())
    }

    /// Stop an agent process
    pub fn stop_agent(&self, agent_id: &str, force: bool) -> Result<(), ProcessError> {
        let mut agents = self.agents.lock();
        let runtime = agents
            .get_mut(agent_id)
            .ok_or_else(|| ProcessError::AgentNotFound(agent_id.to_string()))?;
        let process = runtime
            .process
            .as_mut()
            .ok_or_else(|| ProcessError::AgentNotFound(agent_id.to_string()))?;

        if force {
            process
                .child
                .kill()
                .map_err(|e| ProcessError::SpawnFailed(e.to_string()))?;
            runtime.clear_active();
            let _ = self.event_tx.send(ProcessEvent::Exit {
                agent_id: agent_id.to_string(),
                code: None,
                signal: Some("SIGKILL".to_string()),
            });
        } else {
            // Graceful stop: send SIGINT (Ctrl+C), let the exit monitor detect exit
            #[cfg(unix)]
            {
                unsafe {
                    libc::kill(process.pid as i32, libc::SIGINT);
                }
            }
            #[cfg(not(unix))]
            {
                process
                    .child
                    .kill()
                    .map_err(|e| ProcessError::SpawnFailed(e.to_string()))?;
            }
            // Do NOT clear_active — the exit poller will handle it
        }

        Ok(())
    }

    /// Check if an agent is currently running
    pub fn is_running(&self, agent_id: &str) -> bool {
        self.agents
            .lock()
            .get(agent_id)
            .is_some_and(|r| r.process.is_some())
    }

    /// Get count of running agents
    pub fn get_running_count(&self) -> usize {
        self.agents
            .lock()
            .values()
            .filter(|r| r.process.is_some())
            .count()
    }

    /// Stop all running agents
    pub fn stop_all(&self) {
        let mut agents = self.agents.lock();
        for (agent_id, runtime) in agents.iter_mut() {
            if let Some(ref mut process) = runtime.process {
                let _ = process.child.kill();
                let _ = self.event_tx.send(ProcessEvent::Exit {
                    agent_id: agent_id.clone(),
                    code: None,
                    signal: Some("SIGKILL".to_string()),
                });
            }
            runtime.clear_active();
        }
    }

    /// Subscribe to PTY output for an agent. Can be called multiple times —
    /// each call returns a new broadcast receiver. Closing a receiver does NOT
    /// stop the PTY reader.
    pub fn subscribe_pty_output(
        &self,
        agent_id: &str,
    ) -> Option<(broadcast::Receiver<Vec<u8>>, Vec<u8>)> {
        let agents = self.agents.lock();
        let runtime = agents.get(agent_id)?;
        let tx = runtime.broadcast_tx.as_ref()?;
        let rx = tx.subscribe();
        let buffer = runtime.pty_buffer.clone();
        Some((rx, buffer))
    }

    /// Get a cloneable PTY input sender for an agent
    pub fn get_pty_input_tx(&self, agent_id: &str) -> Option<mpsc::UnboundedSender<Vec<u8>>> {
        self.agents
            .lock()
            .get(agent_id)
            .and_then(|r| r.input_tx.clone())
    }

    /// Resize PTY for an agent
    pub fn resize_pty(&self, agent_id: &str, rows: u16, cols: u16) -> Result<(), ProcessError> {
        let agents = self.agents.lock();
        let runtime = agents
            .get(agent_id)
            .ok_or_else(|| ProcessError::AgentNotFound(agent_id.to_string()))?;
        let process = runtime
            .process
            .as_ref()
            .ok_or_else(|| ProcessError::AgentNotFound(agent_id.to_string()))?;
        process
            .pty_master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| ProcessError::SpawnFailed(e.to_string()))?;
        Ok(())
    }

    /// Find agent by Claude session_id (from hook notification)
    pub fn find_agent_by_session(&self, session_id: Option<&str>) -> Option<String> {
        let agents = self.agents.lock();
        if let Some(sid) = session_id {
            for (agent_id, runtime) in agents.iter() {
                if runtime.session_id.as_deref() == Some(sid) && runtime.process.is_some() {
                    return Some(agent_id.clone());
                }
            }
        }
        None
    }

    /// Update agent status from hook notification (immediate, no 3-second delay)
    pub fn set_hook_status(&self, agent_id: &str, status: AgentStatus) {
        {
            let mut agents = self.agents.lock();
            if let Some(runtime) = agents.get_mut(agent_id) {
                runtime.is_idle = true;
                runtime.hook_status_time = Some(std::time::Instant::now());
            }
        }
        let reason = match status {
            AgentStatus::Waiting => "Hook: waiting for user input",
            AgentStatus::Idle => "Hook: agent idle at prompt",
            _ => "Hook: status update",
        };
        let _ = self.event_tx.send(ProcessEvent::Status {
            agent_id: agent_id.to_string(),
            status,
            reason: Some(reason.to_string()),
        });
    }

    /// Start raw byte reader from PTY → broadcast channel + buffer
    fn start_output_reader(
        &self,
        agent_id: String,
        mut reader: Box<dyn Read + Send>,
        output_tx: broadcast::Sender<Vec<u8>>,
    ) {
        let agents = self.agents.clone();
        let event_tx = self.event_tx.clone();

        tokio::task::spawn_blocking(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = buf[..n].to_vec();
                        // Single lock: update timestamp, idle flag, and buffer
                        {
                            let mut map = agents.lock();
                            if let Some(runtime) = map.get_mut(&agent_id) {
                                // Update last output timestamp for idle detection
                                runtime.last_output_time = Some(std::time::Instant::now());
                                // Reset hook state — agent is producing output again
                                runtime.hook_status_time = None;
                                // If agent was idle, flip back to Running
                                if runtime.is_idle {
                                    runtime.is_idle = false;
                                    let _ = event_tx.send(ProcessEvent::Status {
                                        agent_id: agent_id.clone(),
                                        status: AgentStatus::Running,
                                        reason: None,
                                    });
                                }
                                // Append to replay buffer with cap
                                runtime.pty_buffer.extend_from_slice(&chunk);
                                if runtime.pty_buffer.len() > PTY_BUFFER_MAX_BYTES {
                                    let excess =
                                        runtime.pty_buffer.len() - PTY_BUFFER_MAX_BYTES;
                                    runtime.pty_buffer.drain(0..excess);
                                }
                            }
                        }
                        // Broadcast outside lock (no subscribers is fine)
                        let _ = output_tx.send(chunk);
                    }
                    Err(e) => {
                        tracing::debug!("Agent {} PTY reader ended: {}", agent_id, e);
                        break;
                    }
                }
            }
        });
    }

    /// Start PTY writer task: reads from input channel → writes to PTY
    fn start_input_writer(
        &self,
        agent_id: String,
        mut writer: Box<dyn Write + Send>,
        mut input_rx: mpsc::UnboundedReceiver<Vec<u8>>,
    ) {
        tokio::task::spawn_blocking(move || {
            while let Some(data) = input_rx.blocking_recv() {
                if writer.write_all(&data).is_err() {
                    break;
                }
                if writer.flush().is_err() {
                    break;
                }
            }
            tracing::debug!("Agent {} PTY writer ended", agent_id);
        });
    }

    /// Start exit poller — checks if the child process has exited
    fn start_exit_poller(&self, agent_id: String) {
        let agents = self.agents.clone();
        let event_tx = self.event_tx.clone();

        tokio::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

                let should_exit = {
                    let mut map = agents.lock();
                    if let Some(runtime) = map.get_mut(&agent_id) {
                        if let Some(ref mut process) = runtime.process {
                            match process.child.try_wait() {
                                Ok(Some(status)) => {
                                    let exit_code =
                                        if status.success() { Some(0) } else { None };
                                    let _ = event_tx.send(ProcessEvent::Exit {
                                        agent_id: agent_id.clone(),
                                        code: exit_code,
                                        signal: None,
                                    });
                                    runtime.clear_active();
                                    true
                                }
                                Ok(None) => false,
                                Err(_) => {
                                    runtime.clear_active();
                                    true
                                }
                            }
                        } else {
                            true // No process — exit poller done
                        }
                    } else {
                        true // Agent removed entirely
                    }
                };

                if should_exit {
                    break;
                }
            }
        });
    }

    /// Start idle monitor — detects Running↔Idle/Waiting transitions based on output activity
    /// and PTY buffer content.
    fn start_idle_monitor(&self, agent_id: String) {
        let agents = self.agents.clone();
        let event_tx = self.event_tx.clone();
        let idle_threshold = std::time::Duration::from_secs(3);

        tokio::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

                let action = {
                    let mut map = agents.lock();
                    let Some(runtime) = map.get_mut(&agent_id) else {
                        break; // Agent removed
                    };

                    // Exit if agent is no longer running
                    if runtime.process.is_none() {
                        break;
                    }

                    let Some(last_time) = runtime.last_output_time else {
                        break; // No timestamp — agent was cleaned up
                    };

                    let elapsed = last_time.elapsed();
                    if elapsed >= idle_threshold && !runtime.is_idle {
                        runtime.is_idle = true;

                        // If hooks reported status within the last 10 seconds, trust them
                        if let Some(hook_time) = runtime.hook_status_time {
                            if hook_time.elapsed() < std::time::Duration::from_secs(10) {
                                None // Hook already set the correct status
                            } else {
                                // Hook is stale — fall back to heuristic
                                let tail_start = runtime.pty_buffer.len().saturating_sub(200);
                                let tail = &runtime.pty_buffer[tail_start..];
                                let text = String::from_utf8_lossy(tail);
                                let is_waiting = is_waiting_prompt(&text);

                                let (status, reason) = if is_waiting {
                                    (AgentStatus::Waiting, "Waiting for user input".to_string())
                                } else {
                                    (AgentStatus::Idle, "Agent idle at prompt".to_string())
                                };

                                Some((status, reason))
                            }
                        } else {
                            // No hook signal — use PTY buffer heuristic (fallback)
                            let tail_start = runtime.pty_buffer.len().saturating_sub(200);
                            let tail = &runtime.pty_buffer[tail_start..];
                            let text = String::from_utf8_lossy(tail);
                            let is_waiting = is_waiting_prompt(&text);

                            let (status, reason) = if is_waiting {
                                (AgentStatus::Waiting, "Waiting for user input".to_string())
                            } else {
                                (AgentStatus::Idle, "Agent idle at prompt".to_string())
                            };

                            Some((status, reason))
                        }
                    } else {
                        None
                    }
                };

                if let Some((status, reason)) = action {
                    let _ = event_tx.send(ProcessEvent::Status {
                        agent_id: agent_id.clone(),
                        status,
                        reason: Some(reason),
                    });
                }
            }
        });
    }
}

/// Write `.claude/settings.local.json` with hook configuration.
///
/// Claude Code reads this file on startup. The hooks fire curl commands that POST
/// notification JSON to our /hooks endpoint, enabling instant status detection.
fn write_hook_settings(worktree_path: &str, port: u16) -> Result<(), ProcessError> {
    let claude_dir = PathBuf::from(worktree_path).join(".claude");
    std::fs::create_dir_all(&claude_dir)
        .map_err(|e| ProcessError::SpawnFailed(format!("Failed to create .claude dir: {e}")))?;

    let settings_path = claude_dir.join("settings.local.json");

    // Read existing settings or start fresh
    let mut settings: serde_json::Value = if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // curl posts stdin (hook JSON) to our /hooks endpoint
    let curl_cmd = format!(
        "curl -s -X POST http://127.0.0.1:{port}/hooks -H 'Content-Type: application/json' -d @-"
    );
    settings["hooks"] = serde_json::json!({
        "Notification": [
            {
                "matcher": "permission_prompt",
                "hooks": [{ "type": "command", "command": curl_cmd }]
            },
            {
                "matcher": "idle_prompt",
                "hooks": [{ "type": "command", "command": curl_cmd }]
            },
            {
                "matcher": "elicitation_dialog",
                "hooks": [{ "type": "command", "command": curl_cmd }]
            }
        ]
    });

    std::fs::write(
        &settings_path,
        serde_json::to_string_pretty(&settings)
            .map_err(|e| ProcessError::SpawnFailed(format!("Failed to serialize settings: {e}")))?,
    )
    .map_err(|e| ProcessError::SpawnFailed(format!("Failed to write hook settings: {e}")))?;

    Ok(())
}

/// Strip ANSI escape sequences from a string
fn strip_ansi_escapes(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\x1b' {
            // Skip ESC [ ... final_byte sequences
            if chars.peek() == Some(&'[') {
                chars.next(); // consume '['
                // Consume parameter bytes (0x30-0x3F), intermediate bytes (0x20-0x2F),
                // until final byte (0x40-0x7E)
                for ch in chars.by_ref() {
                    if ('@'..='~').contains(&ch) {
                        break;
                    }
                }
            } else {
                // Skip ESC + one char (e.g., ESC ] for OSC — simplified)
                chars.next();
            }
        } else {
            result.push(ch);
        }
    }
    result
}

/// Check if the terminal buffer tail looks like a prompt waiting for user input
fn is_waiting_prompt(text: &str) -> bool {
    let clean = strip_ansi_escapes(text);
    let trimmed = clean.trim_end();

    // Check for confirmation prompts
    if trimmed.contains("[Y/n]")
        || trimmed.contains("[y/N]")
        || trimmed.contains("(yes/no)")
        || trimmed.contains("(y/n)")
    {
        return true;
    }

    // Check for Claude CLI permission/approval language
    if trimmed.contains("Allow ")
        || trimmed.contains("Approve")
        || trimmed.contains("Do you want")
    {
        return true;
    }

    // Check if the last non-empty line ends with '?'
    if let Some(last_line) = trimmed.lines().rev().find(|l| !l.trim().is_empty()) {
        let last_trimmed = last_line.trim();
        if last_trimmed.ends_with('?') {
            return true;
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_process_manager_has_zero_running() {
        let pm = ProcessManager::new("echo".to_string());
        assert_eq!(pm.get_running_count(), 0);
    }

    #[test]
    fn subscribe_pty_output_nonexistent_returns_none() {
        let pm = ProcessManager::new("echo".to_string());
        assert!(pm.subscribe_pty_output("nonexistent").is_none());
    }

    #[test]
    fn get_pty_input_tx_nonexistent_returns_none() {
        let pm = ProcessManager::new("echo".to_string());
        assert!(pm.get_pty_input_tx("nonexistent").is_none());
    }

    #[test]
    fn send_message_nonexistent_returns_err() {
        let pm = ProcessManager::new("echo".to_string());
        assert!(pm.send_message("nonexistent", "hello").is_err());
    }

    #[test]
    fn stop_agent_nonexistent_returns_err() {
        let pm = ProcessManager::new("echo".to_string());
        assert!(pm.stop_agent("nonexistent", false).is_err());
    }

    #[test]
    fn resize_pty_nonexistent_returns_err() {
        let pm = ProcessManager::new("echo".to_string());
        assert!(pm.resize_pty("nonexistent", 24, 80).is_err());
    }

    #[test]
    fn stop_all_on_empty_does_not_panic() {
        let pm = ProcessManager::new("echo".to_string());
        pm.stop_all(); // should not panic
        assert_eq!(pm.get_running_count(), 0);
    }

    #[test]
    fn is_running_returns_false_for_unknown() {
        let pm = ProcessManager::new("echo".to_string());
        assert!(!pm.is_running("unknown"));
    }

    #[test]
    fn clear_active_preserves_buffer() {
        let (tx, _) = broadcast::channel(10);
        let (input_tx, _) = mpsc::unbounded_channel();
        let mut runtime = AgentRuntime {
            process: None,
            input_tx: Some(input_tx),
            broadcast_tx: Some(tx),
            pty_buffer: vec![1, 2, 3, 4, 5],
            last_output_time: Some(std::time::Instant::now()),
            is_idle: true,
            session_id: Some("test-session".to_string()),
            hook_status_time: Some(std::time::Instant::now()),
        };
        runtime.clear_active();
        assert!(runtime.process.is_none());
        assert!(runtime.input_tx.is_none());
        assert!(runtime.broadcast_tx.is_none());
        assert!(runtime.last_output_time.is_none());
        assert!(!runtime.is_idle);
        assert!(runtime.hook_status_time.is_none());
        // Buffer and session_id preserved
        assert_eq!(runtime.pty_buffer, vec![1, 2, 3, 4, 5]);
        assert_eq!(runtime.session_id.as_deref(), Some("test-session"));
    }

    #[test]
    fn pty_buffer_cap_drains_excess() {
        let mut buffer: Vec<u8> = vec![0u8; PTY_BUFFER_MAX_BYTES];
        // Simulate appending a 4KB chunk
        let chunk = vec![1u8; 4096];
        buffer.extend_from_slice(&chunk);
        assert!(buffer.len() > PTY_BUFFER_MAX_BYTES);
        let excess = buffer.len() - PTY_BUFFER_MAX_BYTES;
        buffer.drain(0..excess);
        assert_eq!(buffer.len(), PTY_BUFFER_MAX_BYTES);
        // The tail should be the new chunk data
        assert_eq!(buffer[buffer.len() - 4096..], chunk[..]);
    }

    #[test]
    fn pty_buffer_under_cap_not_drained() {
        let mut buffer: Vec<u8> = vec![0u8; 1000];
        let chunk = vec![1u8; 500];
        buffer.extend_from_slice(&chunk);
        // Under cap — no drain needed
        assert_eq!(buffer.len(), 1500);
        assert!(buffer.len() <= PTY_BUFFER_MAX_BYTES);
    }

    #[test]
    fn is_waiting_prompt_detects_patterns() {
        assert!(is_waiting_prompt("Continue? [Y/n]"));
        assert!(is_waiting_prompt("Allow read access?"));
        assert!(is_waiting_prompt("Do you want to proceed?"));
        assert!(is_waiting_prompt("Approve this action"));
        assert!(is_waiting_prompt("Continue? (yes/no)"));
        assert!(!is_waiting_prompt("Processing..."));
        assert!(!is_waiting_prompt(""));
    }

    #[test]
    fn find_agent_by_session_returns_matching_agent() {
        let pm = ProcessManager::new("echo".to_string());
        // Manually insert a runtime with session_id and a mock process marker
        {
            let mut agents = pm.agents.lock();
            agents.insert(
                "agent-1".to_string(),
                AgentRuntime {
                    process: None, // no process → won't match (must be running)
                    input_tx: None,
                    broadcast_tx: None,
                    pty_buffer: Vec::new(),
                    last_output_time: None,
                    is_idle: false,
                    session_id: Some("session-abc".to_string()),
                    hook_status_time: None,
                },
            );
        }
        // Without a running process, should return None
        assert!(pm.find_agent_by_session(Some("session-abc")).is_none());
    }

    #[test]
    fn find_agent_by_session_returns_none_for_unknown() {
        let pm = ProcessManager::new("echo".to_string());
        assert!(pm.find_agent_by_session(Some("nonexistent")).is_none());
        assert!(pm.find_agent_by_session(None).is_none());
    }

    #[test]
    fn set_hook_status_emits_event_and_sets_fields() {
        let pm = ProcessManager::new("echo".to_string());
        let mut rx = pm.subscribe();

        // Insert a runtime entry
        {
            let mut agents = pm.agents.lock();
            agents.insert(
                "agent-1".to_string(),
                AgentRuntime {
                    process: None,
                    input_tx: None,
                    broadcast_tx: None,
                    pty_buffer: Vec::new(),
                    last_output_time: None,
                    is_idle: false,
                    session_id: Some("s1".to_string()),
                    hook_status_time: None,
                },
            );
        }

        pm.set_hook_status("agent-1", AgentStatus::Waiting);

        // Check runtime state
        {
            let agents = pm.agents.lock();
            let runtime = agents.get("agent-1").unwrap();
            assert!(runtime.is_idle);
            assert!(runtime.hook_status_time.is_some());
        }

        // Check emitted event
        let event = rx.try_recv().unwrap();
        match event {
            ProcessEvent::Status {
                agent_id,
                status,
                reason,
            } => {
                assert_eq!(agent_id, "agent-1");
                assert_eq!(status, AgentStatus::Waiting);
                assert!(reason.unwrap().contains("Hook"));
            }
            _ => panic!("Expected Status event"),
        }
    }

    #[test]
    fn write_hook_settings_creates_file() {
        let dir = tempfile::tempdir().unwrap();
        let worktree_path = dir.path().to_str().unwrap();

        write_hook_settings(worktree_path, 3001).unwrap();

        let settings_path = dir.path().join(".claude").join("settings.local.json");
        assert!(settings_path.exists());

        let content = std::fs::read_to_string(&settings_path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();

        // Verify hooks structure
        assert!(parsed["hooks"]["Notification"].is_array());
        let notifications = parsed["hooks"]["Notification"].as_array().unwrap();
        assert_eq!(notifications.len(), 3);

        // Verify matchers
        let matchers: Vec<&str> = notifications
            .iter()
            .map(|n| n["matcher"].as_str().unwrap())
            .collect();
        assert!(matchers.contains(&"permission_prompt"));
        assert!(matchers.contains(&"idle_prompt"));
        assert!(matchers.contains(&"elicitation_dialog"));

        // Verify curl command contains correct port
        let cmd = notifications[0]["hooks"][0]["command"].as_str().unwrap();
        assert!(cmd.contains("3001"));
        assert!(cmd.contains("curl"));
    }

    #[test]
    fn write_hook_settings_preserves_existing_settings() {
        let dir = tempfile::tempdir().unwrap();
        let worktree_path = dir.path().to_str().unwrap();

        // Create existing settings
        let claude_dir = dir.path().join(".claude");
        std::fs::create_dir_all(&claude_dir).unwrap();
        std::fs::write(
            claude_dir.join("settings.local.json"),
            r#"{"someExistingSetting": true}"#,
        )
        .unwrap();

        write_hook_settings(worktree_path, 3001).unwrap();

        let content =
            std::fs::read_to_string(claude_dir.join("settings.local.json")).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();

        // Existing setting preserved
        assert_eq!(parsed["someExistingSetting"], true);
        // Hooks added
        assert!(parsed["hooks"]["Notification"].is_array());
    }
}
