/**
 * PM2 Ecosystem Configuration for Claude Manager
 *
 * Usage:
 *   pm2 start ecosystem.config.js              # Start in development mode
 *   pm2 start ecosystem.config.js --env production  # Start in production mode
 *   pm2 restart claude-manager                 # Restart
 *   pm2 stop claude-manager                    # Stop
 *   pm2 delete claude-manager                  # Remove from PM2
 *   pm2 logs claude-manager                    # View logs
 *   pm2 monit                                  # Monitor all processes
 */

const os = require('os')
const path = require('path')

// Default data directory
const dataDir = process.env.DATA_DIR || path.join(os.homedir(), '.claude-manager')

module.exports = {
  apps: [
    {
      name: 'claude-manager',
      script: 'server/dist/index.js',

      // Process management
      instances: 1, // Single instance (SQLite doesn't support concurrent writes)
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',

      // Restart behavior
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 1000,

      // Logging
      error_file: path.join(dataDir, 'logs', 'error.log'),
      out_file: path.join(dataDir, 'logs', 'out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Environment - Development
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        HOST: '127.0.0.1',
        LOG_LEVEL: 'debug',
        DATA_DIR: dataDir,
      },

      // Environment - Production
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        HOST: '0.0.0.0',
        LOG_LEVEL: 'info',
        DATA_DIR: dataDir,
      },

      // Graceful shutdown
      kill_timeout: 10000,
      listen_timeout: 10000,
      shutdown_with_message: true,

      // Health check
      wait_ready: true,
      listen_timeout: 30000,
    },
  ],
}
