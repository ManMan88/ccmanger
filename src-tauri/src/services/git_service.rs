//! Git service for interacting with git repositories

use git2::{BranchType, Repository, StatusOptions};
use std::path::Path;
use thiserror::Error;

use crate::types::{BranchInfo, GitStatusInfo};

#[derive(Error, Debug)]
pub enum GitError {
    #[error("Git error: {0}")]
    Git(#[from] git2::Error),
    #[error("Not a git repository: {0}")]
    NotARepo(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

/// Information about a worktree from git
#[derive(Debug, Clone)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub is_main: bool,
}

pub struct GitService;

impl GitService {
    /// Check if a path is a valid git repository
    pub fn is_valid_repository(path: &str) -> bool {
        Repository::open(path).is_ok()
    }

    /// Get the current branch name
    pub fn get_current_branch(path: &str) -> Result<String, GitError> {
        let repo = Repository::open(path)?;
        let head = repo.head()?;
        Ok(head.shorthand().unwrap_or("HEAD").to_string())
    }

    /// List all worktrees for a repository
    pub fn list_worktrees(path: &str) -> Result<Vec<WorktreeInfo>, GitError> {
        let repo = Repository::open(path)?;
        let mut worktrees = Vec::new();

        // Main worktree
        let main_path = repo
            .workdir()
            .ok_or_else(|| GitError::NotARepo("No workdir".to_string()))?
            .to_string_lossy()
            .to_string();

        worktrees.push(WorktreeInfo {
            path: main_path.trim_end_matches('/').to_string(),
            branch: Self::get_current_branch(path)?,
            is_main: true,
        });

        // Additional worktrees
        if let Ok(wt_names) = repo.worktrees() {
            for name in wt_names.iter().flatten() {
                if let Ok(wt) = repo.find_worktree(name) {
                    if let Some(wt_path) = wt.path().to_str() {
                        let branch = Self::get_current_branch(wt_path).unwrap_or_default();
                        worktrees.push(WorktreeInfo {
                            path: wt_path.to_string(),
                            branch,
                            is_main: false,
                        });
                    }
                }
            }
        }

        Ok(worktrees)
    }

    /// Add a new worktree
    pub fn add_worktree(
        repo_path: &str,
        worktree_path: &str,
        branch: &str,
        create_branch: bool,
    ) -> Result<WorktreeInfo, GitError> {
        let repo = Repository::open(repo_path)?;

        if create_branch {
            // Create branch from HEAD
            let head = repo.head()?.peel_to_commit()?;
            repo.branch(branch, &head, false)?;
        }

        // Find the branch reference
        let branch_ref = repo.find_branch(branch, BranchType::Local)?;
        let reference = branch_ref.into_reference();

        // Add worktree
        let worktree_name = Path::new(worktree_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("worktree");

        repo.worktree(
            worktree_name,
            Path::new(worktree_path),
            Some(git2::WorktreeAddOptions::new().reference(Some(&reference))),
        )?;

        Ok(WorktreeInfo {
            path: worktree_path.to_string(),
            branch: branch.to_string(),
            is_main: false,
        })
    }

    /// Remove a worktree
    pub fn remove_worktree(repo_path: &str, worktree_path: &str) -> Result<(), GitError> {
        let repo = Repository::open(repo_path)?;

        // Find worktree by path
        if let Ok(wt_names) = repo.worktrees() {
            for name in wt_names.iter().flatten() {
                if let Ok(wt) = repo.find_worktree(name) {
                    if wt.path().to_str() == Some(worktree_path) {
                        wt.prune(Some(
                            git2::WorktreePruneOptions::new()
                                .working_tree(true)
                                .valid(true),
                        ))?;

                        // Also remove the directory
                        if Path::new(worktree_path).exists() {
                            std::fs::remove_dir_all(worktree_path)?;
                        }

                        return Ok(());
                    }
                }
            }
        }

        Err(GitError::NotARepo(format!(
            "Worktree not found: {}",
            worktree_path
        )))
    }

    /// Checkout a branch
    pub fn checkout_branch(worktree_path: &str, branch: &str, create: bool) -> Result<(), GitError> {
        let repo = Repository::open(worktree_path)?;

        if create {
            let head = repo.head()?.peel_to_commit()?;
            repo.branch(branch, &head, false)?;
        }

        let obj = repo.revparse_single(&format!("refs/heads/{}", branch))?;
        repo.checkout_tree(&obj, None)?;
        repo.set_head(&format!("refs/heads/{}", branch))?;

        Ok(())
    }

    /// List branches
    pub fn list_branches(path: &str) -> Result<BranchInfo, GitError> {
        let repo = Repository::open(path)?;
        let mut local = Vec::new();
        let mut remote = Vec::new();

        for branch in repo.branches(None)? {
            let (branch, branch_type) = branch?;
            if let Some(name) = branch.name()? {
                match branch_type {
                    BranchType::Local => local.push(name.to_string()),
                    BranchType::Remote => {
                        // Strip "origin/" prefix
                        let stripped = name.strip_prefix("origin/").unwrap_or(name);
                        if stripped != "HEAD" {
                            remote.push(stripped.to_string());
                        }
                    }
                }
            }
        }

        let current = Self::get_current_branch(path)?;

        Ok(BranchInfo {
            local,
            remote,
            current,
        })
    }

    /// Get repository status
    pub fn get_status(path: &str) -> Result<GitStatusInfo, GitError> {
        let repo = Repository::open(path)?;
        let mut opts = StatusOptions::new();
        opts.include_untracked(true);

        let statuses = repo.statuses(Some(&mut opts))?;

        let mut modified = Vec::new();
        let mut staged = Vec::new();
        let mut untracked = Vec::new();

        for entry in statuses.iter() {
            let status = entry.status();
            let file_path = entry.path().unwrap_or_default().to_string();

            if status.is_wt_modified() || status.is_wt_deleted() {
                modified.push(file_path.clone());
            }
            if status.is_index_new() || status.is_index_modified() || status.is_index_deleted() {
                staged.push(file_path.clone());
            }
            if status.is_wt_new() {
                untracked.push(file_path);
            }
        }

        let is_clean = modified.is_empty() && staged.is_empty() && untracked.is_empty();

        // Calculate ahead/behind from upstream
        let (ahead, behind) = Self::get_ahead_behind(&repo).unwrap_or((0, 0));

        Ok(GitStatusInfo {
            is_clean,
            ahead,
            behind,
            modified,
            staged,
            untracked,
        })
    }

    /// Get ahead/behind counts from upstream
    fn get_ahead_behind(repo: &Repository) -> Result<(i32, i32), GitError> {
        let head = repo.head()?;

        if !head.is_branch() {
            return Ok((0, 0));
        }

        let branch_name = head.shorthand().unwrap_or("");
        let branch = repo.find_branch(branch_name, BranchType::Local)?;

        if let Ok(upstream) = branch.upstream() {
            let local_oid = head.target().ok_or_else(|| {
                git2::Error::from_str("No local target")
            })?;

            let upstream_oid = upstream.get().target().ok_or_else(|| {
                git2::Error::from_str("No upstream target")
            })?;

            let (ahead, behind) = repo.graph_ahead_behind(local_oid, upstream_oid)?;
            Ok((ahead as i32, behind as i32))
        } else {
            Ok((0, 0))
        }
    }
}
