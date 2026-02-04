import Database from 'better-sqlite3'
import type { UsageStatsRow, UsagePeriod } from '@claude-manager/shared'
import { BaseRepository } from './base.repository.js'

export interface CreateUsageStatsDto {
  date: string
  period: UsagePeriod
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  requestCount?: number
  errorCount?: number
  modelUsage?: Record<string, number>
}

export interface UpdateUsageStatsDto {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  requestCount?: number
  errorCount?: number
  modelUsage?: Record<string, number>
}

export interface UsageStatsQueryOptions {
  period?: UsagePeriod
  startDate?: string
  endDate?: string
  limit?: number
}

export class UsageStatsRepository extends BaseRepository<UsageStatsRow> {
  constructor(db: Database.Database) {
    super(db)
  }

  findById(id: number): UsageStatsRow | null {
    const stmt = this.db.prepare('SELECT * FROM usage_stats WHERE id = ?')
    return stmt.get(id) as UsageStatsRow | null
  }

  findByDateAndPeriod(date: string, period: UsagePeriod): UsageStatsRow | null {
    const stmt = this.db.prepare('SELECT * FROM usage_stats WHERE date = ? AND period = ?')
    return stmt.get(date, period) as UsageStatsRow | null
  }

  findAll(options: UsageStatsQueryOptions = {}): UsageStatsRow[] {
    const { period, startDate, endDate, limit = 100 } = options

    const conditions: string[] = []
    const params: unknown[] = []

    if (period) {
      conditions.push('period = ?')
      params.push(period)
    }
    if (startDate) {
      conditions.push('date >= ?')
      params.push(startDate)
    }
    if (endDate) {
      conditions.push('date <= ?')
      params.push(endDate)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const stmt = this.db.prepare(`
      SELECT * FROM usage_stats
      ${where}
      ORDER BY date DESC
      LIMIT ?
    `)
    params.push(limit)

    return stmt.all(...params) as UsageStatsRow[]
  }

  create(dto: CreateUsageStatsDto): UsageStatsRow {
    const now = this.now()

    const stmt = this.db.prepare(`
      INSERT INTO usage_stats (date, period, input_tokens, output_tokens, total_tokens, request_count, error_count, model_usage, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      dto.date,
      dto.period,
      dto.inputTokens || 0,
      dto.outputTokens || 0,
      dto.totalTokens || 0,
      dto.requestCount || 0,
      dto.errorCount || 0,
      dto.modelUsage ? JSON.stringify(dto.modelUsage) : null,
      now,
      now
    )

    return this.findById(result.lastInsertRowid as number)!
  }

  update(id: number, dto: UpdateUsageStatsDto): UsageStatsRow | null {
    const updates: string[] = []
    const params: unknown[] = []

    if (dto.inputTokens !== undefined) {
      updates.push('input_tokens = ?')
      params.push(dto.inputTokens)
    }
    if (dto.outputTokens !== undefined) {
      updates.push('output_tokens = ?')
      params.push(dto.outputTokens)
    }
    if (dto.totalTokens !== undefined) {
      updates.push('total_tokens = ?')
      params.push(dto.totalTokens)
    }
    if (dto.requestCount !== undefined) {
      updates.push('request_count = ?')
      params.push(dto.requestCount)
    }
    if (dto.errorCount !== undefined) {
      updates.push('error_count = ?')
      params.push(dto.errorCount)
    }
    if (dto.modelUsage !== undefined) {
      updates.push('model_usage = ?')
      params.push(JSON.stringify(dto.modelUsage))
    }

    if (updates.length === 0) {
      return this.findById(id)
    }

    updates.push('updated_at = ?')
    params.push(this.now())
    params.push(id)

    const stmt = this.db.prepare(`
      UPDATE usage_stats
      SET ${updates.join(', ')}
      WHERE id = ?
    `)
    stmt.run(...params)

    return this.findById(id)
  }

  upsert(dto: CreateUsageStatsDto): UsageStatsRow {
    const existing = this.findByDateAndPeriod(dto.date, dto.period)

    if (existing) {
      return this.update(existing.id, dto) as UsageStatsRow
    }

    return this.create(dto)
  }

  incrementStats(
    date: string,
    period: UsagePeriod,
    inputTokens: number,
    outputTokens: number,
    model?: string,
    isError = false
  ): UsageStatsRow {
    const existing = this.findByDateAndPeriod(date, period)

    if (existing) {
      const modelUsage = existing.model_usage
        ? (JSON.parse(existing.model_usage) as Record<string, number>)
        : {}

      if (model) {
        modelUsage[model] = (modelUsage[model] || 0) + inputTokens + outputTokens
      }

      const stmt = this.db.prepare(`
        UPDATE usage_stats
        SET input_tokens = input_tokens + ?,
            output_tokens = output_tokens + ?,
            total_tokens = total_tokens + ?,
            request_count = request_count + 1,
            error_count = error_count + ?,
            model_usage = ?,
            updated_at = ?
        WHERE id = ?
      `)
      stmt.run(
        inputTokens,
        outputTokens,
        inputTokens + outputTokens,
        isError ? 1 : 0,
        JSON.stringify(modelUsage),
        this.now(),
        existing.id
      )

      return this.findById(existing.id)!
    }

    const modelUsage: Record<string, number> = {}
    if (model) {
      modelUsage[model] = inputTokens + outputTokens
    }

    return this.create({
      date,
      period,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      requestCount: 1,
      errorCount: isError ? 1 : 0,
      modelUsage: Object.keys(modelUsage).length > 0 ? modelUsage : undefined,
    })
  }

  getTodayStats(): UsageStatsRow | null {
    const today = new Date().toISOString().split('T')[0]
    return this.findByDateAndPeriod(today, 'daily')
  }

  getWeekStats(): UsageStatsRow[] {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 7)

    return this.findAll({
      period: 'daily',
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    })
  }

  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM usage_stats WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  deleteOlderThan(date: string): number {
    const stmt = this.db.prepare('DELETE FROM usage_stats WHERE date < ?')
    const result = stmt.run(date)
    return result.changes
  }
}
