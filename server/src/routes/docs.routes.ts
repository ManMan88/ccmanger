import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

/**
 * OpenAPI specification for Claude Manager API
 */
const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Claude Manager API',
    version: '1.0.0',
    description: 'API for managing Claude Code CLI agents across git worktrees',
    contact: {
      name: 'Claude Manager',
    },
    license: {
      name: 'MIT',
    },
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Development server',
    },
  ],
  tags: [
    { name: 'Health', description: 'Health check endpoints' },
    { name: 'Workspaces', description: 'Workspace management' },
    { name: 'Worktrees', description: 'Git worktree operations' },
    { name: 'Agents', description: 'Claude agent management' },
    { name: 'Usage', description: 'API usage statistics' },
    { name: 'Metrics', description: 'Application metrics' },
    { name: 'Errors', description: 'Error tracking' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Comprehensive health check',
        description: 'Returns detailed health status including database connectivity',
        responses: {
          '200': {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
              },
            },
          },
          '503': {
            description: 'Service is degraded',
          },
        },
      },
    },
    '/api/health/live': {
      get: {
        tags: ['Health'],
        summary: 'Liveness probe',
        description: 'Simple check if the service is running',
        responses: {
          '200': { description: 'Service is alive' },
        },
      },
    },
    '/api/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness probe',
        description: 'Check if the service is ready to accept requests',
        responses: {
          '200': { description: 'Service is ready' },
          '503': { description: 'Service is not ready' },
        },
      },
    },
    '/api/workspaces': {
      get: {
        tags: ['Workspaces'],
        summary: 'List all workspaces',
        responses: {
          '200': {
            description: 'List of workspaces',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Workspace' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Workspaces'],
        summary: 'Create a new workspace',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateWorkspaceRequest' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Workspace created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Workspace' },
              },
            },
          },
          '400': { description: 'Invalid request' },
        },
      },
    },
    '/api/workspaces/{id}': {
      get: {
        tags: ['Workspaces'],
        summary: 'Get workspace by ID',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Workspace details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WorkspaceWithDetails' },
              },
            },
          },
          '404': { description: 'Workspace not found' },
        },
      },
      delete: {
        tags: ['Workspaces'],
        summary: 'Delete a workspace',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '204': { description: 'Workspace deleted' },
          '404': { description: 'Workspace not found' },
        },
      },
    },
    '/api/workspaces/{id}/worktrees': {
      get: {
        tags: ['Worktrees'],
        summary: 'List worktrees in a workspace',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'List of worktrees',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Worktree' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Worktrees'],
        summary: 'Create a new worktree',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateWorktreeRequest' },
            },
          },
        },
        responses: {
          '201': { description: 'Worktree created' },
          '400': { description: 'Invalid request' },
        },
      },
    },
    '/api/agents': {
      get: {
        tags: ['Agents'],
        summary: 'List all agents',
        parameters: [
          {
            name: 'worktreeId',
            in: 'query',
            schema: { type: 'string', format: 'uuid' },
            description: 'Filter by worktree',
          },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['running', 'waiting', 'error', 'finished'] },
            description: 'Filter by status',
          },
        ],
        responses: {
          '200': {
            description: 'List of agents',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Agent' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Agents'],
        summary: 'Create a new agent',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateAgentRequest' },
            },
          },
        },
        responses: {
          '201': { description: 'Agent created' },
          '400': { description: 'Invalid request' },
        },
      },
    },
    '/api/agents/{id}': {
      get: {
        tags: ['Agents'],
        summary: 'Get agent by ID',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Agent details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Agent' },
              },
            },
          },
          '404': { description: 'Agent not found' },
        },
      },
      put: {
        tags: ['Agents'],
        summary: 'Update an agent',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateAgentRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Agent updated' },
          '404': { description: 'Agent not found' },
        },
      },
      delete: {
        tags: ['Agents'],
        summary: 'Delete an agent',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '204': { description: 'Agent deleted' },
          '404': { description: 'Agent not found' },
        },
      },
    },
    '/api/agents/{id}/start': {
      post: {
        tags: ['Agents'],
        summary: 'Start an agent process',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  initialPrompt: { type: 'string', description: 'Initial prompt to send' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Agent started' },
          '400': { description: 'Agent already running' },
          '404': { description: 'Agent not found' },
        },
      },
    },
    '/api/agents/{id}/stop': {
      post: {
        tags: ['Agents'],
        summary: 'Stop an agent process',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'Agent stopped' },
          '400': { description: 'Agent not running' },
          '404': { description: 'Agent not found' },
        },
      },
    },
    '/api/agents/{id}/message': {
      post: {
        tags: ['Agents'],
        summary: 'Send a message to an agent',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['content'],
                properties: {
                  content: { type: 'string', description: 'Message content' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Message sent' },
          '400': { description: 'Agent not running' },
          '404': { description: 'Agent not found' },
        },
      },
    },
    '/api/agents/{id}/messages': {
      get: {
        tags: ['Agents'],
        summary: 'Get agent message history',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 50 },
          },
          {
            name: 'before',
            in: 'query',
            schema: { type: 'string', format: 'date-time' },
          },
        ],
        responses: {
          '200': {
            description: 'Message history',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Message' },
                },
              },
            },
          },
        },
      },
    },
    '/api/usage': {
      get: {
        tags: ['Usage'],
        summary: 'Get current usage statistics',
        responses: {
          '200': {
            description: 'Usage statistics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UsageStats' },
              },
            },
          },
        },
      },
    },
    '/api/metrics': {
      get: {
        tags: ['Metrics'],
        summary: 'Get application metrics',
        responses: {
          '200': {
            description: 'Application metrics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApplicationMetrics' },
              },
            },
          },
        },
      },
    },
    '/api/metrics/prometheus': {
      get: {
        tags: ['Metrics'],
        summary: 'Get metrics in Prometheus format',
        responses: {
          '200': {
            description: 'Prometheus metrics',
            content: {
              'text/plain': {
                schema: { type: 'string' },
              },
            },
          },
        },
      },
    },
    '/api/errors': {
      get: {
        tags: ['Errors'],
        summary: 'Get recent tracked errors',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 20, maximum: 100 },
          },
        ],
        responses: {
          '200': {
            description: 'Recent errors',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/ErrorReport' },
                },
              },
            },
          },
        },
      },
    },
    '/api/errors/stats': {
      get: {
        tags: ['Errors'],
        summary: 'Get error statistics',
        responses: {
          '200': {
            description: 'Error statistics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorStats' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      HealthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ok', 'degraded'] },
          timestamp: { type: 'string', format: 'date-time' },
          checks: {
            type: 'object',
            properties: {
              database: { type: 'string', enum: ['ok', 'error'] },
            },
          },
        },
      },
      Workspace: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          path: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      WorkspaceWithDetails: {
        allOf: [
          { $ref: '#/components/schemas/Workspace' },
          {
            type: 'object',
            properties: {
              worktrees: {
                type: 'array',
                items: { $ref: '#/components/schemas/Worktree' },
              },
            },
          },
        ],
      },
      CreateWorkspaceRequest: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string', description: 'Path to git repository' },
        },
      },
      Worktree: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          workspaceId: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          branch: { type: 'string' },
          path: { type: 'string' },
          isMain: { type: 'boolean' },
          order: { type: 'integer' },
          sortMode: { type: 'string', enum: ['free', 'status', 'name'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateWorktreeRequest: {
        type: 'object',
        required: ['branch'],
        properties: {
          branch: { type: 'string' },
          path: { type: 'string' },
          createBranch: { type: 'boolean', default: false },
        },
      },
      Agent: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          worktreeId: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          status: { type: 'string', enum: ['running', 'waiting', 'error', 'finished'] },
          contextLevel: { type: 'integer', minimum: 0, maximum: 100 },
          mode: { type: 'string', enum: ['auto', 'plan', 'regular'] },
          permissions: {
            type: 'array',
            items: { type: 'string', enum: ['read', 'write', 'execute'] },
          },
          order: { type: 'integer' },
          pid: { type: 'integer', nullable: true },
          sessionId: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateAgentRequest: {
        type: 'object',
        required: ['worktreeId', 'name'],
        properties: {
          worktreeId: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          mode: { type: 'string', enum: ['auto', 'plan', 'regular'] },
          permissions: {
            type: 'array',
            items: { type: 'string', enum: ['read', 'write', 'execute'] },
          },
          initialPrompt: { type: 'string' },
        },
      },
      UpdateAgentRequest: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          mode: { type: 'string', enum: ['auto', 'plan', 'regular'] },
          permissions: {
            type: 'array',
            items: { type: 'string', enum: ['read', 'write', 'execute'] },
          },
          order: { type: 'integer' },
        },
      },
      Message: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          agentId: { type: 'string', format: 'uuid' },
          role: { type: 'string', enum: ['user', 'assistant'] },
          content: { type: 'string' },
          tokenCount: { type: 'integer', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      UsageStats: {
        type: 'object',
        properties: {
          inputTokens: { type: 'integer' },
          outputTokens: { type: 'integer' },
          totalTokens: { type: 'integer' },
          messageCount: { type: 'integer' },
          period: { type: 'string' },
        },
      },
      ApplicationMetrics: {
        type: 'object',
        properties: {
          timestamp: { type: 'string', format: 'date-time' },
          requests: {
            type: 'object',
            properties: {
              totalRequests: { type: 'integer' },
              averageResponseTime: { type: 'number' },
              requestsByMethod: { type: 'object' },
              requestsByStatus: { type: 'object' },
            },
          },
          connections: {
            type: 'object',
            properties: {
              activeWebSocketConnections: { type: 'integer' },
              totalWebSocketConnections: { type: 'integer' },
            },
          },
          processes: {
            type: 'object',
            properties: {
              runningAgents: { type: 'integer' },
              totalAgentsSpawned: { type: 'integer' },
            },
          },
          system: {
            type: 'object',
            properties: {
              uptimeSeconds: { type: 'integer' },
              memoryUsage: { type: 'object' },
            },
          },
        },
      },
      ErrorReport: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          error: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              message: { type: 'string' },
              stack: { type: 'string' },
            },
          },
          context: { type: 'object' },
          environment: { type: 'string' },
        },
      },
      ErrorStats: {
        type: 'object',
        properties: {
          totalErrors: { type: 'integer' },
          errorsByType: { type: 'object' },
          recentErrorCount: { type: 'integer' },
        },
      },
    },
  },
}

/**
 * API Documentation Routes
 */
export async function docsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/docs
   * Returns OpenAPI specification in JSON format
   */
  app.get('/api/docs', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(openApiSpec)
  })

  /**
   * GET /api/docs/yaml
   * Returns OpenAPI specification in YAML format
   */
  app.get('/api/docs/yaml', async (_request: FastifyRequest, reply: FastifyReply) => {
    // Simple YAML conversion (for basic use)
    const yaml = jsonToYaml(openApiSpec)
    return reply.header('Content-Type', 'text/yaml').send(yaml)
  })

  /**
   * GET /api/docs/ui
   * Returns a simple HTML page with Swagger UI
   */
  app.get('/api/docs/ui', async (_request: FastifyRequest, reply: FastifyReply) => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Claude Manager API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: '/api/docs',
        dom_id: '#swagger-ui',
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: 'BaseLayout'
      });
    };
  </script>
</body>
</html>`
    return reply.header('Content-Type', 'text/html').send(html)
  })
}

/**
 * Simple JSON to YAML converter
 */
function jsonToYaml(obj: unknown, indent: number = 0): string {
  const spaces = '  '.repeat(indent)

  if (obj === null || obj === undefined) {
    return 'null'
  }

  if (typeof obj === 'string') {
    if (obj.includes('\n') || obj.includes(':') || obj.includes('#')) {
      return `"${obj.replace(/"/g, '\\"')}"`
    }
    return obj
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj)
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]'
    return obj.map((item) => `${spaces}- ${jsonToYaml(item, indent + 1).trimStart()}`).join('\n')
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj)
    if (entries.length === 0) return '{}'
    return entries
      .map(([key, value]) => {
        const yamlValue = jsonToYaml(value, indent + 1)
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return `${spaces}${key}:\n${yamlValue}`
        }
        if (Array.isArray(value)) {
          return `${spaces}${key}:\n${yamlValue}`
        }
        return `${spaces}${key}: ${yamlValue}`
      })
      .join('\n')
  }

  return String(obj)
}
