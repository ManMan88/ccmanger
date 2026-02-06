//! Database layer for Claude Manager
//!
//! This module provides database connection management, migrations,
//! and repository implementations for all data access.

pub mod connection;
pub mod migration_tool;
pub mod migrations;
pub mod repositories;

pub use connection::{init_database, DbError, DbPool, DbResult};
pub use migration_tool::{
    backup_database, migrate_from_nodejs, verify_migration, MigrationError, MigrationResult,
    MigrationStats,
};
pub use repositories::{
    AgentRepository, MessageRepository, UsageRepository, WorkspaceRepository, WorktreeRepository,
};
