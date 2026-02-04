# API Specification

## Overview

This document defines the REST API and WebSocket interfaces for the Claude Manager backend. The API follows RESTful conventions with JSON request/response bodies.

## Base Configuration

```
Base URL: http://localhost:3001/api
WebSocket URL: ws://localhost:3001/ws
Content-Type: application/json
```

## Authentication

Authentication is optional for local development. When enabled:

```
Header: Authorization: Bearer <api-key>
```

## Error Response Format

All errors follow a consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable error message",
    "details": {
      "field": "specific field error"
    }
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict (e.g., duplicate name) |
| `INTERNAL_ERROR` | 500 | Server error |
| `GIT_ERROR` | 500 | Git operation failed |
| `PROCESS_ERROR` | 500 | Process management error |

---

## Workspace Endpoints

### GET /api/workspaces

List all workspaces.

**Response 200:**
```json
{
  "workspaces": [
    {
      "id": "ws_abc123",
      "name": "my-project",
      "path": "/home/user/projects/my-project",
      "worktreeCount": 3,
      "agentCount": 5,
      "createdAt": "2025-01-15T10:30:00Z",
      "updatedAt": "2025-01-20T14:22:00Z"
    }
  ]
}
```

### GET /api/workspaces/:id

Get workspace details with all worktrees and agents.

**Response 200:**
```json
{
  "id": "ws_abc123",
  "name": "my-project",
  "path": "/home/user/projects/my-project",
  "worktrees": [
    {
      "id": "wt_def456",
      "name": "main",
      "branch": "main",
      "path": "/home/user/projects/my-project",
      "sortMode": "free",
      "order": 0,
      "agents": [
        {
          "id": "ag_ghi789",
          "name": "Agent 1",
          "status": "running",
          "contextLevel": 45,
          "mode": "auto",
          "permissions": ["read", "write"],
          "worktreeId": "wt_def456",
          "createdAt": "2025-01-20T10:00:00Z",
          "order": 0
        }
      ],
      "previousAgents": []
    }
  ],
  "createdAt": "2025-01-15T10:30:00Z",
  "updatedAt": "2025-01-20T14:22:00Z"
}
```

### POST /api/workspaces

Create or open a workspace from a git repository.

**Request:**
```json
{
  "path": "/home/user/projects/my-project"
}
```

**Response 201:**
```json
{
  "id": "ws_abc123",
  "name": "my-project",
  "path": "/home/user/projects/my-project",
  "worktrees": [],
  "createdAt": "2025-01-20T10:00:00Z",
  "updatedAt": "2025-01-20T10:00:00Z"
}
```

**Response 400:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Path is not a git repository"
  }
}
```

### DELETE /api/workspaces/:id

Close a workspace (does not delete files).

**Response 204:** No content

---

## Worktree Endpoints

### GET /api/workspaces/:workspaceId/worktrees

List worktrees for a workspace.

**Response 200:**
```json
{
  "worktrees": [
    {
      "id": "wt_def456",
      "name": "main",
      "branch": "main",
      "path": "/home/user/projects/my-project",
      "sortMode": "free",
      "order": 0,
      "agentCount": 2
    }
  ]
}
```

### POST /api/workspaces/:workspaceId/worktrees

Create a new worktree.

**Request:**
```json
{
  "name": "feature-auth",
  "branch": "feature/authentication",
  "createBranch": true
}
```

**Response 201:**
```json
{
  "id": "wt_xyz123",
  "name": "feature-auth",
  "branch": "feature/authentication",
  "path": "/home/user/projects/my-project-feature-auth",
  "sortMode": "free",
  "order": 1,
  "agents": [],
  "previousAgents": []
}
```

### PUT /api/workspaces/:workspaceId/worktrees/:id

Update worktree settings.

**Request:**
```json
{
  "sortMode": "status",
  "order": 2
}
```

**Response 200:**
```json
{
  "id": "wt_def456",
  "name": "main",
  "branch": "main",
  "path": "/home/user/projects/my-project",
  "sortMode": "status",
  "order": 2
}
```

### DELETE /api/workspaces/:workspaceId/worktrees/:id

Delete a worktree (removes git worktree and stops all agents).

**Query Parameters:**
- `force=true` - Force delete even with uncommitted changes

**Response 204:** No content

### POST /api/workspaces/:workspaceId/worktrees/:id/checkout

Checkout a different branch in the worktree.

**Request:**
```json
{
  "branch": "develop",
  "createBranch": false
}
```

**Response 200:**
```json
{
  "id": "wt_def456",
  "name": "main",
  "branch": "develop",
  "path": "/home/user/projects/my-project"
}
```

### PUT /api/workspaces/:workspaceId/worktrees/reorder

Reorder worktrees.

**Request:**
```json
{
  "worktreeIds": ["wt_xyz123", "wt_def456", "wt_abc789"]
}
```

**Response 200:**
```json
{
  "worktrees": [
    { "id": "wt_xyz123", "order": 0 },
    { "id": "wt_def456", "order": 1 },
    { "id": "wt_abc789", "order": 2 }
  ]
}
```

---

## Agent Endpoints

### GET /api/agents

List all agents (optionally filtered).

**Query Parameters:**
- `worktreeId` - Filter by worktree
- `status` - Filter by status (running|waiting|error|finished)
- `includeDeleted` - Include previously deleted agents

**Response 200:**
```json
{
  "agents": [
    {
      "id": "ag_ghi789",
      "name": "Feature Implementation",
      "status": "running",
      "contextLevel": 67,
      "mode": "auto",
      "permissions": ["read", "write", "execute"],
      "worktreeId": "wt_def456",
      "pid": 12345,
      "createdAt": "2025-01-20T10:00:00Z",
      "order": 0
    }
  ]
}
```

### GET /api/agents/:id

Get agent details.

**Response 200:**
```json
{
  "id": "ag_ghi789",
  "name": "Feature Implementation",
  "status": "running",
  "contextLevel": 67,
  "mode": "auto",
  "permissions": ["read", "write", "execute"],
  "worktreeId": "wt_def456",
  "pid": 12345,
  "createdAt": "2025-01-20T10:00:00Z",
  "order": 0,
  "sessionId": "session_abc123",
  "lastActivity": "2025-01-20T14:30:00Z"
}
```

### POST /api/agents

Spawn a new agent.

**Request:**
```json
{
  "worktreeId": "wt_def456",
  "name": "Bug Fix Agent",
  "mode": "plan",
  "permissions": ["read", "write"],
  "initialPrompt": "Help me fix the authentication bug in login.ts"
}
```

**Response 201:**
```json
{
  "id": "ag_new123",
  "name": "Bug Fix Agent",
  "status": "running",
  "contextLevel": 0,
  "mode": "plan",
  "permissions": ["read", "write"],
  "worktreeId": "wt_def456",
  "pid": 12346,
  "createdAt": "2025-01-20T15:00:00Z",
  "order": 3,
  "sessionId": "session_new456"
}
```

### PUT /api/agents/:id

Update agent settings.

**Request:**
```json
{
  "name": "Updated Name",
  "mode": "auto",
  "permissions": ["read", "write", "execute"]
}
```

**Response 200:**
```json
{
  "id": "ag_ghi789",
  "name": "Updated Name",
  "mode": "auto",
  "permissions": ["read", "write", "execute"],
  "status": "running"
}
```

### DELETE /api/agents/:id

Stop and delete an agent.

**Query Parameters:**
- `archive=true` - Keep in previousAgents list (default: true)

**Response 204:** No content

### POST /api/agents/:id/message

Send a message to an agent.

**Request:**
```json
{
  "content": "Please also add unit tests for the changes"
}
```

**Response 202:**
```json
{
  "messageId": "msg_abc123",
  "status": "queued"
}
```

### POST /api/agents/:id/stop

Stop a running agent (graceful).

**Response 200:**
```json
{
  "id": "ag_ghi789",
  "status": "finished"
}
```

### POST /api/agents/:id/resume

Resume a stopped agent.

**Request:**
```json
{
  "sessionId": "session_abc123"
}
```

**Response 200:**
```json
{
  "id": "ag_ghi789",
  "status": "running",
  "pid": 12350
}
```

### POST /api/agents/:id/fork

Create a copy of an agent's session.

**Request:**
```json
{
  "name": "Forked Agent"
}
```

**Response 201:**
```json
{
  "id": "ag_forked789",
  "name": "Forked Agent",
  "status": "waiting",
  "contextLevel": 67,
  "mode": "auto",
  "permissions": ["read", "write", "execute"],
  "worktreeId": "wt_def456",
  "parentAgentId": "ag_ghi789",
  "createdAt": "2025-01-20T15:30:00Z"
}
```

### PUT /api/agents/reorder

Reorder agents within a worktree.

**Request:**
```json
{
  "worktreeId": "wt_def456",
  "agentIds": ["ag_new123", "ag_ghi789", "ag_forked789"]
}
```

**Response 200:**
```json
{
  "agents": [
    { "id": "ag_new123", "order": 0 },
    { "id": "ag_ghi789", "order": 1 },
    { "id": "ag_forked789", "order": 2 }
  ]
}
```

### GET /api/agents/:id/messages

Get message history for an agent.

**Query Parameters:**
- `limit` - Number of messages (default: 100)
- `before` - Cursor for pagination

**Response 200:**
```json
{
  "messages": [
    {
      "id": "msg_001",
      "role": "user",
      "content": "Help me fix the authentication bug",
      "timestamp": "2025-01-20T10:00:00Z"
    },
    {
      "id": "msg_002",
      "role": "assistant",
      "content": "I'll help you fix the authentication bug. Let me first examine...",
      "timestamp": "2025-01-20T10:00:05Z"
    }
  ],
  "hasMore": true,
  "nextCursor": "msg_000"
}
```

---

## Usage Endpoints

### GET /api/usage

Get current usage statistics.

**Response 200:**
```json
{
  "daily": {
    "used": 150000,
    "limit": 500000,
    "resetTime": "2025-01-21T00:00:00Z"
  },
  "weekly": {
    "used": 800000,
    "limit": 2000000,
    "resetTime": "2025-01-27T00:00:00Z"
  },
  "sonnetOnly": {
    "used": 100000,
    "limit": 300000,
    "resetTime": "2025-01-21T00:00:00Z"
  }
}
```

### GET /api/usage/history

Get usage history.

**Query Parameters:**
- `period` - daily|weekly|monthly
- `start` - Start date (ISO 8601)
- `end` - End date (ISO 8601)

**Response 200:**
```json
{
  "history": [
    {
      "date": "2025-01-19",
      "tokensUsed": 450000,
      "requestCount": 120
    },
    {
      "date": "2025-01-20",
      "tokensUsed": 150000,
      "requestCount": 45
    }
  ]
}
```

---

## WebSocket API

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3001/ws')
```

### Message Format

All WebSocket messages follow this format:

```json
{
  "type": "event_type",
  "payload": { ... },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Subscription Messages (Client → Server)

#### Subscribe to Agent

```json
{
  "type": "subscribe:agent",
  "payload": {
    "agentId": "ag_ghi789"
  }
}
```

#### Unsubscribe from Agent

```json
{
  "type": "unsubscribe:agent",
  "payload": {
    "agentId": "ag_ghi789"
  }
}
```

#### Subscribe to Workspace

```json
{
  "type": "subscribe:workspace",
  "payload": {
    "workspaceId": "ws_abc123"
  }
}
```

### Event Messages (Server → Client)

#### Agent Output

Streamed output from Claude CLI.

```json
{
  "type": "agent:output",
  "payload": {
    "agentId": "ag_ghi789",
    "content": "I'll examine the login.ts file...",
    "role": "assistant",
    "isStreaming": true
  },
  "timestamp": "2025-01-20T10:00:05Z"
}
```

#### Agent Status Change

```json
{
  "type": "agent:status",
  "payload": {
    "agentId": "ag_ghi789",
    "previousStatus": "running",
    "status": "waiting",
    "reason": "awaiting_input"
  },
  "timestamp": "2025-01-20T10:05:00Z"
}
```

#### Agent Context Update

```json
{
  "type": "agent:context",
  "payload": {
    "agentId": "ag_ghi789",
    "contextLevel": 72,
    "tokensUsed": 85000,
    "tokensLimit": 128000
  },
  "timestamp": "2025-01-20T10:05:00Z"
}
```

#### Agent Error

```json
{
  "type": "agent:error",
  "payload": {
    "agentId": "ag_ghi789",
    "error": {
      "code": "CONTEXT_EXCEEDED",
      "message": "Context window exceeded, please start a new session"
    }
  },
  "timestamp": "2025-01-20T10:10:00Z"
}
```

#### Agent Terminated

```json
{
  "type": "agent:terminated",
  "payload": {
    "agentId": "ag_ghi789",
    "exitCode": 0,
    "reason": "user_stopped"
  },
  "timestamp": "2025-01-20T10:15:00Z"
}
```

#### Workspace Updated

```json
{
  "type": "workspace:updated",
  "payload": {
    "workspaceId": "ws_abc123",
    "change": "worktree_added",
    "data": {
      "id": "wt_new123",
      "name": "feature-new",
      "branch": "feature/new"
    }
  },
  "timestamp": "2025-01-20T11:00:00Z"
}
```

#### Usage Updated

```json
{
  "type": "usage:updated",
  "payload": {
    "daily": {
      "used": 155000,
      "limit": 500000
    }
  },
  "timestamp": "2025-01-20T10:05:00Z"
}
```

### Heartbeat

Client should send ping every 30 seconds:

```json
{
  "type": "ping"
}
```

Server responds:

```json
{
  "type": "pong",
  "timestamp": "2025-01-20T10:00:00Z"
}
```

---

## Zod Schemas

These schemas are used for request validation:

```typescript
// server/src/utils/validation.ts

import { z } from 'zod'

export const AgentStatus = z.enum(['running', 'waiting', 'error', 'finished'])
export const AgentMode = z.enum(['auto', 'plan', 'regular'])
export const AgentSortMode = z.enum(['free', 'status', 'name'])
export const Permission = z.enum(['read', 'write', 'execute'])

export const CreateWorkspaceSchema = z.object({
  path: z.string().min(1).refine(
    (path) => path.startsWith('/'),
    'Path must be absolute'
  )
})

export const CreateWorktreeSchema = z.object({
  name: z.string().min(1).max(50),
  branch: z.string().min(1).max(100),
  createBranch: z.boolean().optional().default(false)
})

export const UpdateWorktreeSchema = z.object({
  sortMode: AgentSortMode.optional(),
  order: z.number().int().min(0).optional()
})

export const CheckoutBranchSchema = z.object({
  branch: z.string().min(1).max(100),
  createBranch: z.boolean().optional().default(false)
})

export const CreateAgentSchema = z.object({
  worktreeId: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  mode: AgentMode.optional().default('regular'),
  permissions: z.array(Permission).optional().default(['read']),
  initialPrompt: z.string().optional()
})

export const UpdateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  mode: AgentMode.optional(),
  permissions: z.array(Permission).optional()
})

export const SendMessageSchema = z.object({
  content: z.string().min(1).max(50000)
})

export const ReorderAgentsSchema = z.object({
  worktreeId: z.string().min(1),
  agentIds: z.array(z.string()).min(1)
})

export const ReorderWorktreesSchema = z.object({
  worktreeIds: z.array(z.string()).min(1)
})

export const ForkAgentSchema = z.object({
  name: z.string().min(1).max(100).optional()
})
```

---

## Rate Limiting

| Endpoint Pattern | Limit | Window |
|------------------|-------|--------|
| `POST /api/agents` | 10 | 1 minute |
| `POST /api/agents/:id/message` | 60 | 1 minute |
| `* /api/*` | 1000 | 1 minute |
| WebSocket connections | 10 | per client |

---

## API Versioning

Current version: `v1` (implicit)

Future versions will use URL prefix: `/api/v2/...`

Deprecation notices will be sent via response header:
```
X-API-Deprecation: This endpoint will be removed on 2025-06-01. Use /api/v2/... instead.
```
