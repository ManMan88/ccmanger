import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { ProcessError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { config } from '../config/index.js'
import type { AgentMode, AgentStatus } from '@claude-manager/shared'

export interface AgentProcess {
  pid: number
  agentId: string
  process: ChildProcess
  status: AgentStatus
  outputBuffer: string
  startedAt: Date
}

export interface SpawnAgentOptions {
  agentId: string
  workingDir: string
  mode: AgentMode
  permissions: string[]
  initialPrompt?: string
  sessionId?: string
}

export interface ProcessManagerEvents {
  'agent:output': (agentId: string, data: string, isStreaming: boolean) => void
  'agent:status': (agentId: string, status: AgentStatus) => void
  'agent:error': (agentId: string, error: Error) => void
  'agent:exit': (agentId: string, code: number | null, signal: string | null) => void
  'agent:context': (agentId: string, level: number) => void
  'agent:waiting': (agentId: string) => void
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export declare interface ProcessManager {
  on<U extends keyof ProcessManagerEvents>(event: U, listener: ProcessManagerEvents[U]): this
  emit<U extends keyof ProcessManagerEvents>(
    event: U,
    ...args: Parameters<ProcessManagerEvents[U]>
  ): boolean
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ProcessManager extends EventEmitter {
  private processes: Map<string, AgentProcess> = new Map()
  private outputBuffers: Map<string, string> = new Map()
  private contextParseTimeout: Map<string, NodeJS.Timeout> = new Map()

  constructor() {
    super()
  }

  async spawnAgent(options: SpawnAgentOptions): Promise<AgentProcess> {
    const { agentId, workingDir, mode, permissions, initialPrompt, sessionId } = options

    // Check if already running
    if (this.processes.has(agentId)) {
      throw new ProcessError(`Agent process already running: ${agentId}`)
    }

    const args = this.buildClaudeArgs(mode, permissions, sessionId, initialPrompt)

    logger.info({ agentId, workingDir, mode, args, sessionId }, 'Spawning Claude CLI')

    const proc = spawn(config.claude.cliPath, args, {
      cwd: workingDir,
      env: {
        ...process.env,
        FORCE_COLOR: '0', // Disable color codes for easier parsing
        NO_COLOR: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    if (!proc.pid) {
      throw new ProcessError(`Failed to spawn Claude CLI process for agent: ${agentId}`)
    }

    const agentProcess: AgentProcess = {
      pid: proc.pid,
      agentId,
      process: proc,
      status: 'running',
      outputBuffer: '',
      startedAt: new Date(),
    }

    this.processes.set(agentId, agentProcess)
    this.outputBuffers.set(agentId, '')

    this.setupProcessHandlers(agentProcess)

    return agentProcess
  }

  private setupProcessHandlers(agentProcess: AgentProcess): void {
    const { agentId, process: proc } = agentProcess

    // Handle stdout - this is where Claude's responses come through
    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString()
      this.handleOutput(agentId, text)
    })

    // Handle stderr - status info, context level, waiting prompts
    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      this.handleStderr(agentId, text)
    })

    // Handle process exit
    proc.on('exit', (code, signal) => {
      logger.info({ agentId, code, signal }, 'Claude CLI process exited')
      this.handleExit(agentId, code, signal)
    })

    // Handle spawn errors
    proc.on('error', (err) => {
      logger.error({ agentId, error: err }, 'Claude CLI process error')
      this.updateStatus(agentId, 'error')
      this.emit('agent:error', agentId, err)
    })
  }

  private handleOutput(agentId: string, text: string): void {
    const process = this.processes.get(agentId)
    if (!process) return

    // Accumulate output
    process.outputBuffer += text
    this.outputBuffers.set(agentId, (this.outputBuffers.get(agentId) || '') + text)

    // Check for status indicators in output
    if (this.isThinking(text)) {
      this.updateStatus(agentId, 'running')
    }

    // Emit output event for streaming
    this.emit('agent:output', agentId, text, true)
  }

  private handleStderr(agentId: string, text: string): void {
    logger.debug({ agentId, stderr: text.trim() }, 'Claude CLI stderr')

    // Parse context level from status output
    // Claude CLI shows context like "Context: 45%" or similar
    const contextMatch = text.match(/[Cc]ontext[:\s]+(\d+)%/)
    if (contextMatch) {
      const level = parseInt(contextMatch[1], 10)
      this.emit('agent:context', agentId, level)
    }

    // Check for waiting state indicators
    if (this.isWaitingForInput(text)) {
      this.updateStatus(agentId, 'waiting')
      this.emit('agent:waiting', agentId)
    }

    // Check for error indicators
    if (this.isErrorState(text)) {
      this.updateStatus(agentId, 'error')
    }
  }

  private handleExit(agentId: string, code: number | null, signal: string | null): void {
    const process = this.processes.get(agentId)
    if (!process) return

    // Clear any pending timeouts
    const timeout = this.contextParseTimeout.get(agentId)
    if (timeout) {
      clearTimeout(timeout)
      this.contextParseTimeout.delete(agentId)
    }

    // Determine final status
    const status: AgentStatus = code === 0 ? 'finished' : 'error'
    process.status = status

    // Emit final output if there's buffered content
    const buffer = this.outputBuffers.get(agentId)
    if (buffer && buffer.trim()) {
      this.emit('agent:output', agentId, '', false) // Signal end of stream
    }

    this.emit('agent:status', agentId, status)
    this.emit('agent:exit', agentId, code, signal)

    // Cleanup
    this.processes.delete(agentId)
    this.outputBuffers.delete(agentId)
  }

  private buildClaudeArgs(
    mode: AgentMode,
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

    // Resume session if provided
    if (sessionId) {
      args.push('--resume', sessionId)
    }

    // Permissions (for non-auto mode)
    if (mode !== 'auto') {
      if (permissions.includes('write')) {
        args.push('--allowedTools', 'Write,Edit')
      }
      if (permissions.includes('execute')) {
        args.push('--allowedTools', 'Bash')
      }
    }

    // Initial prompt (only if no session resumption)
    if (initialPrompt && !sessionId) {
      args.push('--print', initialPrompt)
    }

    // Always use verbose mode for better status tracking
    args.push('--verbose')

    return args
  }

  private isThinking(text: string): boolean {
    const thinkingPatterns = [
      /❯/,
      /Thinking/i,
      /Processing/i,
      /Analyzing/i,
      /Reading/i,
      /Writing/i,
      /Executing/i,
    ]
    return thinkingPatterns.some((pattern) => pattern.test(text))
  }

  private isWaitingForInput(text: string): boolean {
    const waitingPatterns = [
      /waiting for input/i,
      /^>\s*$/m, // Prompt character
      /\?$/m, // Question ends
      /please (provide|enter|confirm)/i,
      /human turn/i,
    ]
    return waitingPatterns.some((pattern) => pattern.test(text))
  }

  private isErrorState(text: string): boolean {
    const errorPatterns = [
      /error:/i,
      /failed:/i,
      /exception:/i,
      /fatal:/i,
      /permission denied/i,
      /rate limit/i,
    ]
    return errorPatterns.some((pattern) => pattern.test(text))
  }

  private updateStatus(agentId: string, status: AgentStatus): void {
    const process = this.processes.get(agentId)
    if (process && process.status !== status) {
      process.status = status
      this.emit('agent:status', agentId, status)
    }
  }

  async sendMessage(agentId: string, message: string): Promise<void> {
    const proc = this.processes.get(agentId)
    if (!proc) {
      throw new ProcessError(`Agent process not found: ${agentId}`)
    }

    if (!proc.process.stdin?.writable) {
      throw new ProcessError(`Agent stdin not writable: ${agentId}`)
    }

    // Write message and newline to stdin
    proc.process.stdin.write(message + '\n')

    // Update status to running since we sent a message
    this.updateStatus(agentId, 'running')

    logger.debug({ agentId, messageLength: message.length }, 'Message sent to agent')
  }

  async stopAgent(agentId: string, force = false): Promise<void> {
    const proc = this.processes.get(agentId)
    if (!proc) {
      logger.warn({ agentId }, 'Agent process not found for stop')
      return
    }

    logger.info({ agentId, force, pid: proc.pid }, 'Stopping agent')

    if (force) {
      proc.process.kill('SIGKILL')
    } else {
      // Try graceful shutdown first
      proc.process.stdin?.end()
      proc.process.kill('SIGTERM')

      // Force kill after timeout if still running
      setTimeout(() => {
        if (this.processes.has(agentId)) {
          logger.warn({ agentId }, 'Force killing agent after timeout')
          proc.process.kill('SIGKILL')
        }
      }, 5000)
    }
  }

  getProcess(agentId: string): AgentProcess | undefined {
    return this.processes.get(agentId)
  }

  getOutputBuffer(agentId: string): string {
    return this.outputBuffers.get(agentId) || ''
  }

  clearOutputBuffer(agentId: string): void {
    this.outputBuffers.set(agentId, '')
    const proc = this.processes.get(agentId)
    if (proc) {
      proc.outputBuffer = ''
    }
  }

  getAllProcesses(): AgentProcess[] {
    return Array.from(this.processes.values())
  }

  isRunning(agentId: string): boolean {
    const proc = this.processes.get(agentId)
    return proc?.status === 'running' || proc?.status === 'waiting'
  }

  getStatus(agentId: string): AgentStatus | null {
    return this.processes.get(agentId)?.status || null
  }

  getRunningCount(): number {
    return Array.from(this.processes.values()).filter(
      (p) => p.status === 'running' || p.status === 'waiting'
    ).length
  }

  async stopAllAgents(force = false): Promise<void> {
    const agentIds = Array.from(this.processes.keys())
    await Promise.all(agentIds.map((id) => this.stopAgent(id, force)))
  }

  cleanup(): void {
    // Clear all timeouts
    for (const timeout of this.contextParseTimeout.values()) {
      clearTimeout(timeout)
    }
    this.contextParseTimeout.clear()

    // Stop all processes
    this.stopAllAgents(true)

    // Clear all maps
    this.processes.clear()
    this.outputBuffers.clear()
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

export function resetProcessManager(): void {
  if (processManager) {
    processManager.cleanup()
    processManager = null
  }
}
