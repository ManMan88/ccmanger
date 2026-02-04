import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { config } from '../config/index.js'
import { logger } from '../utils/logger.js'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function initDatabase(dbPath?: string): Database.Database {
  const path = dbPath || config.database.path

  // Ensure directory exists
  const dir = dirname(path)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    logger.info({ dir }, 'Created database directory')
  }

  // Create backup directory
  if (!existsSync(config.database.backupDir)) {
    mkdirSync(config.database.backupDir, { recursive: true })
  }

  db = new Database(path)

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('cache_size = -64000') // 64MB cache
  db.pragma('foreign_keys = ON')

  logger.info({ path }, 'Database initialized')

  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    logger.info('Database connection closed')
  }
}

export function createBackup(): string {
  if (!db) {
    throw new Error('Database not initialized')
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${config.database.backupDir}/data.db.bak.${timestamp}`

  db.backup(backupPath)

  logger.info({ backupPath }, 'Database backup created')

  return backupPath
}
