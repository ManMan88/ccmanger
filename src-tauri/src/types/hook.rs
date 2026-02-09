//! Hook notification types for Claude Code CLI integration
//!
//! Claude Code fires hook commands on lifecycle events. The `Notification` event
//! provides deterministic status signals (permission_prompt, idle_prompt,
//! elicitation_dialog) that replace the fragile PTY buffer heuristic.

use serde::Deserialize;

/// JSON payload received from Claude Code hook commands.
///
/// The hook command (`curl -d @-`) posts the notification JSON that Claude Code
/// writes to the hook's stdin.
#[derive(Debug, Clone, Deserialize)]
pub struct HookNotification {
    /// The Claude session ID (matches --session-id passed at spawn)
    pub session_id: Option<String>,

    /// Working directory of the Claude session
    pub cwd: Option<String>,

    /// Hook event name, e.g. "Notification"
    pub hook_event_name: Option<String>,

    /// Notification sub-type: "permission_prompt", "idle_prompt", "elicitation_dialog"
    pub notification_type: Option<String>,

    /// Human-readable message from the notification
    pub message: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hook_notification_deserialize_permission_prompt() {
        let json = r#"{
            "session_id": "abc-123",
            "cwd": "/home/user/project",
            "hook_event_name": "Notification",
            "notification_type": "permission_prompt",
            "message": "Allow read access to file.rs?"
        }"#;
        let notif: HookNotification = serde_json::from_str(json).unwrap();
        assert_eq!(notif.session_id.as_deref(), Some("abc-123"));
        assert_eq!(notif.notification_type.as_deref(), Some("permission_prompt"));
    }

    #[test]
    fn test_hook_notification_deserialize_idle_prompt() {
        let json = r#"{
            "session_id": "abc-123",
            "hook_event_name": "Notification",
            "notification_type": "idle_prompt"
        }"#;
        let notif: HookNotification = serde_json::from_str(json).unwrap();
        assert_eq!(notif.notification_type.as_deref(), Some("idle_prompt"));
        assert!(notif.cwd.is_none());
        assert!(notif.message.is_none());
    }

    #[test]
    fn test_hook_notification_deserialize_minimal() {
        let json = r#"{}"#;
        let notif: HookNotification = serde_json::from_str(json).unwrap();
        assert!(notif.session_id.is_none());
        assert!(notif.notification_type.is_none());
    }

    #[test]
    fn test_hook_notification_ignores_unknown_fields() {
        let json = r#"{
            "session_id": "x",
            "unknown_field": 42,
            "notification_type": "elicitation_dialog"
        }"#;
        // serde default behavior: unknown fields are ignored (no deny_unknown_fields)
        let notif: HookNotification = serde_json::from_str(json).unwrap();
        assert_eq!(notif.notification_type.as_deref(), Some("elicitation_dialog"));
    }
}
