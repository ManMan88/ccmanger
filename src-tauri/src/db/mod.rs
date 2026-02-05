//! Database layer for Claude Manager
//!
//! This module provides database connection management, migrations,
//! and repository implementations for all data access.

pub mod connection;
pub mod migrations;
pub mod repositories;

pub use connection::{init_database, DbError, DbPool, DbResult};
pub use repositories::{
    AgentRepository, MessageRepository, UsageRepository, WorkspaceRepository, WorktreeRepository,
};
