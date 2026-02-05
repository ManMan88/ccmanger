//! Usage-related Tauri commands

use tauri::State;

use crate::types::{UsageHistoryResponse, UsageLimits, UsagePeriod, UsageStats, UsageSummary};
use crate::AppState;

/// Get current usage summary
#[tauri::command]
pub async fn get_usage(
    state: State<'_, AppState>,
) -> Result<UsageSummary, String> {
    state
        .usage_service
        .get_usage_summary()
        .map_err(|e| e.to_string())
}

/// Get usage history
#[tauri::command]
pub async fn get_usage_history(
    period: Option<String>,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<UsageHistoryResponse, String> {
    let period = period
        .map(|p| UsagePeriod::from_str(&p))
        .unwrap_or(UsagePeriod::Daily);

    state
        .usage_service
        .get_usage_history(period, limit.unwrap_or(30))
        .map(|history| UsageHistoryResponse { history, period })
        .map_err(|e| e.to_string())
}

/// Get today's usage
#[tauri::command]
pub async fn get_usage_today(
    state: State<'_, AppState>,
) -> Result<UsageStats, String> {
    state
        .usage_service
        .get_today_usage()
        .map_err(|e| e.to_string())
}

/// Get usage limits
#[tauri::command]
pub async fn get_usage_limits(
    state: State<'_, AppState>,
) -> Result<UsageLimits, String> {
    state
        .usage_service
        .get_usage_limits()
        .map_err(|e| e.to_string())
}
