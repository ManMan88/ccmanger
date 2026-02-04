# Backend Implementation Guide

## Overview

This document provides detailed implementation guidance for the Claude Manager backend. It covers service architecture, core modules, and implementation patterns.

## Project Setup

### Directory Structure

```
server/
├── src/
│   ├── index.ts              # Application entry point
│   ├── app.ts                # Fastify app configuration
│   ├── config/
│   │   ├── index.ts          # Configuration loader
│   │   └── env.ts            # Environment schema
│   ├── routes/
│   │   ├── index.ts          # Route registration
│   │   ├── workspace.routes.ts
│   │   ├── worktree.routes.ts
│   │   ├── agent.routes.ts
│   │   └── usage.routes.ts
│   ├── services/
│   │   ├── workspace.service.ts
│   │   ├── worktree.service.ts
│   │   ├── agent.service.ts
│   │   ├── git.service.ts
│   │   ├── process.service.ts
│   │   └── usage.service.ts
│   ├── websocket/
│   │   ├── index.ts
│   │   ├── handlers.ts
│   │   └── subscriptions.ts
│   ├── db/
│   │   ├── index.ts
│   │   ├── migrations/
│   │   └── repositories/
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── errors.ts
│   │   ├── id.ts
│   │   └── validation.ts
│   └── middleware/
│       ├── error-handler.ts
│       └── request-logger.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Package Configuration

```json
// server/package.json
{
  "name": "@claude-manager/server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "migrate": "tsx scripts/migrate.ts",
    "migrate:down": "tsx scripts/migrate.ts --down",
    "seed": "tsx scripts/seed.ts"
  },
  "dependencies": {
    "fastify": "^4.28.0",
    "@fastify/websocket": "^8.3.0",
    "@fastify/cors": "^9.0.0",
    "@fastify/static": "^7.0.0",
    "better-sqlite3": "^9.6.0",
    "simple-git": "^3.25.0",
    "zod": "^3.23.0",
    "pino": "^9.0.0",
    "pino-pretty": "^11.0.0",
    "dotenv": "^16.4.0",
    "nanoid": "^5.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.5.0",
    "tsx": "^4.15.0",
    "vitest": "^3.2.0",
    "@vitest/coverage-v8": "^3.2.0",
    "supertest": "^6.3.0",
    "@types/supertest": "^6.0.0",
    "eslint": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0"
  }
}
```

### TypeScript Configuration

```json
// server/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "paths": {
      "@/*": ["./src/*"],
      "@shared/*": ["../shared/*"]
    },
    "baseUrl": "."
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

## Core Modules

### 1. Configuration Module

```typescript
// server/src/config/env.ts
import { z } from 'zod'

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Database
  DB_PATH: z.string().default('~/.claude-manager/data.db'),

  // Claude CLI
  CLAUDE_CLI_PATH: z.string().default('claude'),
  CLAUDE_CLI_TIMEOUT: z.coerce.number().default(300000), // 5 minutes

  // WebSocket
  WS_HEARTBEAT_INTERVAL: z.coerce.number().default(30000),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:8080'),
})

export type Env = z.infer<typeof envSchema>

// server/src/config/index.ts
import { config as dotenvConfig } from 'dotenv'
import path from 'path'
import os from 'os'
import { envSchema, type Env } from './env.js'

dotenvConfig()

function expandPath(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1))
  }
  return p
}

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(parsed.error.format())
  process.exit(1)
}

export const config: Env = {
  ...parsed.data,
  DB_PATH: expandPath(parsed.data.DB_PATH),
}
```

### 2. Application Setup

```typescript
// server/src/app.ts
import Fastify, { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import { config } from './config/index.js'
import { logger } from './utils/logger.js'
import { errorHandler } from './middleware/error-handler.js'
import { registerRoutes } from './routes/index.js'
import { setupWebSocket } from './websocket/index.js'
import { initDatabase } from './db/index.js'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger,
  })

  // CORS
  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  })

  // WebSocket
  await app.register(websocket, {
    options: {
      maxPayload: 1048576, // 1MB
    },
  })

  // Initialize database
  const db = initDatabase(config.DB_PATH)
  app.decorate('db', db)

  // Error handler
  app.setErrorHandler(errorHandler)

  // Routes
  registerRoutes(app)

  // WebSocket handlers
  setupWebSocket(app)

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...')
    await app.close()
    db.close()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  return app
}

// server/src/index.ts
import { buildApp } from './app.js'
import { config } from './config/index.js'

async function main() {
  const app = await buildApp()

  try {
    await app.listen({
      port: config.PORT,
      host: config.HOST,
    })
    console.log(`🚀 Server running at http://${config.HOST}:${config.PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
```

### 3. Database Connection

```typescript
// server/src/db/index.ts
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { logger } from '../utils/logger.js'
import { runMigrations } from './migrations/index.js'

let db: Database.Database | null = null

export function initDatabase(dbPath: string): Database.Database {
  // Ensure directory exists
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  db = new Database(dbPath)

  // Configure SQLite
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('cache_size = -64000')
  db.pragma('foreign_keys = ON')
  db.pragma('temp_store = MEMORY')

  // Run migrations
  runMigrations(db)

  logger.info({ path: dbPath }, 'Database initialized')

  return db
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}
```

### 4. Logger Utility

```typescript
// server/src/utils/logger.ts
import pino from 'pino'
import { config } from '../config/index.js'

export const logger = pino({
  level: config.LOG_LEVEL,
  transport:
    config.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
})
```

### 5. ID Generation

```typescript
// server/src/utils/id.ts
import { nanoid } from 'nanoid'

export type IdPrefix = 'ws' | 'wt' | 'ag' | 'msg' | 'ses'

export function generateId(prefix: IdPrefix): string {
  return `${prefix}_${nanoid(12)}`
}
```

### 6. Error Classes

```typescript
// server/src/utils/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, details)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super('NOT_FOUND', `${resource}${id ? ` with id '${id}'` : ''} not found`, 404)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409)
    this.name = 'ConflictError'
  }
}

export class GitError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('GIT_ERROR', message, 500, details)
    this.name = 'GitError'
  }
}

export class ProcessError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('PROCESS_ERROR', message, 500, details)
    this.name = 'ProcessError'
  }
}
```

### 7. Error Handler Middleware

```typescript
// server/src/middleware/error-handler.ts
import { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { AppError } from '../utils/errors.js'

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  request.log.error(error)

  // Zod validation errors
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.flatten().fieldErrors,
      },
    })
  }

  // Custom app errors
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    })
  }

  // Generic errors
  return reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  })
}
```

---

## Service Layer

### 1. Git Service

```typescript
// server/src/services/git.service.ts
import simpleGit, { SimpleGit } from 'simple-git'
import path from 'path'
import { GitError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'

export interface WorktreeInfo {
  path: string
  branch: string
  isMain: boolean
}

export class GitService {
  private git: SimpleGit

  constructor(repoPath: string) {
    this.git = simpleGit(repoPath)
  }

  async isValidRepository(): Promise<boolean> {
    try {
      await this.git.revparse(['--git-dir'])
      return true
    } catch {
      return false
    }
  }

  async getCurrentBranch(): Promise<string> {
    try {
      const branch = await this.git.revparse(['--abbrev-ref', 'HEAD'])
      return branch.trim()
    } catch (err) {
      throw new GitError('Failed to get current branch', { error: String(err) })
    }
  }

  async listWorktrees(): Promise<WorktreeInfo[]> {
    try {
      const raw = await this.git.raw(['worktree', 'list', '--porcelain'])
      const worktrees: WorktreeInfo[] = []
      let current: Partial<WorktreeInfo> = {}

      for (const line of raw.split('\n')) {
        if (line.startsWith('worktree ')) {
          current.path = line.substring(9)
        } else if (line.startsWith('branch ')) {
          current.branch = line.substring(7).replace('refs/heads/', '')
        } else if (line === '') {
          if (current.path && current.branch) {
            worktrees.push({
              path: current.path,
              branch: current.branch,
              isMain: worktrees.length === 0, // First worktree is main
            })
          }
          current = {}
        }
      }

      return worktrees
    } catch (err) {
      throw new GitError('Failed to list worktrees', { error: String(err) })
    }
  }

  async addWorktree(worktreePath: string, branch: string, createBranch: boolean): Promise<void> {
    try {
      const args = ['worktree', 'add']

      if (createBranch) {
        args.push('-b', branch, worktreePath)
      } else {
        args.push(worktreePath, branch)
      }

      await this.git.raw(args)
      logger.info({ path: worktreePath, branch }, 'Worktree created')
    } catch (err) {
      throw new GitError(`Failed to create worktree: ${err}`, {
        path: worktreePath,
        branch,
      })
    }
  }

  async removeWorktree(worktreePath: string, force: boolean = false): Promise<void> {
    try {
      const args = ['worktree', 'remove']
      if (force) {
        args.push('--force')
      }
      args.push(worktreePath)

      await this.git.raw(args)
      logger.info({ path: worktreePath }, 'Worktree removed')
    } catch (err) {
      throw new GitError(`Failed to remove worktree: ${err}`, {
        path: worktreePath,
      })
    }
  }

  async checkout(branch: string, createBranch: boolean = false): Promise<void> {
    try {
      if (createBranch) {
        await this.git.checkoutLocalBranch(branch)
      } else {
        await this.git.checkout(branch)
      }
      logger.info({ branch }, 'Branch checked out')
    } catch (err) {
      throw new GitError(`Failed to checkout branch: ${err}`, { branch })
    }
  }

  async listBranches(): Promise<{ local: string[]; remote: string[] }> {
    try {
      const summary = await this.git.branchLocal()
      const remote = await this.git.branch(['-r'])

      return {
        local: summary.all,
        remote: remote.all.map((b) => b.replace('origin/', '')),
      }
    } catch (err) {
      throw new GitError('Failed to list branches', { error: String(err) })
    }
  }
}

export function createGitService(repoPath: string): GitService {
  return new GitService(repoPath)
}
```

### 2. Process Service (Claude CLI Management)

```typescript
// server/src/services/process.service.ts
import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { ProcessError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { config } from '../config/index.js'

export interface AgentProcess {
  pid: number
  agentId: string
  process: ChildProcess
  status: 'running' | 'waiting' | 'error' | 'finished'
}

export interface ProcessManagerEvents {
  'agent:output': (agentId: string, data: string, role: 'assistant' | 'tool') => void
  'agent:status': (agentId: string, status: AgentProcess['status']) => void
  'agent:error': (agentId: string, error: Error) => void
  'agent:exit': (agentId: string, code: number | null) => void
  'agent:context': (agentId: string, level: number) => void
}

export class ProcessManager extends EventEmitter {
  private processes: Map<string, AgentProcess> = new Map()

  async spawnAgent(
    agentId: string,
    workingDir: string,
    mode: 'auto' | 'plan' | 'regular',
    permissions: string[],
    initialPrompt?: string,
    sessionId?: string
  ): Promise<AgentProcess> {
    const args = this.buildClaudeArgs(mode, permissions, sessionId, initialPrompt)

    logger.info({ agentId, workingDir, mode, args }, 'Spawning Claude CLI')

    const proc = spawn(config.CLAUDE_CLI_PATH, args, {
      cwd: workingDir,
      env: {
        ...process.env,
        FORCE_COLOR: '0', // Disable color codes
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const agentProcess: AgentProcess = {
      pid: proc.pid!,
      agentId,
      process: proc,
      status: 'running',
    }

    this.processes.set(agentId, agentProcess)

    // Handle stdout
    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString()
      this.parseOutput(agentId, text)
    })

    // Handle stderr
    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      logger.debug({ agentId, stderr: text }, 'Claude CLI stderr')

      // Parse context level from status output
      const contextMatch = text.match(/Context: (\d+)%/)
      if (contextMatch) {
        const level = parseInt(contextMatch[1], 10)
        this.emit('agent:context', agentId, level)
      }

      // Check for waiting state
      if (text.includes('Waiting for input') || text.includes('>')) {
        this.updateStatus(agentId, 'waiting')
      }
    })

    // Handle process exit
    proc.on('exit', (code) => {
      logger.info({ agentId, code }, 'Claude CLI exited')
      this.updateStatus(agentId, 'finished')
      this.emit('agent:exit', agentId, code)
      this.processes.delete(agentId)
    })

    // Handle errors
    proc.on('error', (err) => {
      logger.error({ agentId, error: err }, 'Claude CLI process error')
      this.updateStatus(agentId, 'error')
      this.emit('agent:error', agentId, err)
    })

    return agentProcess
  }

  private buildClaudeArgs(
    mode: 'auto' | 'plan' | 'regular',
    permissions: string[],
    sessionId?: string,
    initialPrompt?: string
  ): string[] {
    const args: string[] = []

    // Mode flags
    switch (mode) {
      case 'auto':
        args.push('--dangerously-skip-permissions')
        break
      case 'plan':
        args.push('--plan')
        break
      // 'regular' has no special flags
    }

    // Resume session
    if (sessionId) {
      args.push('--resume', sessionId)
    }

    // Permissions (for non-auto mode)
    if (mode !== 'auto') {
      if (permissions.includes('write')) {
        args.push('--allow-write')
      }
      if (permissions.includes('execute')) {
        args.push('--allow-execute')
      }
    }

    // Initial prompt
    if (initialPrompt && !sessionId) {
      args.push('--print', initialPrompt)
    }

    return args
  }

  private parseOutput(agentId: string, text: string): void {
    // Emit raw output for streaming
    this.emit('agent:output', agentId, text, 'assistant')

    // Update status based on output patterns
    if (text.includes('❯') || text.includes('Thinking')) {
      this.updateStatus(agentId, 'running')
    }
  }

  private updateStatus(agentId: string, status: AgentProcess['status']): void {
    const proc = this.processes.get(agentId)
    if (proc && proc.status !== status) {
      proc.status = status
      this.emit('agent:status', agentId, status)
    }
  }

  async sendMessage(agentId: string, message: string): Promise<void> {
    const proc = this.processes.get(agentId)
    if (!proc) {
      throw new ProcessError('Agent process not found', { agentId })
    }

    if (!proc.process.stdin?.writable) {
      throw new ProcessError('Agent stdin not writable', { agentId })
    }

    proc.process.stdin.write(message + '\n')
    this.updateStatus(agentId, 'running')
    logger.debug({ agentId, message }, 'Message sent to agent')
  }

  async stopAgent(agentId: string, force: boolean = false): Promise<void> {
    const proc = this.processes.get(agentId)
    if (!proc) {
      logger.warn({ agentId }, 'Agent process not found for stop')
      return
    }

    if (force) {
      proc.process.kill('SIGKILL')
    } else {
      proc.process.kill('SIGTERM')
    }

    logger.info({ agentId, force }, 'Agent stop signal sent')
  }

  getProcess(agentId: string): AgentProcess | undefined {
    return this.processes.get(agentId)
  }

  getAllProcesses(): AgentProcess[] {
    return Array.from(this.processes.values())
  }

  isRunning(agentId: string): boolean {
    const proc = this.processes.get(agentId)
    return proc?.status === 'running' || proc?.status === 'waiting'
  }
}

// Singleton instance
let processManager: ProcessManager | null = null

export function getProcessManager(): ProcessManager {
  if (!processManager) {
    processManager = new ProcessManager()
  }
  return processManager
}
```

### 3. Agent Service

```typescript
// server/src/services/agent.service.ts
import { AgentRepository, CreateAgentDto, UpdateAgentDto } from '../db/repositories/agent.repository.js'
import { MessageRepository } from '../db/repositories/message.repository.js'
import { ProcessManager, getProcessManager } from './process.service.js'
import { WorktreeRepository } from '../db/repositories/worktree.repository.js'
import { NotFoundError, ConflictError } from '../utils/errors.js'
import { generateId } from '../utils/id.js'
import { logger } from '../utils/logger.js'
import { EventEmitter } from 'events'

export interface AgentServiceEvents {
  'agent:created': (agent: any) => void
  'agent:updated': (agent: any) => void
  'agent:deleted': (agentId: string) => void
  'agent:output': (agentId: string, content: string, role: string) => void
  'agent:status': (agentId: string, status: string) => void
  'agent:context': (agentId: string, level: number) => void
}

export class AgentService extends EventEmitter {
  private processManager: ProcessManager

  constructor(
    private agentRepo: AgentRepository,
    private messageRepo: MessageRepository,
    private worktreeRepo: WorktreeRepository
  ) {
    super()
    this.processManager = getProcessManager()
    this.setupProcessEventHandlers()
  }

  private setupProcessEventHandlers(): void {
    this.processManager.on('agent:output', (agentId, content, role) => {
      // Save message to database
      this.messageRepo.create({
        agentId,
        role,
        content,
      })
      // Forward event
      this.emit('agent:output', agentId, content, role)
    })

    this.processManager.on('agent:status', (agentId, status) => {
      // Update agent status in database
      this.agentRepo.update(agentId, { status })
      this.emit('agent:status', agentId, status)
    })

    this.processManager.on('agent:context', (agentId, level) => {
      this.agentRepo.update(agentId, { contextLevel: level })
      this.emit('agent:context', agentId, level)
    })

    this.processManager.on('agent:exit', (agentId, code) => {
      const status = code === 0 ? 'finished' : 'error'
      this.agentRepo.update(agentId, {
        status,
        pid: null,
      })
    })
  }

  async createAgent(dto: CreateAgentDto): Promise<any> {
    // Validate worktree exists
    const worktree = this.worktreeRepo.findById(dto.worktreeId)
    if (!worktree) {
      throw new NotFoundError('Worktree', dto.worktreeId)
    }

    // Generate name if not provided
    const name = dto.name || `Agent ${Date.now().toString(36).toUpperCase()}`

    // Create agent record
    const agent = this.agentRepo.create({
      ...dto,
      name,
    })

    logger.info({ agentId: agent.id, worktreeId: dto.worktreeId }, 'Agent created')
    this.emit('agent:created', agent)

    return agent
  }

  async spawnAgent(agentId: string, initialPrompt?: string): Promise<any> {
    const agent = this.agentRepo.findById(agentId)
    if (!agent) {
      throw new NotFoundError('Agent', agentId)
    }

    if (this.processManager.isRunning(agentId)) {
      throw new ConflictError('Agent is already running')
    }

    const worktree = this.worktreeRepo.findById(agent.worktree_id)
    if (!worktree) {
      throw new NotFoundError('Worktree', agent.worktree_id)
    }

    const permissions = JSON.parse(agent.permissions) as string[]

    // Spawn the process
    const proc = await this.processManager.spawnAgent(
      agentId,
      worktree.path,
      agent.mode as 'auto' | 'plan' | 'regular',
      permissions,
      initialPrompt,
      agent.session_id || undefined
    )

    // Update agent with pid and status
    const updated = this.agentRepo.update(agentId, {
      pid: proc.pid,
      status: 'running',
    })

    return updated
  }

  async sendMessage(agentId: string, content: string): Promise<void> {
    const agent = this.agentRepo.findById(agentId)
    if (!agent) {
      throw new NotFoundError('Agent', agentId)
    }

    // Save user message
    const message = this.messageRepo.create({
      agentId,
      role: 'user',
      content,
    })

    // Send to process
    await this.processManager.sendMessage(agentId, content)

    logger.debug({ agentId, messageId: message.id }, 'Message sent to agent')
  }

  async stopAgent(agentId: string): Promise<any> {
    const agent = this.agentRepo.findById(agentId)
    if (!agent) {
      throw new NotFoundError('Agent', agentId)
    }

    await this.processManager.stopAgent(agentId)

    const updated = this.agentRepo.update(agentId, {
      status: 'finished',
      pid: null,
    })

    return updated
  }

  async deleteAgent(agentId: string, archive: boolean = true): Promise<void> {
    const agent = this.agentRepo.findById(agentId)
    if (!agent) {
      throw new NotFoundError('Agent', agentId)
    }

    // Stop process if running
    if (this.processManager.isRunning(agentId)) {
      await this.processManager.stopAgent(agentId, true)
    }

    if (archive) {
      // Soft delete
      this.agentRepo.softDelete(agentId)
    } else {
      // Hard delete
      this.agentRepo.hardDelete(agentId)
    }

    this.emit('agent:deleted', agentId)
    logger.info({ agentId, archive }, 'Agent deleted')
  }

  async forkAgent(agentId: string, name?: string): Promise<any> {
    const parent = this.agentRepo.findById(agentId)
    if (!parent) {
      throw new NotFoundError('Agent', agentId)
    }

    // Create new agent with same settings
    const forked = this.agentRepo.create({
      worktreeId: parent.worktree_id,
      name: name || `${parent.name} (Fork)`,
      mode: parent.mode as 'auto' | 'plan' | 'regular',
      permissions: JSON.parse(parent.permissions),
    })

    // TODO: Copy session/context if possible

    logger.info({ forkedId: forked.id, parentId: agentId }, 'Agent forked')
    this.emit('agent:created', forked)

    return forked
  }

  async updateAgent(agentId: string, updates: Partial<UpdateAgentDto>): Promise<any> {
    const agent = this.agentRepo.findById(agentId)
    if (!agent) {
      throw new NotFoundError('Agent', agentId)
    }

    const updated = this.agentRepo.update(agentId, updates)
    this.emit('agent:updated', updated)

    return updated
  }

  async reorderAgents(worktreeId: string, agentIds: string[]): Promise<void> {
    this.agentRepo.reorder(worktreeId, agentIds)
  }

  getAgentById(agentId: string) {
    return this.agentRepo.findById(agentId)
  }

  getAgentsByWorktree(worktreeId: string, includeDeleted = false) {
    return this.agentRepo.findByWorktreeId(worktreeId, includeDeleted)
  }

  getMessages(agentId: string, limit = 100, offset = 0) {
    return this.messageRepo.findByAgentId(agentId, limit, offset)
  }
}
```

---

## Route Implementation

### Agent Routes Example

```typescript
// server/src/routes/agent.routes.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { AgentService } from '../services/agent.service.js'
import { AgentRepository } from '../db/repositories/agent.repository.js'
import { MessageRepository } from '../db/repositories/message.repository.js'
import { WorktreeRepository } from '../db/repositories/worktree.repository.js'
import {
  CreateAgentSchema,
  UpdateAgentSchema,
  SendMessageSchema,
  ReorderAgentsSchema,
} from '../utils/validation.js'

export async function agentRoutes(app: FastifyInstance) {
  const agentRepo = new AgentRepository(app.db)
  const messageRepo = new MessageRepository(app.db)
  const worktreeRepo = new WorktreeRepository(app.db)
  const agentService = new AgentService(agentRepo, messageRepo, worktreeRepo)

  // GET /api/agents
  app.get('/api/agents', async (request, reply) => {
    const { worktreeId, status, includeDeleted } = request.query as {
      worktreeId?: string
      status?: string
      includeDeleted?: string
    }

    let agents
    if (worktreeId) {
      agents = agentService.getAgentsByWorktree(worktreeId, includeDeleted === 'true')
    } else {
      agents = agentRepo.findAll()
    }

    if (status) {
      agents = agents.filter((a) => a.status === status)
    }

    return { agents }
  })

  // GET /api/agents/:id
  app.get('/api/agents/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const agent = agentService.getAgentById(id)

    if (!agent) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Agent not found' },
      })
    }

    return agent
  })

  // POST /api/agents
  app.post('/api/agents', async (request, reply) => {
    const body = CreateAgentSchema.parse(request.body)
    const agent = await agentService.createAgent(body)

    // Auto-spawn if initialPrompt provided
    if (body.initialPrompt) {
      await agentService.spawnAgent(agent.id, body.initialPrompt)
    }

    return reply.status(201).send(agent)
  })

  // PUT /api/agents/:id
  app.put('/api/agents/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = UpdateAgentSchema.parse(request.body)

    const agent = await agentService.updateAgent(id, body)
    return agent
  })

  // DELETE /api/agents/:id
  app.delete('/api/agents/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { archive } = request.query as { archive?: string }

    await agentService.deleteAgent(id, archive !== 'false')
    return reply.status(204).send()
  })

  // POST /api/agents/:id/message
  app.post('/api/agents/:id/message', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { content } = SendMessageSchema.parse(request.body)

    await agentService.sendMessage(id, content)
    return reply.status(202).send({ status: 'queued' })
  })

  // POST /api/agents/:id/stop
  app.post('/api/agents/:id/stop', async (request, reply) => {
    const { id } = request.params as { id: string }
    const agent = await agentService.stopAgent(id)
    return agent
  })

  // POST /api/agents/:id/fork
  app.post('/api/agents/:id/fork', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { name } = request.body as { name?: string }

    const forked = await agentService.forkAgent(id, name)
    return reply.status(201).send(forked)
  })

  // PUT /api/agents/reorder
  app.put('/api/agents/reorder', async (request, reply) => {
    const { worktreeId, agentIds } = ReorderAgentsSchema.parse(request.body)
    await agentService.reorderAgents(worktreeId, agentIds)
    return { success: true }
  })

  // GET /api/agents/:id/messages
  app.get('/api/agents/:id/messages', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { limit, offset } = request.query as { limit?: string; offset?: string }

    const messages = agentService.getMessages(
      id,
      limit ? parseInt(limit, 10) : 100,
      offset ? parseInt(offset, 10) : 0
    )

    return { messages }
  })
}
```

---

## WebSocket Implementation

```typescript
// server/src/websocket/index.ts
import { FastifyInstance } from 'fastify'
import { WebSocket } from '@fastify/websocket'
import { logger } from '../utils/logger.js'
import { AgentService } from '../services/agent.service.js'

interface ClientSubscription {
  ws: WebSocket
  agentIds: Set<string>
  workspaceIds: Set<string>
}

const clients = new Map<string, ClientSubscription>()
let agentService: AgentService | null = null

export function setupWebSocket(app: FastifyInstance) {
  // Initialize services (you'd inject these properly in production)
  // agentService = new AgentService(...)

  app.get('/ws', { websocket: true }, (socket, request) => {
    const clientId = Math.random().toString(36).substring(2)
    logger.info({ clientId }, 'WebSocket client connected')

    const subscription: ClientSubscription = {
      ws: socket,
      agentIds: new Set(),
      workspaceIds: new Set(),
    }
    clients.set(clientId, subscription)

    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString())
        handleClientMessage(clientId, message)
      } catch (err) {
        logger.error({ clientId, error: err }, 'Failed to parse WebSocket message')
      }
    })

    socket.on('close', () => {
      clients.delete(clientId)
      logger.info({ clientId }, 'WebSocket client disconnected')
    })

    socket.on('error', (err) => {
      logger.error({ clientId, error: err }, 'WebSocket error')
    })

    // Send heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }))
      }
    }, 30000)

    socket.on('close', () => clearInterval(heartbeat))
  })
}

function handleClientMessage(clientId: string, message: any) {
  const client = clients.get(clientId)
  if (!client) return

  switch (message.type) {
    case 'subscribe:agent':
      client.agentIds.add(message.payload.agentId)
      logger.debug({ clientId, agentId: message.payload.agentId }, 'Client subscribed to agent')
      break

    case 'unsubscribe:agent':
      client.agentIds.delete(message.payload.agentId)
      break

    case 'subscribe:workspace':
      client.workspaceIds.add(message.payload.workspaceId)
      break

    case 'unsubscribe:workspace':
      client.workspaceIds.delete(message.payload.workspaceId)
      break

    case 'ping':
      client.ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }))
      break
  }
}

// Broadcast functions called by services
export function broadcastAgentOutput(agentId: string, content: string, role: string) {
  const message = JSON.stringify({
    type: 'agent:output',
    payload: { agentId, content, role },
    timestamp: new Date().toISOString(),
  })

  for (const [, client] of clients) {
    if (client.agentIds.has(agentId) && client.ws.readyState === client.ws.OPEN) {
      client.ws.send(message)
    }
  }
}

export function broadcastAgentStatus(agentId: string, status: string) {
  const message = JSON.stringify({
    type: 'agent:status',
    payload: { agentId, status },
    timestamp: new Date().toISOString(),
  })

  for (const [, client] of clients) {
    if (client.agentIds.has(agentId) && client.ws.readyState === client.ws.OPEN) {
      client.ws.send(message)
    }
  }
}

export function broadcastAgentContext(agentId: string, level: number) {
  const message = JSON.stringify({
    type: 'agent:context',
    payload: { agentId, contextLevel: level },
    timestamp: new Date().toISOString(),
  })

  for (const [, client] of clients) {
    if (client.agentIds.has(agentId) && client.ws.readyState === client.ws.OPEN) {
      client.ws.send(message)
    }
  }
}

export function broadcastWorkspaceUpdate(workspaceId: string, change: string, data: any) {
  const message = JSON.stringify({
    type: 'workspace:updated',
    payload: { workspaceId, change, data },
    timestamp: new Date().toISOString(),
  })

  for (const [, client] of clients) {
    if (client.workspaceIds.has(workspaceId) && client.ws.readyState === client.ws.OPEN) {
      client.ws.send(message)
    }
  }
}
```

---

## Dependency Injection Pattern

For better testability, use a simple DI container:

```typescript
// server/src/container.ts
import Database from 'better-sqlite3'
import { AgentRepository } from './db/repositories/agent.repository.js'
import { MessageRepository } from './db/repositories/message.repository.js'
import { WorktreeRepository } from './db/repositories/worktree.repository.js'
import { WorkspaceRepository } from './db/repositories/workspace.repository.js'
import { AgentService } from './services/agent.service.js'
import { WorkspaceService } from './services/workspace.service.js'
import { WorktreeService } from './services/worktree.service.js'
import { GitService } from './services/git.service.js'
import { ProcessManager, getProcessManager } from './services/process.service.js'

export interface Container {
  db: Database.Database
  repositories: {
    agent: AgentRepository
    message: MessageRepository
    worktree: WorktreeRepository
    workspace: WorkspaceRepository
  }
  services: {
    agent: AgentService
    workspace: WorkspaceService
    worktree: WorktreeService
  }
  processManager: ProcessManager
}

export function createContainer(db: Database.Database): Container {
  // Repositories
  const repositories = {
    agent: new AgentRepository(db),
    message: new MessageRepository(db),
    worktree: new WorktreeRepository(db),
    workspace: new WorkspaceRepository(db),
  }

  // Process manager (singleton)
  const processManager = getProcessManager()

  // Services
  const services = {
    agent: new AgentService(
      repositories.agent,
      repositories.message,
      repositories.worktree
    ),
    workspace: new WorkspaceService(repositories.workspace, repositories.worktree),
    worktree: new WorktreeService(repositories.worktree, repositories.agent),
  }

  return {
    db,
    repositories,
    services,
    processManager,
  }
}
```

This implementation guide provides the core patterns and structures needed for the backend. Each component is designed to be testable, maintainable, and aligned with the API specification.
