//! Message repository for database operations

use rusqlite::params;

use crate::db::{DbPool, DbResult};
use crate::types::{Message, MessageRow};

pub struct MessageRepository {
    pool: DbPool,
}

impl MessageRepository {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    pub fn find_by_id(&self, id: &str) -> DbResult<Option<Message>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT id, agent_id, role, content, token_count, tool_name, tool_input, tool_output, created_at, is_complete
            FROM messages WHERE id = ?
        "#,
        )?;

        let row = stmt
            .query_row([id], |row| {
                Ok(MessageRow {
                    id: row.get(0)?,
                    agent_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    token_count: row.get(4)?,
                    tool_name: row.get(5)?,
                    tool_input: row.get(6)?,
                    tool_output: row.get(7)?,
                    created_at: row.get(8)?,
                    is_complete: row.get::<_, i32>(9)? != 0,
                })
            })
            .optional()?;

        Ok(row.map(Message::from))
    }

    pub fn find_by_agent_id(&self, agent_id: &str, limit: usize) -> DbResult<Vec<Message>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT id, agent_id, role, content, token_count, tool_name, tool_input, tool_output, created_at, is_complete
            FROM messages WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?
        "#,
        )?;

        let rows = stmt.query_map(params![agent_id, limit as i64], |row| {
            Ok(MessageRow {
                id: row.get(0)?,
                agent_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                token_count: row.get(4)?,
                tool_name: row.get(5)?,
                tool_input: row.get(6)?,
                tool_output: row.get(7)?,
                created_at: row.get(8)?,
                is_complete: row.get::<_, i32>(9)? != 0,
            })
        })?;

        let mut messages: Vec<Message> = rows.filter_map(|r| r.ok()).map(Message::from).collect();
        messages.reverse(); // Return in chronological order

        Ok(messages)
    }

    pub fn get_paginated(
        &self,
        agent_id: &str,
        limit: usize,
        before: Option<&str>,
    ) -> DbResult<(Vec<Message>, bool, Option<String>)> {
        let conn = self.pool.get()?;

        let (sql, args): (&str, Vec<Box<dyn rusqlite::ToSql>>) = if let Some(cursor) = before {
            (
                r#"
                SELECT id, agent_id, role, content, token_count, tool_name, tool_input, tool_output, created_at, is_complete
                FROM messages
                WHERE agent_id = ? AND created_at < (SELECT created_at FROM messages WHERE id = ?)
                ORDER BY created_at DESC
                LIMIT ?
            "#,
                vec![
                    Box::new(agent_id.to_string()),
                    Box::new(cursor.to_string()),
                    Box::new((limit + 1) as i64),
                ],
            )
        } else {
            (
                r#"
                SELECT id, agent_id, role, content, token_count, tool_name, tool_input, tool_output, created_at, is_complete
                FROM messages
                WHERE agent_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            "#,
                vec![
                    Box::new(agent_id.to_string()),
                    Box::new((limit + 1) as i64),
                ],
            )
        };

        let mut stmt = conn.prepare(sql)?;
        let args_slice: Vec<&dyn rusqlite::ToSql> = args.iter().map(|b| b.as_ref()).collect();
        let rows = stmt.query_map(args_slice.as_slice(), |row| {
            Ok(MessageRow {
                id: row.get(0)?,
                agent_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                token_count: row.get(4)?,
                tool_name: row.get(5)?,
                tool_input: row.get(6)?,
                tool_output: row.get(7)?,
                created_at: row.get(8)?,
                is_complete: row.get::<_, i32>(9)? != 0,
            })
        })?;

        let mut messages: Vec<Message> = rows.filter_map(|r| r.ok()).map(Message::from).collect();

        let has_more = messages.len() > limit;
        if has_more {
            messages.pop();
        }

        let next_cursor = if has_more {
            messages.last().map(|m| m.id.clone())
        } else {
            None
        };

        messages.reverse(); // Return in chronological order

        Ok((messages, has_more, next_cursor))
    }

    pub fn create(&self, message: &Message) -> DbResult<Message> {
        let conn = self.pool.get()?;

        conn.execute(
            r#"
            INSERT INTO messages (id, agent_id, role, content, token_count, tool_name, tool_input, tool_output, created_at, is_complete)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
            params![
                message.id,
                message.agent_id,
                message.role.as_str(),
                message.content,
                message.token_count,
                message.tool_name,
                message.tool_input,
                message.tool_output,
                message.created_at,
                message.is_complete as i32,
            ],
        )?;

        self.find_by_id(&message.id)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows.into())
    }

    pub fn update_content(&self, id: &str, content: &str, is_complete: bool) -> DbResult<()> {
        let conn = self.pool.get()?;

        conn.execute(
            r#"
            UPDATE messages SET content = ?, is_complete = ? WHERE id = ?
        "#,
            params![content, is_complete as i32, id],
        )?;

        Ok(())
    }

    pub fn delete_by_agent_id(&self, agent_id: &str) -> DbResult<()> {
        let conn = self.pool.get()?;
        conn.execute("DELETE FROM messages WHERE agent_id = ?", [agent_id])?;
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
