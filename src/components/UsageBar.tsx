import { UsageStats } from '@/types/agent';

interface UsageBarProps {
  stats: UsageStats;
}

export function UsageBar({ stats }: UsageBarProps) {
  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <div className="usage-bar">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Input:</span>
          <span className="text-xs font-mono">{formatNumber(stats.inputTokens)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Output:</span>
          <span className="text-xs font-mono">{formatNumber(stats.outputTokens)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Cache Read:</span>
          <span className="text-xs font-mono">{formatNumber(stats.cacheReadTokens)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Cache Write:</span>
          <span className="text-xs font-mono">{formatNumber(stats.cacheWriteTokens)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Total Cost:</span>
        <span className="text-sm font-semibold text-primary">
          ${stats.totalCost.toFixed(4)}
        </span>
      </div>
    </div>
  );
}
