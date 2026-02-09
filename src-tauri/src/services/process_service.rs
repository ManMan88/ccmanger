//! Process manager for Claude CLI agents
//!
//! Uses a pseudo-terminal (PTY) to spawn Claude CLI so that Node.js sees a TTY
//! and uses line-buffered output, enabling real-time streaming to the terminal UI.
//! Raw byte output is streamed through per-agent mpsc channels to a dedicated
//! PTY WebSocket endpoint, which feeds xterm.js on the frontend.

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
    /// Per-agent output receiver — taken by the first WebSocket connection
    pty_output_rxs: Arc<Mutex<HashMap<String, mpsc::UnboundedReceiver<Vec<u8>>>>>,
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
            pty_output_rxs: Arc::new(Mutex::new(HashMap::new())),
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

        // Create mpsc channels for PTY I/O
        let (output_tx, output_rx) = mpsc::unbounded_channel::<Vec<u8>>();
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
        self.pty_output_rxs
            .lock()
            .insert(agent_id.to_string(), output_rx);

        // Start raw byte output reader
        self.start_output_reader(agent_id.to_string(), reader, output_tx);

        // Start PTY writer task
        self.start_input_writer(agent_id.to_string(), writer, input_rx);

        // Start exit poller
        self.start_exit_poller(agent_id.to_string());

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
            self.pty_output_rxs.lock().remove(agent_id);
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
        self.pty_output_rxs.lock().clear();
    }

    /// Take the PTY output receiver for a WebSocket connection (consumes it).
    /// Returns the receiver and any buffered output for replay.
    pub fn take_pty_output_rx(
        &self,
        agent_id: &str,
    ) -> Option<(mpsc::UnboundedReceiver<Vec<u8>>, Vec<u8>)> {
        let rx = self.pty_output_rxs.lock().remove(agent_id)?;
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

    /// Start raw byte reader from PTY → output channel + buffer
    fn start_output_reader(
        &self,
        agent_id: String,
        mut reader: Box<dyn Read + Send>,
        output_tx: mpsc::UnboundedSender<Vec<u8>>,
    ) {
        let buffers = self.pty_buffers.clone();

        tokio::task::spawn_blocking(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = buf[..n].to_vec();
                        // Append to replay buffer
                        if let Some(buffer) = buffers.lock().get_mut(&agent_id) {
                            buffer.extend_from_slice(&chunk);
                        }
                        // Send to WebSocket (ignore error if no receiver yet)
                        if output_tx.send(chunk).is_err() {
                            break;
                        }
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
        let pty_output_rxs = self.pty_output_rxs.clone();
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
                                pty_output_rxs.lock().remove(&agent_id);
                                // Keep pty_buffers for replay
                                true
                            }
                            Ok(None) => false,
                            Err(_) => {
                                procs.remove(&agent_id);
                                pty_channels.lock().remove(&agent_id);
                                pty_output_rxs.lock().remove(&agent_id);
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
}
