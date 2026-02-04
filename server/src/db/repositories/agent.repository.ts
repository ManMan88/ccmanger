import Database from 'better-sqlite3'
import type { AgentRow, AgentStatus, AgentMode } from '@claude-manager/shared'
import { BaseRepository } from './base.repository.js'

export interface CreateAgentDto {
  worktreeId: string
  name: string
  mode?: AgentMode
  permissions?: string[]
  parentAgentId?: string
}

export interface UpdateAgentDto {
  name?: string
  status?: AgentStatus
  contextLevel?: number
  mode?: AgentMode
  permissions?: string[]
  pid?: number | null
  sessionId?: string | null
  startedAt?: string | null
  stoppedAt?: string | null
}

export interface AgentFilterOptions {
  worktreeId?: string
  status?: AgentStatus
  includeDeleted?: boolean
}

export class AgentRepository extends BaseRepository<AgentRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  findById(id: string): AgentRow | null {
    const stmt = this.db.prepare('SELECT * FROM agents WHERE id = ?')
    return stmt.get(id) as AgentRow | null
  }

  findByWorktreeId(worktreeId: string, includeDeleted = false): AgentRow[] {
    const query = includeDeleted
      ? 'SELECT * FROM agents WHERE worktree_id = ? ORDER BY display_order ASC'
      : 'SELECT * FROM agents WHERE worktree_id = ? AND deleted_at IS NULL ORDER BY display_order ASC'

    const stmt = this.db.prepare(query)
    return stmt.all(worktreeId) as AgentRow[]
  }

  findActive(): AgentRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM agents
      WHERE status IN ('running', 'waiting') AND deleted_at IS NULL
    `)
    return stmt.all() as AgentRow[]
  }

  findAll(options: AgentFilterOptions = {}): AgentRow[] {
    const conditions: string[] = []
    const params: unknown[] = []

    if (options.worktreeId) {
      conditions.push('worktree_id = ?')
      params.push(options.worktreeId)
    }

    if (options.status) {
      conditions.push('status = ?')
      params.push(options.status)
    }

    if (!options.includeDeleted) {
      conditions.push('deleted_at IS NULL')
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const stmt = this.db.prepare(`
      SELECT * FROM agents ${where} ORDER BY display_order ASC
    `)

    return stmt.all(...params) as AgentRow[]
  }

  findDeletedByWorktreeId(worktreeId: string): AgentRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM agents
      WHERE worktree_id = ? AND deleted_at IS NOT NULL
      ORDER BY deleted_at DESC
    `)
    return stmt.all(worktreeId) as AgentRow[]
  }

  create(dto: CreateAgentDto): AgentRow {
    const id = this.generateId('ag')
    const now = this.now()

    // Get next display order
    const maxOrder = this.db
      .prepare(
        `
      SELECT MAX(display_order) as max FROM agents WHERE worktree_id = ? AND deleted_at IS NULL
    `
      )
      .get(dto.worktreeId) as { max: number | null }

    const displayOrder = (maxOrder.max ?? -1) + 1
    const permissions = JSON.stringify(dto.permissions || ['read'])

    const stmt = this.db.prepare(`
      INSERT INTO agents (id, worktree_id, name, mode, permissions, display_order, parent_agent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      id,
      dto.worktreeId,
      dto.name,
      dto.mode || 'regular',
      permissions,
      displayOrder,
      dto.parentAgentId || null,
      now,
      now
    )

    return this.findById(id)!
  }

  update(id: string, dto: UpdateAgentDto): AgentRow | null {
    const updates: string[] = []
    const params: unknown[] = []

    if (dto.name !== undefined) {
      updates.push('name = ?')
      params.push(dto.name)
    }
    if (dto.status !== undefined) {
      updates.push('status = ?')
      params.push(dto.status)
    }
    if (dto.contextLevel !== undefined) {
      updates.push('context_level = ?')
      params.push(dto.contextLevel)
    }
    if (dto.mode !== undefined) {
      updates.push('mode = ?')
      params.push(dto.mode)
    }
    if (dto.permissions !== undefined) {
      updates.push('permissions = ?')
      params.push(JSON.stringify(dto.permissions))
    }
    if (dto.pid !== undefined) {
      updates.push('pid = ?')
      params.push(dto.pid)
    }
    if (dto.sessionId !== undefined) {
      updates.push('session_id = ?')
      params.push(dto.sessionId)
    }
    if (dto.startedAt !== undefined) {
      updates.push('started_at = ?')
      params.push(dto.startedAt)
    }
    if (dto.stoppedAt !== undefined) {
      updates.push('stopped_at = ?')
      params.push(dto.stoppedAt)
    }

    if (updates.length === 0) {
      return this.findById(id)
    }

    updates.push('updated_at = ?')
    params.push(this.now())
    params.push(id)

    const stmt = this.db.prepare(`
      UPDATE agents
      SET ${updates.join(', ')}
      WHERE id = ?
    `)
    stmt.run(...params)

    return this.findById(id)
  }

  softDelete(id: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE agents
      SET deleted_at = ?, status = 'finished', pid = NULL, updated_at = ?
      WHERE id = ?
    `)
    const now = this.now()
    const result = stmt.run(now, now, id)
    return result.changes > 0
  }

  hardDelete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM agents WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  restore(id: string): AgentRow | null {
    const stmt = this.db.prepare(`
      UPDATE agents
      SET deleted_at = NULL, status = 'waiting', updated_at = ?
      WHERE id = ?
    `)
    stmt.run(this.now(), id)
    return this.findById(id)
  }

  reorder(worktreeId: string, agentIds: string[]): void {
    const stmt = this.db.prepare(`
      UPDATE agents
      SET display_order = ?, updated_at = ?
      WHERE id = ? AND worktree_id = ?
    `)

    this.transaction(() => {
      const now = this.now()
      agentIds.forEach((id, index) => {
        stmt.run(index, now, id, worktreeId)
      })
    })
  }

  countByWorktreeId(worktreeId: string, includeDeleted = false): number {
    const query = includeDeleted
      ? 'SELECT COUNT(*) as count FROM agents WHERE worktree_id = ?'
      : 'SELECT COUNT(*) as count FROM agents WHERE worktree_id = ? AND deleted_at IS NULL'

    const result = this.db.prepare(query).get(worktreeId) as { count: number }
    return result.count
  }

  clearPidForRunningAgents(): number {
    const stmt = this.db.prepare(`
      UPDATE agents
      SET pid = NULL, status = 'error', updated_at = ?
      WHERE pid IS NOT NULL
    `)
    const result = stmt.run(this.now())
    return result.changes
  }
}
