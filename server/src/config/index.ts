import { env } from './env.js'
import { homedir } from 'os'
import { join } from 'path'

// Application data directory
const dataDir = join(homedir(), '.claude-manager')

export const config = {
  // Server
  host: env.HOST,
  port: env.PORT,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',

  // Database
  database: {
    path: env.DATABASE_PATH || join(dataDir, 'data.db'),
    backupDir: join(dataDir, 'backups'),
  },

  // Logging
  logLevel: env.LOG_LEVEL,

  // CORS
  cors: {
    origin: env.CORS_ORIGIN,
  },

  // Directories
  dataDir,
} as const

export type Config = typeof config
