//! Agent service benchmarks
//!
//! Run with: cargo bench --bench agent_benchmarks

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use tempfile::TempDir;

use claude_manager_lib::db::migrations;
use claude_manager_lib::db::DbPool;
use claude_manager_lib::services::{AgentService, ProcessManager};
use claude_manager_lib::types::{AgentMode, Permission};

static BENCH_COUNTER: AtomicUsize = AtomicUsize::new(0);

fn setup_test_environment() -> (DbPool, TempDir, String, String) {
    let temp_dir = tempfile::tempdir().expect("Failed to create temp dir");
    let counter = BENCH_COUNTER.fetch_add(1, Ordering::SeqCst);
    let db_path = temp_dir.path().join(format!("bench_db_{}.db", counter));

    let manager = SqliteConnectionManager::file(&db_path).with_init(|conn| {
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Ok(())
    });

    let pool = Pool::builder()
        .max_size(10)
        .build(manager)
        .expect("Failed to create pool");

    let conn = pool.get().expect("Failed to get connection");
    migrations::run_migrations(&conn).expect("Failed to run migrations");

    // Create workspace and worktree
    let workspace_id = format!("ws_bench_{}", counter);
    let worktree_id = format!("wt_bench_{}", counter);
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO workspaces (id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        rusqlite::params![&workspace_id, "Bench Workspace", temp_dir.path().to_str().unwrap(), &now, &now],
    )
    .expect("Failed to create workspace");

    conn.execute(
        "INSERT INTO worktrees (id, workspace_id, name, branch, path, sort_mode, display_order, is_main, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![&worktree_id, &workspace_id, "main", "main", temp_dir.path().to_str().unwrap(), "free", 0, 1, &now, &now],
    )
    .expect("Failed to create worktree");

    (pool, temp_dir, workspace_id, worktree_id)
}

fn bench_create_agent(c: &mut Criterion) {
    let (pool, _temp_dir, _, worktree_id) = setup_test_environment();
    let pm = Arc::new(ProcessManager::new("echo".to_string()));
    let service = AgentService::new(pool, pm);

    c.bench_function("create_agent", |b| {
        b.iter(|| {
            service
                .create_agent(
                    &worktree_id,
                    Some("Benchmark Agent".to_string()),
                    AgentMode::Regular,
                    vec![Permission::Read],
                )
                .expect("Should create agent")
        })
    });
}

fn bench_list_agents(c: &mut Criterion) {
    let (pool, _temp_dir, _, worktree_id) = setup_test_environment();
    let pm = Arc::new(ProcessManager::new("echo".to_string()));
    let service = AgentService::new(pool, pm);

    // Create some agents first
    for i in 0..100 {
        service
            .create_agent(
                &worktree_id,
                Some(format!("Agent {}", i)),
                AgentMode::Regular,
                vec![Permission::Read],
            )
            .expect("Should create agent");
    }

    c.bench_function("list_100_agents", |b| {
        b.iter(|| {
            service
                .list_agents(&worktree_id, false)
                .expect("Should list agents")
        })
    });
}

fn bench_get_agent(c: &mut Criterion) {
    let (pool, _temp_dir, _, worktree_id) = setup_test_environment();
    let pm = Arc::new(ProcessManager::new("echo".to_string()));
    let service = AgentService::new(pool, pm);

    let agent = service
        .create_agent(
            &worktree_id,
            Some("Test Agent".to_string()),
            AgentMode::Regular,
            vec![Permission::Read],
        )
        .expect("Should create agent");

    c.bench_function("get_agent", |b| {
        b.iter(|| service.get_agent(&agent.id).expect("Should get agent"))
    });
}

fn bench_update_agent(c: &mut Criterion) {
    let (pool, _temp_dir, _, worktree_id) = setup_test_environment();
    let pm = Arc::new(ProcessManager::new("echo".to_string()));
    let service = AgentService::new(pool, pm);

    let agent = service
        .create_agent(
            &worktree_id,
            Some("Test Agent".to_string()),
            AgentMode::Regular,
            vec![Permission::Read],
        )
        .expect("Should create agent");

    let mut counter = 0;
    c.bench_function("update_agent", |b| {
        b.iter(|| {
            counter += 1;
            service
                .update_agent(
                    &agent.id,
                    claude_manager_lib::types::UpdateAgentInput {
                        name: Some(format!("Updated Agent {}", counter)),
                        mode: None,
                        permissions: None,
                        display_order: None,
                    },
                )
                .expect("Should update agent")
        })
    });
}

fn bench_fork_agent(c: &mut Criterion) {
    let (pool, _temp_dir, _, worktree_id) = setup_test_environment();
    let pm = Arc::new(ProcessManager::new("echo".to_string()));
    let service = AgentService::new(pool, pm);

    let agent = service
        .create_agent(
            &worktree_id,
            Some("Parent Agent".to_string()),
            AgentMode::Auto,
            vec![Permission::Read, Permission::Write],
        )
        .expect("Should create agent");

    c.bench_function("fork_agent", |b| {
        b.iter(|| {
            service
                .fork_agent(&agent.id, None)
                .expect("Should fork agent")
        })
    });
}

fn bench_list_agents_scaling(c: &mut Criterion) {
    let mut group = c.benchmark_group("list_agents_scaling");

    for size in [10, 50, 100, 500].iter() {
        let (pool, _temp_dir, _, worktree_id) = setup_test_environment();
        let pm = Arc::new(ProcessManager::new("echo".to_string()));
        let service = AgentService::new(pool, pm);

        // Create agents
        for i in 0..*size {
            service
                .create_agent(
                    &worktree_id,
                    Some(format!("Agent {}", i)),
                    AgentMode::Regular,
                    vec![Permission::Read],
                )
                .expect("Should create agent");
        }

        group.bench_with_input(BenchmarkId::from_parameter(size), size, |b, _| {
            b.iter(|| {
                service
                    .list_agents(&worktree_id, false)
                    .expect("Should list agents")
            })
        });
    }

    group.finish();
}

criterion_group!(
    benches,
    bench_create_agent,
    bench_list_agents,
    bench_get_agent,
    bench_update_agent,
    bench_fork_agent,
    bench_list_agents_scaling,
);

criterion_main!(benches);
