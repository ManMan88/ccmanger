//! Usage service for tracking API usage statistics

use thiserror::Error;

use crate::db::{DbPool, UsageRepository};
use crate::types::{UsageLimits, UsagePeriod, UsageStats, UsageSummary};

#[derive(Error, Debug)]
pub enum UsageError {
    #[error("Database error: {0}")]
    Database(String),
}

pub struct UsageService {
    usage_repo: UsageRepository,
}

impl UsageService {
    pub fn new(pool: DbPool) -> Self {
        Self {
            usage_repo: UsageRepository::new(pool),
        }
    }

    /// Get current usage summary
    pub fn get_usage_summary(&self) -> Result<UsageSummary, UsageError> {
        let today = self
            .usage_repo
            .get_or_create_today()
            .map_err(|e| UsageError::Database(e.to_string()))?;

        let this_week = self
            .usage_repo
            .get_current_period(UsagePeriod::Weekly)
            .map_err(|e| UsageError::Database(e.to_string()))?;

        let this_month = self
            .usage_repo
            .get_current_period(UsagePeriod::Monthly)
            .map_err(|e| UsageError::Database(e.to_string()))?;

        Ok(UsageSummary {
            today,
            this_week,
            this_month,
        })
    }

    /// Get usage history
    pub fn get_usage_history(
        &self,
        period: UsagePeriod,
        limit: usize,
    ) -> Result<Vec<UsageStats>, UsageError> {
        self.usage_repo
            .get_history(period, limit)
            .map_err(|e| UsageError::Database(e.to_string()))
    }

    /// Get today's usage
    pub fn get_today_usage(&self) -> Result<UsageStats, UsageError> {
        self.usage_repo
            .get_or_create_today()
            .map_err(|e| UsageError::Database(e.to_string()))
    }

    /// Get usage limits
    pub fn get_usage_limits(&self) -> Result<UsageLimits, UsageError> {
        // For now, return default limits
        // In the future, this could be stored in settings
        Ok(UsageLimits {
            daily_token_limit: Some(1_000_000),
            weekly_token_limit: Some(5_000_000),
            monthly_token_limit: Some(20_000_000),
            daily_request_limit: Some(1000),
        })
    }

    /// Record usage from an API call
    pub fn record_usage(
        &self,
        input_tokens: i64,
        output_tokens: i64,
        is_error: bool,
    ) -> Result<(), UsageError> {
        self.usage_repo
            .increment_usage(input_tokens, output_tokens, is_error)
            .map_err(|e| UsageError::Database(e.to_string()))
    }
}
