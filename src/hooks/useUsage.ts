import { useQuery } from '@tanstack/react-query'
import { api, type UsageSummary } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'

/**
 * Hook for fetching current usage statistics
 */
export function useUsage() {
  const usageQuery = useQuery({
    queryKey: queryKeys.usage.current,
    queryFn: () => api.usage.get(),
    refetchInterval: 60000, // Refetch every minute
  })

  return {
    stats: usageQuery.data ?? null,
    isLoading: usageQuery.isLoading,
    isError: usageQuery.isError,
    error: usageQuery.error,
    refetch: usageQuery.refetch,
  }
}

/**
 * Hook for fetching today's detailed usage stats
 */
export function useTodayUsage() {
  const todayQuery = useQuery({
    queryKey: queryKeys.usage.today,
    queryFn: () => api.usage.getToday(),
    refetchInterval: 60000, // Refetch every minute
  })

  return {
    stats: todayQuery.data ?? null,
    isLoading: todayQuery.isLoading,
    isError: todayQuery.isError,
    error: todayQuery.error,
  }
}

/**
 * Hook for fetching usage limits
 */
export function useUsageLimits() {
  const limitsQuery = useQuery({
    queryKey: queryKeys.usage.limits,
    queryFn: () => api.usage.getLimits(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  return {
    limits: limitsQuery.data ?? null,
    isLoading: limitsQuery.isLoading,
    isError: limitsQuery.isError,
  }
}

/**
 * Hook for fetching usage history
 */
export function useUsageHistory(
  period: 'daily' | 'weekly' | 'monthly',
  start?: string,
  end?: string
) {
  const historyQuery = useQuery({
    queryKey: queryKeys.usage.history(period),
    queryFn: () => api.usage.getHistory(period, start, end),
    select: (data) => data.history,
  })

  return {
    history: historyQuery.data ?? [],
    isLoading: historyQuery.isLoading,
    isError: historyQuery.isError,
    error: historyQuery.error,
  }
}

/**
 * Convert usage summary to the format expected by UsageBar component
 */
export function formatUsageForDisplay(stats: UsageSummary | null) {
  if (!stats) {
    return {
      daily: { used: 0, limit: 100, resetTime: new Date() },
      weekly: { used: 0, limit: 100, resetTime: new Date() },
      sonnetOnly: { used: 0, limit: 100, resetTime: new Date() },
    }
  }

  return {
    daily: {
      used: stats.daily.used,
      limit: stats.daily.limit,
      resetTime: new Date(stats.daily.resetTime),
    },
    weekly: {
      used: stats.weekly.used,
      limit: stats.weekly.limit,
      resetTime: new Date(stats.weekly.resetTime),
    },
    sonnetOnly: {
      used: stats.sonnetOnly.used,
      limit: stats.sonnetOnly.limit,
      resetTime: new Date(stats.sonnetOnly.resetTime),
    },
  }
}
