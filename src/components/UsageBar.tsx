import { Progress } from '@/components/ui/progress'
import { Loader2 } from 'lucide-react'

// Usage stats type compatible with the hook output
interface UsageLimit {
  used: number
  limit: number
  resetTime: Date
}

interface UsageStats {
  daily: UsageLimit
  weekly: UsageLimit
  sonnetOnly: UsageLimit
}

interface UsageBarProps {
  stats: UsageStats
  isLoading?: boolean
}

export function UsageBar({ stats, isLoading }: UsageBarProps) {
  const formatTimeUntil = (date: Date) => {
    const now = new Date()
    const diff = date.getTime() - now.getTime()

    if (diff < 0) {
      return 'now'
    }

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (hours > 24) {
      const days = Math.floor(hours / 24)
      return `${days}d ${hours % 24}h`
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  const getPercentage = (used: number, limit: number) => {
    if (limit === 0) return 0
    return Math.min(Math.round((used / limit) * 100), 100)
  }

  const dailyPct = getPercentage(stats.daily.used, stats.daily.limit)
  const weeklyPct = getPercentage(stats.weekly.used, stats.weekly.limit)
  const sonnetPct = getPercentage(stats.sonnetOnly.used, stats.sonnetOnly.limit)

  if (isLoading) {
    return (
      <div className="usage-bar gap-6" data-testid="usage-bar">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Loading usage...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="usage-bar gap-6" data-testid="usage-bar">
      {/* Daily Usage */}
      <div className="flex min-w-0 items-center gap-3" data-testid="usage-daily">
        <div className="flex min-w-0 flex-col">
          <span className="whitespace-nowrap text-xs text-muted-foreground">Daily Reset</span>
          <span className="font-mono text-xs text-muted-foreground">
            {formatTimeUntil(stats.daily.resetTime)}
          </span>
        </div>
        <div className="flex min-w-[120px] items-center gap-2">
          <Progress value={dailyPct} className="h-2 w-20" />
          <span className="w-10 font-mono text-xs font-medium">{dailyPct}%</span>
        </div>
      </div>

      {/* Weekly Usage */}
      <div className="flex min-w-0 items-center gap-3" data-testid="usage-weekly">
        <div className="flex min-w-0 flex-col">
          <span className="whitespace-nowrap text-xs text-muted-foreground">Weekly Reset</span>
          <span className="font-mono text-xs text-muted-foreground">
            {formatTimeUntil(stats.weekly.resetTime)}
          </span>
        </div>
        <div className="flex min-w-[120px] items-center gap-2">
          <Progress value={weeklyPct} className="h-2 w-20" />
          <span className="w-10 font-mono text-xs font-medium">{weeklyPct}%</span>
        </div>
      </div>

      {/* Sonnet Only Usage */}
      <div className="flex min-w-0 items-center gap-3" data-testid="usage-sonnet">
        <div className="flex min-w-0 flex-col">
          <span className="whitespace-nowrap text-xs text-muted-foreground">Sonnet Reset</span>
          <span className="font-mono text-xs text-muted-foreground">
            {formatTimeUntil(stats.sonnetOnly.resetTime)}
          </span>
        </div>
        <div className="flex min-w-[120px] items-center gap-2">
          <Progress value={sonnetPct} className="h-2 w-20" />
          <span className="w-10 font-mono text-xs font-medium">{sonnetPct}%</span>
        </div>
      </div>
    </div>
  )
}
