import simpleGit, { SimpleGit } from 'simple-git'
import { logger } from '../utils/logger.js'
import { AppError } from '../utils/errors.js'

export class GitError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 500, 'GIT_ERROR')
    if (details) {
      logger.error({ ...details }, message)
    }
  }
}

export interface WorktreeInfo {
  path: string
  branch: string
  isMain: boolean
}

export interface BranchInfo {
  local: string[]
  remote: string[]
  current: string
}

export class GitService {
  private git: SimpleGit

  constructor(repoPath: string) {
    this.git = simpleGit(repoPath)
  }

  async isValidRepository(): Promise<boolean> {
    try {
      await this.git.revparse(['--git-dir'])
      return true
    } catch {
      return false
    }
  }

  async getCurrentBranch(): Promise<string> {
    try {
      const branch = await this.git.revparse(['--abbrev-ref', 'HEAD'])
      return branch.trim()
    } catch (err) {
      throw new GitError('Failed to get current branch', { error: String(err) })
    }
  }

  async listWorktrees(): Promise<WorktreeInfo[]> {
    try {
      const raw = await this.git.raw(['worktree', 'list', '--porcelain'])
      const worktrees: WorktreeInfo[] = []
      let current: Partial<WorktreeInfo> = {}

      for (const line of raw.split('\n')) {
        if (line.startsWith('worktree ')) {
          current.path = line.substring(9)
        } else if (line.startsWith('branch ')) {
          current.branch = line.substring(7).replace('refs/heads/', '')
        } else if (line.startsWith('HEAD ')) {
          // Detached HEAD state - use commit hash
          if (!current.branch) {
            current.branch = line.substring(5).substring(0, 8)
          }
        } else if (line === '') {
          if (current.path) {
            worktrees.push({
              path: current.path,
              branch: current.branch || 'HEAD',
              isMain: worktrees.length === 0,
            })
          }
          current = {}
        }
      }

      // Handle last entry if no trailing newline
      if (current.path) {
        worktrees.push({
          path: current.path,
          branch: current.branch || 'HEAD',
          isMain: worktrees.length === 0,
        })
      }

      return worktrees
    } catch (err) {
      throw new GitError('Failed to list worktrees', { error: String(err) })
    }
  }

  async addWorktree(worktreePath: string, branch: string, createBranch: boolean): Promise<void> {
    try {
      const args = ['worktree', 'add']

      if (createBranch) {
        args.push('-b', branch, worktreePath)
      } else {
        args.push(worktreePath, branch)
      }

      await this.git.raw(args)
      logger.info({ path: worktreePath, branch, createBranch }, 'Worktree created')
    } catch (err) {
      throw new GitError(`Failed to create worktree: ${err}`, {
        path: worktreePath,
        branch,
        error: String(err),
      })
    }
  }

  async removeWorktree(worktreePath: string, force = false): Promise<void> {
    try {
      const args = ['worktree', 'remove']
      if (force) {
        args.push('--force')
      }
      args.push(worktreePath)

      await this.git.raw(args)
      logger.info({ path: worktreePath, force }, 'Worktree removed')
    } catch (err) {
      throw new GitError(`Failed to remove worktree: ${err}`, {
        path: worktreePath,
        error: String(err),
      })
    }
  }

  async checkout(branch: string, createBranch = false): Promise<void> {
    try {
      if (createBranch) {
        await this.git.checkoutLocalBranch(branch)
      } else {
        await this.git.checkout(branch)
      }
      logger.info({ branch, createBranch }, 'Branch checked out')
    } catch (err) {
      throw new GitError(`Failed to checkout branch: ${err}`, {
        branch,
        error: String(err),
      })
    }
  }

  async listBranches(): Promise<BranchInfo> {
    try {
      const local = await this.git.branchLocal()
      const remote = await this.git.branch(['-r'])

      return {
        local: local.all,
        remote: remote.all.map((b) => b.replace('origin/', '')),
        current: local.current,
      }
    } catch (err) {
      throw new GitError('Failed to list branches', { error: String(err) })
    }
  }

  async getStatus(): Promise<{
    isClean: boolean
    ahead: number
    behind: number
    modified: string[]
    staged: string[]
    untracked: string[]
  }> {
    try {
      const status = await this.git.status()
      return {
        isClean: status.isClean(),
        ahead: status.ahead,
        behind: status.behind,
        modified: status.modified,
        staged: status.staged,
        untracked: status.not_added,
      }
    } catch (err) {
      throw new GitError('Failed to get status', { error: String(err) })
    }
  }

  async pull(): Promise<void> {
    try {
      await this.git.pull()
      logger.info('Pull completed')
    } catch (err) {
      throw new GitError('Failed to pull', { error: String(err) })
    }
  }

  async fetch(): Promise<void> {
    try {
      await this.git.fetch()
      logger.info('Fetch completed')
    } catch (err) {
      throw new GitError('Failed to fetch', { error: String(err) })
    }
  }
}
