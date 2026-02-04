import { createHash } from 'crypto'
import type Database from 'better-sqlite3'
import { initDatabase, closeDatabase, getDatabase } from './index.js'
import { logger } from '../utils/logger.js'

// Import migrations
import * as migration001 from './migrations/001_initial_schema.js'

interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
  down: (db: Database.Database) => void
}

// Register all migrations here
const migrations: Migration[] = [migration001]

function computeChecksum(migration: Migration): string {
  const content = migration.up.toString() + migration.down.toString()
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

interface AppliedMigration {
  version: number
  name: string
  applied_at: string
  checksum: string
}

function getAppliedMigrations(db: Database.Database): AppliedMigration[] {
  try {
    return db
      .prepare('SELECT * FROM schema_migrations ORDER BY version')
      .all() as AppliedMigration[]
  } catch {
    // Table doesn't exist yet
    return []
  }
}

export function runMigrations(db?: Database.Database): void {
  const database = db || getDatabase()
  const applied = getAppliedMigrations(database)
  const appliedVersions = new Set(applied.map((m) => m.version))

  const pending = migrations.filter((m) => !appliedVersions.has(m.version))

  if (pending.length === 0) {
    logger.info('No pending migrations')
    return
  }

  logger.info({ count: pending.length }, 'Running migrations')

  for (const migration of pending.sort((a, b) => a.version - b.version)) {
    const checksum = computeChecksum(migration)

    logger.info({ version: migration.version, name: migration.name }, 'Applying migration')

    database.transaction(() => {
      migration.up(database)

      database
        .prepare(
          `
        INSERT INTO schema_migrations (version, name, checksum)
        VALUES (?, ?, ?)
      `
        )
        .run(migration.version, migration.name, checksum)
    })()

    logger.info({ version: migration.version }, 'Migration applied')
  }

  logger.info('All migrations complete')
}

export function rollbackMigration(db?: Database.Database): void {
  const database = db || getDatabase()
  const applied = getAppliedMigrations(database)

  if (applied.length === 0) {
    logger.info('No migrations to rollback')
    return
  }

  const latest = applied[applied.length - 1]
  const migration = migrations.find((m) => m.version === latest.version)

  if (!migration) {
    throw new Error(`Migration ${latest.version} not found`)
  }

  logger.info({ version: migration.version, name: migration.name }, 'Rolling back migration')

  database.transaction(() => {
    migration.down(database)

    database.prepare('DELETE FROM schema_migrations WHERE version = ?').run(migration.version)
  })()

  logger.info({ version: migration.version }, 'Migration rolled back')
}

// CLI entry point
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  const isDown = process.argv.includes('--down')

  initDatabase()

  if (isDown) {
    rollbackMigration()
  } else {
    runMigrations()
  }

  closeDatabase()
}
