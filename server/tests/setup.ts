import { beforeAll, afterAll, beforeEach } from 'vitest'
import { initDatabase, closeDatabase, getDatabase } from '../src/db/index.js'
import { runMigrations } from '../src/db/migrate.js'
import { join } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'

let testDbDir: string

beforeAll(() => {
  // Create a temporary directory for test database
  testDbDir = mkdtempSync(join(tmpdir(), 'claude-manager-test-'))
  const testDbPath = join(testDbDir, 'test.db')

  // Initialize test database
  initDatabase(testDbPath)
  runMigrations()
})

beforeEach(() => {
  // Clean up tables before each test (optional, use if needed)
  const db = getDatabase()

  // Clear all data but keep schema
  db.exec(`
    DELETE FROM agent_sessions;
    DELETE FROM messages;
    DELETE FROM agents;
    DELETE FROM worktrees;
    DELETE FROM workspaces;
    DELETE FROM usage_stats;
  `)
})

afterAll(() => {
  // Close database connection
  closeDatabase()

  // Clean up temporary directory
  try {
    rmSync(testDbDir, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
})
