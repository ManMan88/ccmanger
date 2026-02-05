import type {
  UsageStatsRepository,
  CreateUsageStatsDto,
} from '../db/repositories/usage-stats.repository.js'
import type { UsageStatsRow, UsagePeriod } from '@claude-manager/shared'
import { usageStatsRowToApi } from '@claude-manager/shared'
import { logger } from '../utils/logger.js'
import { getEventBroadcaster } from '../websocket/index.js'

// Default usage limits (can be configured)
const DEFAULT_DAILY_LIMIT = 500000 // tokens
const DEFAULT_WEEKLY_LIMIT = 2000000 // tokens

export interface UsageLimits {
  daily: number
  weekly: number
}

export interface CurrentUsage {
  daily: {
    used: number
    limit: number
    resetTime: string
  }
  weekly: {
    used: number
    limit: number
    resetTime: string
  }
}

export interface UsageHistoryQuery {
  period?: UsagePeriod
  start?: string
  end?: string
  limit?: number
}

export class UsageService {
  private limits: UsageLimits

  constructor(
    private usageStatsRepo: UsageStatsRepository,
    limits?: Partial<UsageLimits>
  ) {
    this.limits = {
      daily: limits?.daily ?? DEFAULT_DAILY_LIMIT,
      weekly: limits?.weekly ?? DEFAULT_WEEKLY_LIMIT,
    }
  }

  // Record new token usage
  recordUsage(inputTokens: number, outputTokens: number, model?: string, isError = false): void {
    const today = this.getTodayDate()

    // Update daily stats
    this.usageStatsRepo.incrementStats(today, 'daily', inputTokens, outputTokens, model, isError)

    // Update weekly stats
    const weekStart = this.getWeekStartDate()
    this.usageStatsRepo.incrementStats(
      weekStart,
      'weekly',
      inputTokens,
      outputTokens,
      model,
      isError
    )

    // Broadcast update
    this.broadcastUsageUpdate()

    logger.debug({ inputTokens, outputTokens, model, isError }, 'Recorded token usage')
  }

  // Get current usage with limits
  getCurrentUsage(): CurrentUsage {
    const todayStats = this.usageStatsRepo.getTodayStats()
    const weekStats = this.getWeeklyStats()

    const dailyUsed = todayStats?.total_tokens ?? 0
    const weeklyUsed = weekStats?.total_tokens ?? 0

    return {
      daily: {
        used: dailyUsed,
        limit: this.limits.daily,
        resetTime: this.getDailyResetTime(),
      },
      weekly: {
        used: weeklyUsed,
        limit: this.limits.weekly,
        resetTime: this.getWeeklyResetTime(),
      },
    }
  }

  // Get usage history
  getHistory(query: UsageHistoryQuery = {}): UsageStatsRow[] {
    return this.usageStatsRepo.findAll({
      period: query.period,
      startDate: query.start,
      endDate: query.end,
      limit: query.limit ?? 100,
    })
  }

  // Get today's stats
  getTodayStats(): UsageStatsRow | null {
    return this.usageStatsRepo.getTodayStats()
  }

  // Update usage limits
  setLimits(limits: Partial<UsageLimits>): void {
    if (limits.daily !== undefined) {
      this.limits.daily = limits.daily
    }
    if (limits.weekly !== undefined) {
      this.limits.weekly = limits.weekly
    }

    // Broadcast the updated limits
    this.broadcastUsageUpdate()

    logger.info({ limits: this.limits }, 'Usage limits updated')
  }

  // Get current limits
  getLimits(): UsageLimits {
    return { ...this.limits }
  }

  // Check if usage is within limits
  isWithinLimits(): { daily: boolean; weekly: boolean } {
    const current = this.getCurrentUsage()
    return {
      daily: current.daily.used < current.daily.limit,
      weekly: current.weekly.used < current.weekly.limit,
    }
  }

  // Manual upsert for usage stats (for imports/adjustments)
  upsertStats(dto: CreateUsageStatsDto): UsageStatsRow {
    const result = this.usageStatsRepo.upsert(dto)
    this.broadcastUsageUpdate()
    return result
  }

  // Clean up old stats
  cleanupOldStats(olderThanDays: number): number {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)
    const cutoffStr = cutoffDate.toISOString().split('T')[0]

    const deleted = this.usageStatsRepo.deleteOlderThan(cutoffStr)
    logger.info({ olderThanDays, deleted }, 'Cleaned up old usage stats')

    return deleted
  }

  // Broadcast usage update via WebSocket
  private broadcastUsageUpdate(): void {
    const broadcaster = getEventBroadcaster()
    if (!broadcaster) return

    const current = this.getCurrentUsage()
    broadcaster.broadcastUsageUpdate({
      daily: {
        used: current.daily.used,
        limit: current.daily.limit,
      },
      weekly: {
        used: current.weekly.used,
        limit: current.weekly.limit,
      },
    })
  }

  // Helper methods
  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0]
  }

  private getWeekStartDate(): string {
    const now = new Date()
    const dayOfWeek = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    return monday.toISOString().split('T')[0]
  }

  private getWeeklyStats(): UsageStatsRow | null {
    const weekStart = this.getWeekStartDate()
    return this.usageStatsRepo.findByDateAndPeriod(weekStart, 'weekly')
  }

  private getDailyResetTime(): string {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    return tomorrow.toISOString()
  }

  private getWeeklyResetTime(): string {
    const now = new Date()
    const dayOfWeek = now.getDay()
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
    const nextMonday = new Date(now)
    nextMonday.setDate(now.getDate() + daysUntilMonday)
    nextMonday.setHours(0, 0, 0, 0)
    return nextMonday.toISOString()
  }
}
