import pino from 'pino'
import { config } from '../config/index.js'

const transport = config.isDevelopment
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    }
  : undefined

export const logger = pino({
  level: config.logLevel,
  transport,
})

export type Logger = typeof logger
