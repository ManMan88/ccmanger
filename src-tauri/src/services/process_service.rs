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
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::{broadcast, mpsc};

use crate::types::{AgentMode, AgentStatus, Permission};

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

/// Per-agent PTY I/O channel for WebSocket bridging
struct PtyChannel {
    input_tx: mpsc::UnboundedSender<Vec<u8>>,
}

/// Represents a running agent process (PTY-backed)
struct AgentProcess {
    pid: u32,
    child: Box<dyn portable_pty::Child + Send>,
    pty_master: Box<dyn portable_pty::MasterPty + Send>,
}

/// Manages Claude CLI agent processes
pub struct ProcessManager {
    processes: Arc<Mutex<HashMap<String, AgentProcess>>>,
    pty_channels: Arc<Mutex<HashMap<String, PtyChannel>>>,
    /// Per-agent raw byte buffer for replaying output on WebSocket reconnect
    pty_buffers: Arc<Mutex<HashMap<String, Vec<u8>>>>,
    /// Per-agent broadcast sender for PTY output — subscribers can connect/disconnect freely
    pty_broadcast_txs: Arc<Mutex<HashMap<String, broadcast::Sender<Vec<u8>>>>>,
    /// Timestamp of last PTY output per agent (for idle detection)
    last_output_times: Arc<Mutex<HashMap<String, std::time::Instant>>>,
    /// Whether agent is currently considered idle (waiting for input)
    idle_flags: Arc<Mutex<HashMap<String, bool>>>,
    event_tx: broadcast::Sender<ProcessEvent>,
    claude_cli_path: String,
}

impl ProcessManager {
    pub fn new(claude_cli_path: String) -> Self {
        let (event_tx, _) = broadcast::channel(1000);
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            pty_channels: Arc::new(Mutex::new(HashMap::new())),
            pty_buffers: Arc::new(Mutex::new(HashMap::new())),
            pty_broadcast_txs: Arc::new(Mutex::new(HashMap::new())),
            last_output_times: Arc::new(Mutex::new(HashMap::new())),
            idle_flags: Arc::new(Mutex::new(HashMap::new())),
            event_tx,
            claude_cli_path,
        }
    }

    /// Subscribe to process events
    pub fn subscribe(&self) -> broadcast::Receiver<ProcessEvent> {
        self.event_tx.subscribe()
    }

    /// Spawn a new agent process
    pub fn spawn_agent(
        &self,
        agent_id: &str,
        worktree_path: &str,
        mode: AgentMode,
        permissions: &[Permission],
        _initial_prompt: Option<&str>,
        session_id: Option<&str>,
    ) -> Result<u32, ProcessError> {
        // Check if already running
        if self.processes.lock().contains_key(agent_id) {
            return Err(ProcessError::AlreadyRunning(agent_id.to_string()));
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

        // Session resumption
        if let Some(sid) = session_id {
            args.push("--resume".to_string());
            args.push(sid.to_string());
        }

        // No --print flag — always run interactively

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

        let channel = PtyChannel {
            input_tx: input_tx.clone(),
        };

        let process = AgentProcess {
            pid,
            child,
            pty_master: pair.master,
        };

        self.processes
            .lock()
            .insert(agent_id.to_string(), process);
        self.pty_channels
            .lock()
            .insert(agent_id.to_string(), channel);
        self.pty_buffers
            .lock()
            .insert(agent_id.to_string(), Vec::new());
        self.pty_broadcast_txs
            .lock()
            .insert(agent_id.to_string(), output_tx.clone());

        // Initialize idle tracking
        self.last_output_times
            .lock()
            .insert(agent_id.to_string(), std::time::Instant::now());
        self.idle_flags
            .lock()
            .insert(agent_id.to_string(), false);

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

        Ok(pid)
    }

    /// Send a message to an agent via the PTY input channel
    pub fn send_message(&self, agent_id: &str, content: &str) -> Result<(), ProcessError> {
        let channels = self.pty_channels.lock();
        let channel = channels
            .get(agent_id)
            .ok_or_else(|| ProcessError::AgentNotFound(agent_id.to_string()))?;
        channel
            .input_tx
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
        let mut processes = self.processes.lock();
        let process = processes
            .get_mut(agent_id)
            .ok_or_else(|| ProcessError::AgentNotFound(agent_id.to_string()))?;

        if force {
            process
                .child
                .kill()
                .map_err(|e| ProcessError::SpawnFailed(e.to_string()))?;
            // For force stop, remove immediately and emit exit event
            processes.remove(agent_id);
            self.pty_channels.lock().remove(agent_id);
            self.pty_broadcast_txs.lock().remove(agent_id);
            self.last_output_times.lock().remove(agent_id);
            self.idle_flags.lock().remove(agent_id);
            // Keep pty_buffers for replay on reconnect
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
            // Do NOT remove from map or emit exit event — the exit poller will handle it
        }

        Ok(())
    }

    /// Check if an agent is currently running
    pub fn is_running(&self, agent_id: &str) -> bool {
        self.processes.lock().contains_key(agent_id)
    }

    /// Get count of running agents
    pub fn get_running_count(&self) -> usize {
        self.processes.lock().len()
    }

    /// Stop all running agents
    pub fn stop_all(&self) {
        let mut processes = self.processes.lock();
        for (agent_id, mut process) in processes.drain() {
            let _ = process.child.kill();
            let _ = self.event_tx.send(ProcessEvent::Exit {
                agent_id,
                code: None,
                signal: Some("SIGKILL".to_string()),
            });
        }
        self.pty_channels.lock().clear();
        self.pty_broadcast_txs.lock().clear();
        self.last_output_times.lock().clear();
        self.idle_flags.lock().clear();
    }

    /// Subscribe to PTY output for an agent. Can be called multiple times —
    /// each call returns a new broadcast receiver. Closing a receiver does NOT
    /// stop the PTY reader.
    pub fn subscribe_pty_output(
        &self,
        agent_id: &str,
    ) -> Option<(broadcast::Receiver<Vec<u8>>, Vec<u8>)> {
        let tx = self.pty_broadcast_txs.lock().get(agent_id)?.clone();
        let rx = tx.subscribe();
        let buffer = self
            .pty_buffers
            .lock()
            .get(agent_id)
            .cloned()
            .unwrap_or_default();
        Some((rx, buffer))
    }

    /// Get a cloneable PTY input sender for an agent
    pub fn get_pty_input_tx(&self, agent_id: &str) -> Option<mpsc::UnboundedSender<Vec<u8>>> {
        self.pty_channels
            .lock()
            .get(agent_id)
            .map(|ch| ch.input_tx.clone())
    }

    /// Resize PTY for an agent
    pub fn resize_pty(&self, agent_id: &str, rows: u16, cols: u16) -> Result<(), ProcessError> {
        let processes = self.processes.lock();
        let process = processes
            .get(agent_id)
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

    /// Start raw byte reader from PTY → broadcast channel + buffer
    fn start_output_reader(
        &self,
        agent_id: String,
        mut reader: Box<dyn Read + Send>,
        output_tx: broadcast::Sender<Vec<u8>>,
    ) {
        let buffers = self.pty_buffers.clone();
        let last_output_times = self.last_output_times.clone();
        let idle_flags = self.idle_flags.clone();
        let event_tx = self.event_tx.clone();

        tokio::task::spawn_blocking(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = buf[..n].to_vec();
                        // Update last output timestamp for idle detection
                        if let Some(ts) = last_output_times.lock().get_mut(&agent_id) {
                            *ts = std::time::Instant::now();
                        }
                        // If agent was idle, flip back to Running
                        if let Some(flag) = idle_flags.lock().get_mut(&agent_id) {
                            if *flag {
                                *flag = false;
                                let _ = event_tx.send(ProcessEvent::Status {
                                    agent_id: agent_id.clone(),
                                    status: AgentStatus::Running,
                                    reason: None,
                                });
                            }
                        }
                        // Append to replay buffer
                        if let Some(buffer) = buffers.lock().get_mut(&agent_id) {
                            buffer.extend_from_slice(&chunk);
                        }
                        // Broadcast to WebSocket subscribers (ignore error = no subscribers, that's fine)
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
        let processes = self.processes.clone();
        let pty_channels = self.pty_channels.clone();
        let pty_broadcast_txs = self.pty_broadcast_txs.clone();
        let last_output_times = self.last_output_times.clone();
        let idle_flags = self.idle_flags.clone();
        let event_tx = self.event_tx.clone();

        tokio::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

                let should_exit = {
                    let mut procs = processes.lock();
                    if let Some(process) = procs.get_mut(&agent_id) {
                        match process.child.try_wait() {
                            Ok(Some(status)) => {
                                let exit_code = if status.success() { Some(0) } else { None };
                                let _ = event_tx.send(ProcessEvent::Exit {
                                    agent_id: agent_id.clone(),
                                    code: exit_code,
                                    signal: None,
                                });
                                procs.remove(&agent_id);
                                pty_channels.lock().remove(&agent_id);
                                pty_broadcast_txs.lock().remove(&agent_id);
                                last_output_times.lock().remove(&agent_id);
                                idle_flags.lock().remove(&agent_id);
                                // Keep pty_buffers for replay
                                true
                            }
                            Ok(None) => false,
                            Err(_) => {
                                procs.remove(&agent_id);
                                pty_channels.lock().remove(&agent_id);
                                pty_broadcast_txs.lock().remove(&agent_id);
                                last_output_times.lock().remove(&agent_id);
                                idle_flags.lock().remove(&agent_id);
                                true
                            }
                        }
                    } else {
                        true
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
        let processes = self.processes.clone();
        let last_output_times = self.last_output_times.clone();
        let idle_flags = self.idle_flags.clone();
        let pty_buffers = self.pty_buffers.clone();
        let event_tx = self.event_tx.clone();
        let idle_threshold = std::time::Duration::from_secs(3);

        tokio::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

                // Exit if agent is no longer in the process map
                if !processes.lock().contains_key(&agent_id) {
                    break;
                }

                let elapsed = {
                    let times = last_output_times.lock();
                    match times.get(&agent_id) {
                        Some(ts) => ts.elapsed(),
                        None => break, // Agent was cleaned up
                    }
                };

                if elapsed >= idle_threshold {
                    let mut flags = idle_flags.lock();
                    if let Some(flag) = flags.get_mut(&agent_id) {
                        if !*flag {
                            *flag = true;

                            // Check the last portion of PTY buffer to distinguish Waiting vs Idle
                            let is_waiting = {
                                let buffers = pty_buffers.lock();
                                if let Some(buf) = buffers.get(&agent_id) {
                                    let tail_start = buf.len().saturating_sub(200);
                                    let tail = &buf[tail_start..];
                                    let text = String::from_utf8_lossy(tail);
                                    is_waiting_prompt(&text)
                                } else {
                                    false
                                }
                            };

                            let (status, reason) = if is_waiting {
                                (AgentStatus::Waiting, "Waiting for user input".to_string())
                            } else {
                                (AgentStatus::Idle, "Agent idle at prompt".to_string())
                            };

                            let _ = event_tx.send(ProcessEvent::Status {
                                agent_id: agent_id.clone(),
                                status,
                                reason: Some(reason),
                            });
                        }
                    } else {
                        break; // Agent was cleaned up
                    }
                }
            }
        });
    }
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
