import Database from 'better-sqlite3'
import type { MessageRow, MessageRole } from '@claude-manager/shared'
import { BaseRepository } from './base.repository.js'

export interface CreateMessageDto {
  agentId: string
  role: MessageRole
  content: string
  tokenCount?: number
  toolName?: string
  toolInput?: unknown
  toolOutput?: unknown
  isComplete?: boolean
}

export interface UpdateMessageDto {
  content?: string
  tokenCount?: number
  toolOutput?: unknown
  isComplete?: boolean
}

export interface MessageQueryOptions {
  limit?: number
  offset?: number
  beforeId?: string
  role?: MessageRole
}

export class MessageRepository extends BaseRepository<MessageRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  findById(id: string): MessageRow | null {
    const stmt = this.db.prepare('SELECT * FROM messages WHERE id = ?')
    return stmt.get(id) as MessageRow | null
  }

  findByAgentId(agentId: string, options: MessageQueryOptions = {}): MessageRow[] {
    const { limit = 100, offset = 0, beforeId, role } = options

    const conditions: string[] = ['agent_id = ?']
    const params: unknown[] = [agentId]

    if (beforeId) {
      const beforeMsg = this.findById(beforeId)
      if (beforeMsg) {
        conditions.push('created_at < ?')
        params.push(beforeMsg.created_at)
      }
    }

    if (role) {
      conditions.push('role = ?')
      params.push(role)
    }

    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `)
    params.push(limit, offset)

    const rows = stmt.all(...params) as MessageRow[]
    return rows.reverse() // Return in chronological order
  }

  create(dto: CreateMessageDto): MessageRow {
    const id = this.generateId('msg')
    const now = this.now()

    const stmt = this.db.prepare(`
      INSERT INTO messages (id, agent_id, role, content, token_count, tool_name, tool_input, tool_output, is_complete, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      id,
      dto.agentId,
      dto.role,
      dto.content,
      dto.tokenCount || null,
      dto.toolName || null,
      dto.toolInput ? JSON.stringify(dto.toolInput) : null,
      dto.toolOutput ? JSON.stringify(dto.toolOutput) : null,
      dto.isComplete !== false ? 1 : 0,
      now
    )

    return this.findById(id)!
  }

  update(id: string, dto: UpdateMessageDto): MessageRow | null {
    const updates: string[] = []
    const params: unknown[] = []

    if (dto.content !== undefined) {
      updates.push('content = ?')
      params.push(dto.content)
    }
    if (dto.tokenCount !== undefined) {
      updates.push('token_count = ?')
      params.push(dto.tokenCount)
    }
    if (dto.toolOutput !== undefined) {
      updates.push('tool_output = ?')
      params.push(JSON.stringify(dto.toolOutput))
    }
    if (dto.isComplete !== undefined) {
      updates.push('is_complete = ?')
      params.push(dto.isComplete ? 1 : 0)
    }

    if (updates.length === 0) {
      return this.findById(id)
    }

    params.push(id)

    const stmt = this.db.prepare(`
      UPDATE messages
      SET ${updates.join(', ')}
      WHERE id = ?
    `)
    stmt.run(...params)

    return this.findById(id)
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM messages WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  deleteByAgentId(agentId: string): number {
    const stmt = this.db.prepare('DELETE FROM messages WHERE agent_id = ?')
    const result = stmt.run(agentId)
    return result.changes
  }

  countByAgentId(agentId: string): number {
    const result = this.db
      .prepare('SELECT COUNT(*) as count FROM messages WHERE agent_id = ?')
      .get(agentId) as { count: number }
    return result.count
  }

  getLastMessage(agentId: string): MessageRow | null {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE agent_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
    return stmt.get(agentId) as MessageRow | null
  }

  getIncompleteMessages(agentId: string): MessageRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE agent_id = ? AND is_complete = 0
      ORDER BY created_at ASC
    `)
    return stmt.all(agentId) as MessageRow[]
  }

  appendContent(id: string, content: string): MessageRow | null {
    const stmt = this.db.prepare(`
      UPDATE messages
      SET content = content || ?
      WHERE id = ?
    `)
    stmt.run(content, id)
    return this.findById(id)
  }

  getTotalTokenCount(agentId: string): number {
    const result = this.db
      .prepare(
        `
      SELECT COALESCE(SUM(token_count), 0) as total
      FROM messages
      WHERE agent_id = ?
    `
      )
      .get(agentId) as { total: number }
    return result.total
  }
}
