//! Process manager for Claude CLI agents

use parking_lot::RwLock;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStderr, ChildStdout, Command, Stdio};
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::broadcast;

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

/// Represents a running agent process
struct AgentProcess {
    pid: u32,
    child: Child,
}

/// Manages Claude CLI agent processes
pub struct ProcessManager {
    processes: Arc<RwLock<HashMap<String, AgentProcess>>>,
    event_tx: broadcast::Sender<ProcessEvent>,
    claude_cli_path: String,
}

impl ProcessManager {
    pub fn new(claude_cli_path: String) -> Self {
        let (event_tx, _) = broadcast::channel(1000);
        Self {
            processes: Arc::new(RwLock::new(HashMap::new())),
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
        initial_prompt: Option<&str>,
        session_id: Option<&str>,
    ) -> Result<u32, ProcessError> {
        // Check if already running
        if self.processes.read().contains_key(agent_id) {
            return Err(ProcessError::AlreadyRunning(agent_id.to_string()));
        }

        // Build command arguments
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

        // Initial prompt
        if let Some(prompt) = initial_prompt {
            args.push("--print".to_string());
            args.push(prompt.to_string());
        }

        // Spawn process
        let mut child = Command::new(&self.claude_cli_path)
            .args(&args)
            .current_dir(worktree_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("FORCE_COLOR", "0")
            .env("NO_COLOR", "1")
            .spawn()
            .map_err(|e| ProcessError::SpawnFailed(e.to_string()))?;

        let pid = child.id();

        // Take stdout/stderr before inserting child into map
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let process = AgentProcess {
            pid,
            child,
        };

        self.processes
            .write()
            .insert(agent_id.to_string(), process);

        // Start output monitoring in background
        self.start_output_monitor(agent_id.to_string(), stdout, stderr);

        // Emit running status
        let _ = self.event_tx.send(ProcessEvent::Status {
            agent_id: agent_id.to_string(),
            status: AgentStatus::Running,
            reason: None,
        });

        Ok(pid)
    }

    /// Send a message to an agent's stdin
    pub fn send_message(&self, agent_id: &str, content: &str) -> Result<(), ProcessError> {
        let mut processes = self.processes.write();
        let process = processes
            .get_mut(agent_id)
            .ok_or_else(|| ProcessError::AgentNotFound(agent_id.to_string()))?;

        if let Some(stdin) = process.child.stdin.as_mut() {
            writeln!(stdin, "{}", content)?;
            stdin.flush()?;
        }

        Ok(())
    }

    /// Stop an agent process
    pub fn stop_agent(&self, agent_id: &str, force: bool) -> Result<(), ProcessError> {
        let mut processes = self.processes.write();
        let process = processes
            .get_mut(agent_id)
            .ok_or_else(|| ProcessError::AgentNotFound(agent_id.to_string()))?;

        if force {
            process.child.kill()?;
            // For force stop, remove immediately and emit exit event
            processes.remove(agent_id);
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
                process.child.kill()?;
            }
            // Do NOT remove from map or emit exit event — the output monitor will handle it
        }

        Ok(())
    }

    /// Check if an agent is currently running
    pub fn is_running(&self, agent_id: &str) -> bool {
        self.processes.read().contains_key(agent_id)
    }

    /// Get count of running agents
    pub fn get_running_count(&self) -> usize {
        self.processes.read().len()
    }

    /// Stop all running agents
    pub fn stop_all(&self) {
        let mut processes = self.processes.write();
        for (agent_id, mut process) in processes.drain() {
            let _ = process.child.kill();
            let _ = self.event_tx.send(ProcessEvent::Exit {
                agent_id,
                code: None,
                signal: Some("SIGKILL".to_string()),
            });
        }
    }

    /// Start monitoring output from an agent process
    fn start_output_monitor(
        &self,
        agent_id: String,
        stdout: Option<ChildStdout>,
        stderr: Option<ChildStderr>,
    ) {
        let processes = self.processes.clone();
        let event_tx = self.event_tx.clone();

        // Stdout reader task
        if let Some(stdout) = stdout {
            let agent_id = agent_id.clone();
            let event_tx = event_tx.clone();
            tokio::task::spawn_blocking(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    match line {
                        Ok(content) => {
                            let _ = event_tx.send(ProcessEvent::Output {
                                agent_id: agent_id.clone(),
                                content,
                                is_complete: true,
                            });
                        }
                        Err(_) => break,
                    }
                }
            });
        }

        // Stderr reader task
        if let Some(stderr) = stderr {
            let agent_id = agent_id.clone();
            let event_tx = event_tx.clone();
            tokio::task::spawn_blocking(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    match line {
                        Ok(content) => {
                            let _ = event_tx.send(ProcessEvent::Error {
                                agent_id: agent_id.clone(),
                                message: content,
                            });
                        }
                        Err(_) => break,
                    }
                }
            });
        }

        // Exit poller task
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

                let should_exit = {
                    let mut procs = processes.write();
                    if let Some(process) = procs.get_mut(&agent_id) {
                        match process.child.try_wait() {
                            Ok(Some(status)) => {
                                let _ = event_tx.send(ProcessEvent::Exit {
                                    agent_id: agent_id.clone(),
                                    code: status.code(),
                                    signal: None,
                                });
                                procs.remove(&agent_id);
                                true
                            }
                            Ok(None) => false,
                            Err(_) => {
                                procs.remove(&agent_id);
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
