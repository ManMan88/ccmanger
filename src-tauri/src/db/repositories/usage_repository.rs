//! Usage repository for database operations

use chrono::Datelike;
use rusqlite::params;

use crate::db::{DbPool, DbResult};
use crate::types::{UsagePeriod, UsageStats, UsageStatsRow};

pub struct UsageRepository {
    pool: DbPool,
}

impl UsageRepository {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    pub fn get_or_create_today(&self) -> DbResult<UsageStats> {
        let conn = self.pool.get()?;
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();

        // Try to get existing
        let existing = self.find_by_date_and_period(&today, UsagePeriod::Daily)?;
        if let Some(stats) = existing {
            return Ok(stats);
        }

        // Create new entry
        conn.execute(
            r#"
            INSERT INTO usage_stats (date, period, input_tokens, output_tokens, total_tokens, request_count, error_count)
            VALUES (?, 'daily', 0, 0, 0, 0, 0)
        "#,
            [&today],
        )?;

        self.find_by_date_and_period(&today, UsagePeriod::Daily)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows.into())
    }

    pub fn get_current_period(&self, period: UsagePeriod) -> DbResult<UsageStats> {
        let conn = self.pool.get()?;
        let now = chrono::Utc::now();

        let date_key = match period {
            UsagePeriod::Daily => now.format("%Y-%m-%d").to_string(),
            UsagePeriod::Weekly => {
                let week_start = now - chrono::Duration::days(now.weekday().num_days_from_monday() as i64);
                week_start.format("%Y-%m-%d").to_string()
            }
            UsagePeriod::Monthly => now.format("%Y-%m").to_string(),
        };

        // Try to get existing
        let existing = self.find_by_date_and_period(&date_key, period)?;
        if let Some(stats) = existing {
            return Ok(stats);
        }

        // Create new entry
        conn.execute(
            r#"
            INSERT INTO usage_stats (date, period, input_tokens, output_tokens, total_tokens, request_count, error_count)
            VALUES (?, ?, 0, 0, 0, 0, 0)
        "#,
            params![date_key, period.as_str()],
        )?;

        self.find_by_date_and_period(&date_key, period)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows.into())
    }

    fn find_by_date_and_period(
        &self,
        date: &str,
        period: UsagePeriod,
    ) -> DbResult<Option<UsageStats>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT id, date, period, input_tokens, output_tokens, total_tokens, request_count, error_count, model_usage, created_at, updated_at
            FROM usage_stats WHERE date = ? AND period = ?
        "#,
        )?;

        let row = stmt
            .query_row(params![date, period.as_str()], |row| {
                Ok(UsageStatsRow {
                    id: row.get(0)?,
                    date: row.get(1)?,
                    period: row.get(2)?,
                    input_tokens: row.get(3)?,
                    output_tokens: row.get(4)?,
                    total_tokens: row.get(5)?,
                    request_count: row.get(6)?,
                    error_count: row.get(7)?,
                    model_usage: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            })
            .optional()?;

        Ok(row.map(UsageStats::from))
    }

    pub fn get_history(&self, period: UsagePeriod, limit: usize) -> DbResult<Vec<UsageStats>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT id, date, period, input_tokens, output_tokens, total_tokens, request_count, error_count, model_usage, created_at, updated_at
            FROM usage_stats WHERE period = ? ORDER BY date DESC LIMIT ?
        "#,
        )?;

        let rows = stmt.query_map(params![period.as_str(), limit as i64], |row| {
            Ok(UsageStatsRow {
                id: row.get(0)?,
                date: row.get(1)?,
                period: row.get(2)?,
                input_tokens: row.get(3)?,
                output_tokens: row.get(4)?,
                total_tokens: row.get(5)?,
                request_count: row.get(6)?,
                error_count: row.get(7)?,
                model_usage: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;

        let stats: Vec<UsageStats> = rows.filter_map(|r| r.ok()).map(UsageStats::from).collect();

        Ok(stats)
    }

    pub fn increment_usage(
        &self,
        input_tokens: i64,
        output_tokens: i64,
        is_error: bool,
    ) -> DbResult<()> {
        // Ensure today's record exists
        self.get_or_create_today()?;

        let conn = self.pool.get()?;
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let total_tokens = input_tokens + output_tokens;
        let error_increment = if is_error { 1 } else { 0 };

        conn.execute(
            r#"
            UPDATE usage_stats SET
                input_tokens = input_tokens + ?,
                output_tokens = output_tokens + ?,
                total_tokens = total_tokens + ?,
                request_count = request_count + 1,
                error_count = error_count + ?,
                updated_at = datetime('now')
            WHERE date = ? AND period = 'daily'
        "#,
            params![input_tokens, output_tokens, total_tokens, error_increment, today],
        )?;

        Ok(())
    }
}

// Helper trait for optional query results
trait OptionalExt<T> {
    fn optional(self) -> Result<Option<T>, rusqlite::Error>;
}

impl<T> OptionalExt<T> for Result<T, rusqlite::Error> {
    fn optional(self) -> Result<Option<T>, rusqlite::Error> {
        match self {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}
