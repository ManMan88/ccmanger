//! Claude API service for fetching usage data from Anthropic's API

use std::path::PathBuf;
use thiserror::Error;

use crate::types::{
    ClaudeApiUsageResponse, ClaudeCredentials, ClaudeUsageSummary, UsageLimitEntry,
};

const CLAUDE_USAGE_API: &str = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_CODE_VERSION: &str = "2.1.29";

#[derive(Error, Debug)]
pub enum ClaudeApiError {
    #[error("Credentials not found: {0}")]
    CredentialsNotFound(String),
    #[error("Invalid credentials format: {0}")]
    InvalidCredentials(String),
    #[error("API request failed: {0}")]
    RequestFailed(String),
    #[error("Failed to parse response: {0}")]
    ParseError(String),
}

pub struct ClaudeApiService {
    client: reqwest::Client,
}

impl ClaudeApiService {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }

    /// Get the path to Claude credentials file
    fn credentials_path() -> Result<PathBuf, ClaudeApiError> {
        dirs::home_dir()
            .map(|h| h.join(".claude").join(".credentials.json"))
            .ok_or_else(|| ClaudeApiError::CredentialsNotFound("Cannot find home directory".into()))
    }

    /// Read and parse Claude credentials
    fn read_credentials() -> Result<ClaudeCredentials, ClaudeApiError> {
        let path = Self::credentials_path()?;

        if !path.exists() {
            return Err(ClaudeApiError::CredentialsNotFound(format!(
                "Credentials file not found at {:?}",
                path
            )));
        }

        let content = std::fs::read_to_string(&path).map_err(|e| {
            ClaudeApiError::CredentialsNotFound(format!("Failed to read credentials: {}", e))
        })?;

        serde_json::from_str(&content).map_err(|e| {
            ClaudeApiError::InvalidCredentials(format!("Failed to parse credentials: {}", e))
        })
    }

    /// Get access token from credentials
    fn get_access_token() -> Result<String, ClaudeApiError> {
        let creds = Self::read_credentials()?;

        creds
            .claude_ai_oauth
            .map(|oauth| oauth.access_token)
            .ok_or_else(|| {
                ClaudeApiError::InvalidCredentials("No OAuth credentials found".into())
            })
    }

    /// Fetch usage data from Claude API
    pub async fn fetch_usage(&self) -> Result<ClaudeUsageSummary, ClaudeApiError> {
        let token = Self::get_access_token()?;

        let response = self
            .client
            .get(CLAUDE_USAGE_API)
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .header("User-Agent", format!("claude-code/{}", CLAUDE_CODE_VERSION))
            .header("Authorization", format!("Bearer {}", token))
            .header("anthropic-beta", "oauth-2025-04-20")
            .send()
            .await
            .map_err(|e| ClaudeApiError::RequestFailed(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(ClaudeApiError::RequestFailed(format!(
                "API returned {}: {}",
                status, body
            )));
        }

        let api_response: ClaudeApiUsageResponse = response
            .json()
            .await
            .map_err(|e| ClaudeApiError::ParseError(e.to_string()))?;

        Ok(self.convert_to_summary(api_response))
    }

    /// Convert Claude API response to frontend-expected format
    fn convert_to_summary(&self, response: ClaudeApiUsageResponse) -> ClaudeUsageSummary {
        let now = chrono::Utc::now().to_rfc3339();

        // five_hour maps to "daily" in our UI
        let daily = response
            .five_hour
            .map(|b| UsageLimitEntry {
                used: b.utilization,
                limit: 100.0,
                reset_time: b.resets_at.unwrap_or_else(|| now.clone()),
            })
            .unwrap_or_else(|| UsageLimitEntry {
                used: 0.0,
                limit: 100.0,
                reset_time: now.clone(),
            });

        // seven_day maps to "weekly"
        let weekly = response
            .seven_day
            .map(|b| UsageLimitEntry {
                used: b.utilization,
                limit: 100.0,
                reset_time: b.resets_at.unwrap_or_else(|| now.clone()),
            })
            .unwrap_or_else(|| UsageLimitEntry {
                used: 0.0,
                limit: 100.0,
                reset_time: now.clone(),
            });

        // seven_day_opus maps to "sonnetOnly" (which is actually opus limit)
        let sonnet_only = response
            .seven_day_opus
            .map(|b| UsageLimitEntry {
                used: b.utilization,
                limit: 100.0,
                reset_time: b.resets_at.unwrap_or_else(|| now.clone()),
            })
            .unwrap_or_else(|| UsageLimitEntry {
                used: 0.0,
                limit: 100.0,
                reset_time: now.clone(),
            });

        ClaudeUsageSummary {
            daily,
            weekly,
            sonnet_only,
        }
    }
}

impl Default for ClaudeApiService {
    fn default() -> Self {
        Self::new()
    }
}
