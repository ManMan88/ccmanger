//! Usage statistics type definitions

use serde::{Deserialize, Serialize};

/// Usage period enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UsagePeriod {
    Daily,
    Weekly,
    Monthly,
}

impl UsagePeriod {
    pub fn as_str(&self) -> &'static str {
        match self {
            UsagePeriod::Daily => "daily",
            UsagePeriod::Weekly => "weekly",
            UsagePeriod::Monthly => "monthly",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "weekly" => UsagePeriod::Weekly,
            "monthly" => UsagePeriod::Monthly,
            _ => UsagePeriod::Daily,
        }
    }
}

/// Database row representation for usage stats
#[derive(Debug, Clone)]
pub struct UsageStatsRow {
    pub id: i64,
    pub date: String,
    pub period: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub request_count: i64,
    pub error_count: i64,
    pub model_usage: Option<String>, // JSON
    pub created_at: String,
    pub updated_at: String,
}

/// API representation for usage stats
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageStats {
    pub id: i64,
    pub date: String,
    pub period: UsagePeriod,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub request_count: i64,
    pub error_count: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_usage: Option<serde_json::Value>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<UsageStatsRow> for UsageStats {
    fn from(row: UsageStatsRow) -> Self {
        UsageStats {
            id: row.id,
            date: row.date,
            period: UsagePeriod::from_str(&row.period),
            input_tokens: row.input_tokens,
            output_tokens: row.output_tokens,
            total_tokens: row.total_tokens,
            request_count: row.request_count,
            error_count: row.error_count,
            model_usage: row.model_usage.and_then(|s| serde_json::from_str(&s).ok()),
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

/// Current usage summary
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub today: UsageStats,
    pub this_week: UsageStats,
    pub this_month: UsageStats,
}

/// Usage limits configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageLimits {
    pub daily_token_limit: Option<i64>,
    pub weekly_token_limit: Option<i64>,
    pub monthly_token_limit: Option<i64>,
    pub daily_request_limit: Option<i64>,
}

/// Response for usage history
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageHistoryResponse {
    pub history: Vec<UsageStats>,
    pub period: UsagePeriod,
}
