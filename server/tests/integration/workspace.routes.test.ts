import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { initDatabase, closeDatabase, getDatabase } from '../../src/db/index.js'
import { runMigrations } from '../../src/db/migrate.js'
import { join } from 'path'
import { mkdtempSync, rmSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { execSync } from 'child_process'
import type { FastifyInstance } from 'fastify'

describe('Workspace Routes Integration', () => {
  let app: FastifyInstance
  let testDir: string
  let gitRepoPath: string

  beforeAll(async () => {
    // Create temporary directory for test database and git repo
    testDir = mkdtempSync(join(tmpdir(), 'claude-manager-int-test-'))
    const testDbPath = join(testDir, 'test.db')

    initDatabase(testDbPath)
    runMigrations()

    // Create a test git repository
    gitRepoPath = join(testDir, 'test-repo')
    mkdirSync(gitRepoPath)
    execSync('git init', { cwd: gitRepoPath, stdio: 'ignore' })
    execSync('git config user.email "test@test.com"', { cwd: gitRepoPath, stdio: 'ignore' })
    execSync('git config user.name "Test"', { cwd: gitRepoPath, stdio: 'ignore' })
    execSync('touch README.md && git add . && git commit -m "Initial commit"', {
      cwd: gitRepoPath,
      stdio: 'ignore',
    })

    app = await buildApp()
  })

  beforeEach(() => {
    // Clean up tables before each test
    const db = getDatabase()
    db.exec(`
      DELETE FROM agent_sessions;
      DELETE FROM messages;
      DELETE FROM agents;
      DELETE FROM worktrees;
      DELETE FROM workspaces;
    `)
  })

  afterAll(async () => {
    await app.close()
    closeDatabase()
    try {
      rmSync(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('GET /api/workspaces', () => {
    it('should return empty array when no workspaces exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces',
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.workspaces).toHaveLength(0)
    })
  })

  describe('POST /api/workspaces', () => {
    it('should create a workspace from valid git repository', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        payload: { path: gitRepoPath },
      })

      expect(response.statusCode).toBe(201)
      const body = JSON.parse(response.body)
      expect(body.id).toMatch(/^ws_/)
      expect(body.name).toBe('test-repo')
      expect(body.path).toBe(gitRepoPath)
    })

    it('should return 400 for non-git directory', async () => {
      const nonGitDir = join(testDir, 'not-a-repo')
      mkdirSync(nonGitDir)

      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        payload: { path: nonGitDir },
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('should return 400 for non-existent path', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        payload: { path: '/nonexistent/path' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('should return 409 for duplicate workspace', async () => {
      // Create first workspace
      await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        payload: { path: gitRepoPath },
      })

      // Try to create duplicate
      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        payload: { path: gitRepoPath },
      })

      expect(response.statusCode).toBe(409)
    })
  })

  describe('GET /api/workspaces/:id', () => {
    it('should return workspace with worktrees', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        payload: { path: gitRepoPath },
      })
      const workspace = JSON.parse(createResponse.body)

      // Get workspace details
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspace.id}`,
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.id).toBe(workspace.id)
      expect(body.worktrees).toBeDefined()
      expect(Array.isArray(body.worktrees)).toBe(true)
    })

    it('should return 404 for non-existent workspace', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces/ws_nonexistent',
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('DELETE /api/workspaces/:id', () => {
    it('should delete workspace', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        payload: { path: gitRepoPath },
      })
      const workspace = JSON.parse(createResponse.body)

      // Delete workspace
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${workspace.id}`,
      })

      expect(response.statusCode).toBe(204)

      // Verify deleted
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspace.id}`,
      })
      expect(getResponse.statusCode).toBe(404)
    })

    it('should return 404 for non-existent workspace', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/workspaces/ws_nonexistent',
      })

      expect(response.statusCode).toBe(404)
    })
  })
})
