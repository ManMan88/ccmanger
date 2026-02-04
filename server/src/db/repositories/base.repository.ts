import Database from 'better-sqlite3'
import { generateId } from '@claude-manager/shared'

export type IdPrefix = 'ws' | 'wt' | 'ag' | 'msg' | 'ses'

export abstract class BaseRepository<TRow> {
  constructor(protected readonly db: Database.Database) {}

  protected generateId(prefix: IdPrefix): string {
    return generateId(prefix)
  }

  protected now(): string {
    return new Date().toISOString()
  }

  protected transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)()
  }
}
