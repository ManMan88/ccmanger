import Database from 'better-sqlite3'
import type { WorkspaceRow } from '@claude-manager/shared'
import { BaseRepository } from './base.repository.js'

export interface CreateWorkspaceDto {
  name: string
  path: string
}

export interface UpdateWorkspaceDto {
  name?: string
  worktreeCount?: number
  agentCount?: number
}

export class WorkspaceRepository extends BaseRepository<WorkspaceRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  findById(id: string): WorkspaceRow | null {
    const stmt = this.db.prepare('SELECT * FROM workspaces WHERE id = ?')
    return stmt.get(id) as WorkspaceRow | null
  }

  findByPath(path: string): WorkspaceRow | null {
    const stmt = this.db.prepare('SELECT * FROM workspaces WHERE path = ?')
    return stmt.get(path) as WorkspaceRow | null
  }

  findAll(): WorkspaceRow[] {
    const stmt = this.db.prepare('SELECT * FROM workspaces ORDER BY updated_at DESC')
    return stmt.all() as WorkspaceRow[]
  }

  create(dto: CreateWorkspaceDto): WorkspaceRow {
    const id = this.generateId('ws')
    const now = this.now()

    const stmt = this.db.prepare(`
      INSERT INTO workspaces (id, name, path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    stmt.run(id, dto.name, dto.path, now, now)

    return this.findById(id)!
  }

  update(id: string, dto: UpdateWorkspaceDto): WorkspaceRow | null {
    const updates: string[] = []
    const params: unknown[] = []

    if (dto.name !== undefined) {
      updates.push('name = ?')
      params.push(dto.name)
    }
    if (dto.worktreeCount !== undefined) {
      updates.push('worktree_count = ?')
      params.push(dto.worktreeCount)
    }
    if (dto.agentCount !== undefined) {
      updates.push('agent_count = ?')
      params.push(dto.agentCount)
    }

    if (updates.length === 0) {
      return this.findById(id)
    }

    updates.push('updated_at = ?')
    params.push(this.now())
    params.push(id)

    const stmt = this.db.prepare(`
      UPDATE workspaces
      SET ${updates.join(', ')}
      WHERE id = ?
    `)
    stmt.run(...params)

    return this.findById(id)
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM workspaces WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  incrementWorktreeCount(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE workspaces
      SET worktree_count = worktree_count + 1, updated_at = ?
      WHERE id = ?
    `)
    stmt.run(this.now(), id)
  }

  decrementWorktreeCount(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE workspaces
      SET worktree_count = MAX(0, worktree_count - 1), updated_at = ?
      WHERE id = ?
    `)
    stmt.run(this.now(), id)
  }

  incrementAgentCount(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE workspaces
      SET agent_count = agent_count + 1, updated_at = ?
      WHERE id = ?
    `)
    stmt.run(this.now(), id)
  }

  decrementAgentCount(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE workspaces
      SET agent_count = MAX(0, agent_count - 1), updated_at = ?
      WHERE id = ?
    `)
    stmt.run(this.now(), id)
  }

  recalculateCounts(id: string): void {
    this.transaction(() => {
      const worktreeCount = this.db
        .prepare(
          `
        SELECT COUNT(*) as count FROM worktrees WHERE workspace_id = ?
      `
        )
        .get(id) as { count: number }

      const agentCount = this.db
        .prepare(
          `
        SELECT COUNT(*) as count FROM agents a
        JOIN worktrees w ON a.worktree_id = w.id
        WHERE w.workspace_id = ? AND a.deleted_at IS NULL
      `
        )
        .get(id) as { count: number }

      this.db
        .prepare(
          `
        UPDATE workspaces
        SET worktree_count = ?, agent_count = ?, updated_at = ?
        WHERE id = ?
      `
        )
        .run(worktreeCount.count, agentCount.count, this.now(), id)
    })
  }
}
