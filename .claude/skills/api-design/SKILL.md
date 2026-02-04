---
name: api-design
description: Design and implement REST APIs and WebSocket endpoints for Claude Manager. Use when adding new endpoints, designing API contracts, creating validation schemas, or extending the WebSocket protocol. Triggers on "add endpoint", "design API", "create route", "add WebSocket event", or when reviewing API changes.
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# API Design Workflow

Design APIs following Claude Manager's specification in `docs/02-api-specification.md`.

## REST API Design

### URL Conventions

```
GET    /api/{resource}              # List resources
POST   /api/{resource}              # Create resource
GET    /api/{resource}/:id          # Get single resource
PUT    /api/{resource}/:id          # Update resource
DELETE /api/{resource}/:id          # Delete resource
POST   /api/{resource}/:id/{action} # Resource action
```

### Nested Resources

```
GET /api/workspaces/:workspaceId/worktrees
POST /api/workspaces/:workspaceId/worktrees/:id/checkout
```

### Response Format

**Success:**
```json
{
  "id": "resource_id",
  "field": "value",
  "createdAt": "2025-01-20T10:00:00Z"
}
```

**List:**
```json
{
  "resources": [...],
  "hasMore": true,
  "nextCursor": "cursor_value"
}
```

**Error:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": { "field": "error" }
  }
}
```

### HTTP Status Codes

| Code | Usage |
|------|-------|
| 200 | Success (GET, PUT) |
| 201 | Created (POST) |
| 202 | Accepted (async operations) |
| 204 | No Content (DELETE) |
| 400 | Validation error |
| 404 | Not found |
| 409 | Conflict |
| 500 | Server error |

## Zod Validation Schema

```typescript
// server/src/utils/validation.ts
import { z } from 'zod'

export const CreateResourceSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['type1', 'type2']),
  optional: z.string().optional(),
  withDefault: z.boolean().default(false),
})

export type CreateResourceDto = z.infer<typeof CreateResourceSchema>
```

## Route Implementation

```typescript
// server/src/routes/resource.routes.ts
import { FastifyInstance } from 'fastify'
import { CreateResourceSchema } from '../utils/validation.js'
import { ResourceService } from '../services/resource.service.js'

export async function resourceRoutes(app: FastifyInstance) {
  const service = new ResourceService(app.db)

  // GET /api/resources
  app.get('/api/resources', async (request, reply) => {
    const resources = service.findAll()
    return { resources }
  })

  // POST /api/resources
  app.post('/api/resources', async (request, reply) => {
    const body = CreateResourceSchema.parse(request.body)
    const resource = await service.create(body)
    return reply.status(201).send(resource)
  })

  // GET /api/resources/:id
  app.get('/api/resources/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const resource = service.findById(id)

    if (!resource) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Resource not found' }
      })
    }

    return resource
  })
}
```

## WebSocket Events

### Client → Server (Subscriptions)

```json
{
  "type": "subscribe:resource",
  "payload": { "resourceId": "id" }
}
```

### Server → Client (Events)

```json
{
  "type": "resource:updated",
  "payload": { "resourceId": "id", "data": {...} },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Event Types

| Event | Payload | Description |
|-------|---------|-------------|
| `agent:output` | agentId, content, role | Streaming output |
| `agent:status` | agentId, status | Status change |
| `agent:context` | agentId, contextLevel | Context update |
| `workspace:updated` | workspaceId, change, data | Workspace change |

## Design Checklist

- [ ] Follows REST conventions
- [ ] Error responses are consistent
- [ ] Zod schema validates all inputs
- [ ] Types exported to shared/types.ts
- [ ] Documented in docs/02-api-specification.md
- [ ] WebSocket events follow naming convention
- [ ] Rate limiting considered
