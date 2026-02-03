import { UsageStats } from '@/types/agent';
import { Progress } from '@/components/ui/progress';

interface UsageBarProps {
  stats: UsageStats;
}

export function UsageBar({ stats }: UsageBarProps) {
  const formatTimeUntil = (date: Date) => {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getPercentage = (used: number, limit: number) => {
    return Math.min(Math.round((used / limit) * 100), 100);
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-status-error';
    if (percentage >= 70) return 'bg-status-waiting';
    return 'bg-primary';
  };

  const dailyPct = getPercentage(stats.daily.used, stats.daily.limit);
  const weeklyPct = getPercentage(stats.weekly.used, stats.weekly.limit);
  const sonnetPct = getPercentage(stats.sonnetOnly.used, stats.sonnetOnly.limit);

  return (
    <div className="usage-bar gap-6">
      {/* Daily Usage */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col min-w-0">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Daily Reset</span>
          <span className="text-xs font-mono text-muted-foreground">{formatTimeUntil(stats.daily.resetTime)}</span>
        </div>
        <div className="flex items-center gap-2 min-w-[120px]">
          <Progress 
            value={dailyPct} 
            className="h-2 w-20"
          />
          <span className="text-xs font-mono font-medium w-10">{dailyPct}%</span>
        </div>
      </div>

      {/* Weekly Usage */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col min-w-0">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Weekly Reset</span>
          <span className="text-xs font-mono text-muted-foreground">{formatTimeUntil(stats.weekly.resetTime)}</span>
        </div>
        <div className="flex items-center gap-2 min-w-[120px]">
          <Progress 
            value={weeklyPct} 
            className="h-2 w-20"
          />
          <span className="text-xs font-mono font-medium w-10">{weeklyPct}%</span>
        </div>
      </div>

      {/* Sonnet Only Usage */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col min-w-0">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Sonnet Reset</span>
          <span className="text-xs font-mono text-muted-foreground">{formatTimeUntil(stats.sonnetOnly.resetTime)}</span>
        </div>
        <div className="flex items-center gap-2 min-w-[120px]">
          <Progress 
            value={sonnetPct} 
            className="h-2 w-20"
          />
          <span className="text-xs font-mono font-medium w-10">{sonnetPct}%</span>
        </div>
      </div>
    </div>
  );
}
