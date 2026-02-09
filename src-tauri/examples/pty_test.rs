//! Diagnostic: compare piped vs PTY output delivery from Claude CLI.
//!
//! Usage: cargo run --example pty_test
//!
//! This spawns `claude --print -p "say hello in one sentence"` two ways:
//! 1. With Stdio::piped() — expects block-buffered output (all at exit)
//! 2. With a PTY — expects line-buffered output (streams in real-time)

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::time::Instant;

fn main() {
    let cli = std::env::var("CLAUDE_CLI").unwrap_or_else(|_| "claude".to_string());
    let prompt = "Write a numbered list of 10 interesting facts about the Rust programming language. One fact per line.";

    println!("=== Piped mode ===");
    run_piped(&cli, prompt);

    println!("\n=== PTY mode ===");
    run_pty(&cli, prompt);
}

fn run_piped(cli: &str, prompt: &str) {
    let start = Instant::now();
    let child = Command::new(cli)
        .args(["--print", "-p", prompt])
        .env("FORCE_COLOR", "0")
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();

    let mut child = match child {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to spawn (piped): {e}");
            return;
        }
    };

    let stdout = child.stdout.take().unwrap();
    let reader = BufReader::new(stdout);
    for line in reader.lines().map_while(Result::ok) {
        let elapsed = start.elapsed();
        println!("[{elapsed:>8.3?}] {line}");
    }

    let status = child.wait().unwrap();
    println!("[{:>8.3?}] exited: {status}", start.elapsed());
}

fn run_pty(cli: &str, prompt: &str) {
    let start = Instant::now();
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("Failed to open PTY");

    let mut cmd = CommandBuilder::new(cli);
    cmd.args(["--print", "-p", prompt]);
    cmd.env("FORCE_COLOR", "0");
    cmd.env("NO_COLOR", "1");
    cmd.env("TERM", "dumb");

    let mut child = pair.slave.spawn_command(cmd).expect("Failed to spawn (pty)");
    drop(pair.slave);

    let reader = pair
        .master
        .try_clone_reader()
        .expect("Failed to clone reader");

    let buf_reader = BufReader::new(reader);
    for line in buf_reader.lines().map_while(Result::ok) {
        let elapsed = start.elapsed();
        println!("[{elapsed:>8.3?}] {line}");
    }

    let status = child.wait().unwrap();
    println!(
        "[{:>8.3?}] exited: success={}",
        start.elapsed(),
        status.success()
    );
}
