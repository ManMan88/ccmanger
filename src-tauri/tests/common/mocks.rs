//! Mock implementations for testing
//!
//! This module provides mock implementations of services and traits
//! for use in unit and integration tests.

#![allow(dead_code)]

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use claude_manager_lib::types::{Agent, AgentMode, AgentStatus, Permission};

/// Mock process that simulates a running agent
#[derive(Debug, Clone)]
pub struct MockProcess {
    pub id: String,
    pub pid: u32,
    pub output_lines: Vec<String>,
    pub is_running: bool,
}

impl MockProcess {
    pub fn new(id: &str) -> Self {
        Self {
            id: id.to_string(),
            pid: 12345,
            output_lines: Vec::new(),
            is_running: false,
        }
    }

    pub fn with_pid(mut self, pid: u32) -> Self {
        self.pid = pid;
        self
    }

    pub fn start(&mut self) {
        self.is_running = true;
    }

    pub fn stop(&mut self) {
        self.is_running = false;
    }

    pub fn add_output(&mut self, line: &str) {
        self.output_lines.push(line.to_string());
    }
}

/// Mock process manager for testing without spawning real processes
#[derive(Debug, Default)]
pub struct MockProcessManager {
    processes: Arc<Mutex<HashMap<String, MockProcess>>>,
    spawn_should_fail: Arc<Mutex<bool>>,
    next_pid: Arc<Mutex<u32>>,
}

impl MockProcessManager {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            spawn_should_fail: Arc::new(Mutex::new(false)),
            next_pid: Arc::new(Mutex::new(10000)),
        }
    }

    /// Configure the mock to fail on spawn
    pub fn set_spawn_fails(&self, fails: bool) {
        *self.spawn_should_fail.lock().unwrap() = fails;
    }

    /// Spawn a mock agent process
    pub fn spawn_agent(
        &self,
        agent_id: &str,
        _worktree_path: &str,
        _mode: AgentMode,
        _permissions: &[Permission],
        _initial_prompt: Option<&str>,
        _session_id: Option<&str>,
    ) -> Result<u32, MockProcessError> {
        if *self.spawn_should_fail.lock().unwrap() {
            return Err(MockProcessError::SpawnFailed);
        }

        let mut next_pid = self.next_pid.lock().unwrap();
        let pid = *next_pid;
        *next_pid += 1;

        let mut process = MockProcess::new(agent_id);
        process.pid = pid;
        process.start();

        self.processes.lock().unwrap().insert(agent_id.to_string(), process);

        Ok(pid)
    }

    /// Stop a mock agent process
    pub fn stop_agent(&self, agent_id: &str, _force: bool) -> Result<(), MockProcessError> {
        let mut processes = self.processes.lock().unwrap();
        if let Some(process) = processes.get_mut(agent_id) {
            process.stop();
            Ok(())
        } else {
            Err(MockProcessError::NotFound)
        }
    }

    /// Check if a mock agent is running
    pub fn is_running(&self, agent_id: &str) -> bool {
        self.processes
            .lock()
            .unwrap()
            .get(agent_id)
            .map(|p| p.is_running)
            .unwrap_or(false)
    }

    /// Get the output lines for an agent
    pub fn get_output(&self, agent_id: &str) -> Vec<String> {
        self.processes
            .lock()
            .unwrap()
            .get(agent_id)
            .map(|p| p.output_lines.clone())
            .unwrap_or_default()
    }

    /// Get the number of running processes
    pub fn running_count(&self) -> usize {
        self.processes
            .lock()
            .unwrap()
            .values()
            .filter(|p| p.is_running)
            .count()
    }

    /// Inject output for a specific agent (for testing)
    pub fn inject_output(&self, agent_id: &str, output: &str) {
        let mut processes = self.processes.lock().unwrap();
        if let Some(process) = processes.get_mut(agent_id) {
            process.add_output(output);
        }
    }

    /// Simulate an agent finishing
    pub fn simulate_finish(&self, agent_id: &str) {
        let mut processes = self.processes.lock().unwrap();
        if let Some(process) = processes.get_mut(agent_id) {
            process.stop();
        }
    }

    /// Simulate an agent error
    pub fn simulate_error(&self, agent_id: &str, error_msg: &str) {
        let mut processes = self.processes.lock().unwrap();
        if let Some(process) = processes.get_mut(agent_id) {
            process.add_output(&format!("Error: {}", error_msg));
            process.stop();
        }
    }
}

/// Errors from the mock process manager
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MockProcessError {
    SpawnFailed,
    NotFound,
    NotRunning,
}

impl std::fmt::Display for MockProcessError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::SpawnFailed => write!(f, "Failed to spawn process"),
            Self::NotFound => write!(f, "Process not found"),
            Self::NotRunning => write!(f, "Process is not running"),
        }
    }
}

impl std::error::Error for MockProcessError {}

/// Helper trait for asserting agent states
pub trait AgentAssertions {
    fn assert_running(&self);
    fn assert_idle(&self);
    fn assert_waiting(&self);
    fn assert_error(&self);
    fn assert_has_name(&self, name: &str);
    fn assert_has_mode(&self, mode: AgentMode);
}

impl AgentAssertions for Agent {
    fn assert_running(&self) {
        assert_eq!(self.status, AgentStatus::Running, "Expected agent to be running");
    }

    fn assert_idle(&self) {
        assert_eq!(self.status, AgentStatus::Idle, "Expected agent to be idle");
    }

    fn assert_waiting(&self) {
        assert_eq!(self.status, AgentStatus::Waiting, "Expected agent to be waiting");
    }

    fn assert_error(&self) {
        assert_eq!(self.status, AgentStatus::Error, "Expected agent to have error");
    }

    fn assert_has_name(&self, name: &str) {
        assert_eq!(self.name, name, "Expected agent name to be '{}'", name);
    }

    fn assert_has_mode(&self, mode: AgentMode) {
        assert_eq!(self.mode, mode, "Expected agent mode to be {:?}", mode);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mock_process_manager_spawn() {
        let pm = MockProcessManager::new();
        let pid = pm.spawn_agent(
            "test_agent",
            "/tmp",
            AgentMode::Regular,
            &[Permission::Read],
            None,
            None,
        ).unwrap();

        assert!(pid >= 10000);
        assert!(pm.is_running("test_agent"));
    }

    #[test]
    fn test_mock_process_manager_stop() {
        let pm = MockProcessManager::new();
        pm.spawn_agent(
            "test_agent",
            "/tmp",
            AgentMode::Regular,
            &[],
            None,
            None,
        ).unwrap();

        assert!(pm.is_running("test_agent"));

        pm.stop_agent("test_agent", false).unwrap();
        assert!(!pm.is_running("test_agent"));
    }

    #[test]
    fn test_mock_process_manager_spawn_fails() {
        let pm = MockProcessManager::new();
        pm.set_spawn_fails(true);

        let result = pm.spawn_agent(
            "test_agent",
            "/tmp",
            AgentMode::Regular,
            &[],
            None,
            None,
        );

        assert!(result.is_err());
    }
}
