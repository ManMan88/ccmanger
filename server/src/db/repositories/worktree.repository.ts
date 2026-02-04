import Database from 'better-sqlite3'
import type { WorktreeRow, SortMode } from '@claude-manager/shared'
import { BaseRepository } from './base.repository.js'

export interface CreateWorktreeDto {
  workspaceId: string
  name: string
  branch: string
  path: string
  isMain?: boolean
}

export interface UpdateWorktreeDto {
  name?: string
  branch?: string
  sortMode?: SortMode
  displayOrder?: number
}

export class WorktreeRepository extends BaseRepository<WorktreeRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  findById(id: string): WorktreeRow | null {
    const stmt = this.db.prepare('SELECT * FROM worktrees WHERE id = ?')
    return stmt.get(id) as WorktreeRow | null
  }

  findByPath(path: string): WorktreeRow | null {
    const stmt = this.db.prepare('SELECT * FROM worktrees WHERE path = ?')
    return stmt.get(path) as WorktreeRow | null
  }

  findByWorkspaceId(workspaceId: string): WorktreeRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM worktrees
      WHERE workspace_id = ?
      ORDER BY display_order ASC
    `)
    return stmt.all(workspaceId) as WorktreeRow[]
  }

  findMainWorktree(workspaceId: string): WorktreeRow | null {
    const stmt = this.db.prepare(`
      SELECT * FROM worktrees
      WHERE workspace_id = ? AND is_main = 1
    `)
    return stmt.get(workspaceId) as WorktreeRow | null
  }

  create(dto: CreateWorktreeDto): WorktreeRow {
    const id = this.generateId('wt')
    const now = this.now()

    // Get next display order
    const maxOrder = this.db
      .prepare(
        `
      SELECT MAX(display_order) as max FROM worktrees WHERE workspace_id = ?
    `
      )
      .get(dto.workspaceId) as { max: number | null }

    const displayOrder = (maxOrder.max ?? -1) + 1

    const stmt = this.db.prepare(`
      INSERT INTO worktrees (id, workspace_id, name, branch, path, display_order, is_main, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      id,
      dto.workspaceId,
      dto.name,
      dto.branch,
      dto.path,
      displayOrder,
      dto.isMain ? 1 : 0,
      now,
      now
    )

    return this.findById(id)!
  }

  update(id: string, dto: UpdateWorktreeDto): WorktreeRow | null {
    const updates: string[] = []
    const params: unknown[] = []

    if (dto.name !== undefined) {
      updates.push('name = ?')
      params.push(dto.name)
    }
    if (dto.branch !== undefined) {
      updates.push('branch = ?')
      params.push(dto.branch)
    }
    if (dto.sortMode !== undefined) {
      updates.push('sort_mode = ?')
      params.push(dto.sortMode)
    }
    if (dto.displayOrder !== undefined) {
      updates.push('display_order = ?')
      params.push(dto.displayOrder)
    }

    if (updates.length === 0) {
      return this.findById(id)
    }

    updates.push('updated_at = ?')
    params.push(this.now())
    params.push(id)

    const stmt = this.db.prepare(`
      UPDATE worktrees
      SET ${updates.join(', ')}
      WHERE id = ?
    `)
    stmt.run(...params)

    return this.findById(id)
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM worktrees WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  reorder(workspaceId: string, worktreeIds: string[]): void {
    const stmt = this.db.prepare(`
      UPDATE worktrees
      SET display_order = ?, updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `)

    this.transaction(() => {
      const now = this.now()
      worktreeIds.forEach((id, index) => {
        stmt.run(index, now, id, workspaceId)
      })
    })
  }

  existsWithNameInWorkspace(workspaceId: string, name: string, excludeId?: string): boolean {
    let stmt
    if (excludeId) {
      stmt = this.db.prepare(`
        SELECT 1 FROM worktrees WHERE workspace_id = ? AND name = ? AND id != ? LIMIT 1
      `)
      return stmt.get(workspaceId, name, excludeId) !== undefined
    }
    stmt = this.db.prepare(`
      SELECT 1 FROM worktrees WHERE workspace_id = ? AND name = ? LIMIT 1
    `)
    return stmt.get(workspaceId, name) !== undefined
  }
}
