import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest'
import { EventEmitter } from 'events'
import { ChildProcess } from 'child_process'
import {
  ProcessManager,
  resetProcessManager,
  getProcessManager,
} from '../../../src/services/process.service.js'

// Mock child_process.spawn
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

// Mock config
vi.mock('../../../src/config/index.js', () => ({
  config: {
    claude: {
      cliPath: 'claude',
      timeout: 300000,
    },
  },
}))

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Helper to create mock child process
function createMockProcess(pid = 12345): ChildProcess {
  const mockProc = new EventEmitter() as ChildProcess & {
    stdout: EventEmitter
    stderr: EventEmitter
    stdin: { write: Mock; end: Mock; writable: boolean }
    kill: Mock
    pid: number
  }
  mockProc.stdout = new EventEmitter()
  mockProc.stderr = new EventEmitter()
  mockProc.stdin = {
    write: vi.fn(),
    end: vi.fn(),
    writable: true,
  }
  mockProc.kill = vi.fn()
  mockProc.pid = pid
  return mockProc
}

describe('ProcessManager', () => {
  let processManager: ProcessManager
  let mockSpawn: Mock
  let mockProcess: ChildProcess

  beforeEach(async () => {
    // Reset singleton
    resetProcessManager()

    // Setup spawn mock
    const { spawn } = await import('child_process')
    mockSpawn = spawn as Mock
    mockProcess = createMockProcess()
    mockSpawn.mockReturnValue(mockProcess)

    // Create fresh instance
    processManager = getProcessManager()
  })

  afterEach(() => {
    vi.clearAllMocks()
    resetProcessManager()
  })

  describe('spawnAgent', () => {
    it('should spawn a Claude CLI process', async () => {
      const result = await processManager.spawnAgent({
        agentId: 'ag_test123',
        workingDir: '/test/path',
        mode: 'regular',
        permissions: ['read'],
      })

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--verbose']),
        expect.objectContaining({
          cwd: '/test/path',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      )

      expect(result.pid).toBe(12345)
      expect(result.agentId).toBe('ag_test123')
      expect(result.status).toBe('running')
    })

    it('should build correct args for auto mode', async () => {
      await processManager.spawnAgent({
        agentId: 'ag_auto',
        workingDir: '/test',
        mode: 'auto',
        permissions: ['read', 'write', 'execute'],
      })

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--dangerously-skip-permissions', '--verbose']),
        expect.anything()
      )
    })

    it('should build correct args for plan mode', async () => {
      await processManager.spawnAgent({
        agentId: 'ag_plan',
        workingDir: '/test',
        mode: 'plan',
        permissions: ['read'],
      })

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--plan', '--verbose']),
        expect.anything()
      )
    })

    it('should add session resumption args', async () => {
      await processManager.spawnAgent({
        agentId: 'ag_resume',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
        sessionId: 'ses_abc123',
      })

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--resume', 'ses_abc123']),
        expect.anything()
      )
    })

    it('should add initial prompt args', async () => {
      await processManager.spawnAgent({
        agentId: 'ag_prompt',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
        initialPrompt: 'Hello world',
      })

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--print', 'Hello world']),
        expect.anything()
      )
    })

    it('should throw if agent is already running', async () => {
      await processManager.spawnAgent({
        agentId: 'ag_duplicate',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
      })

      await expect(
        processManager.spawnAgent({
          agentId: 'ag_duplicate',
          workingDir: '/test',
          mode: 'regular',
          permissions: ['read'],
        })
      ).rejects.toThrow('Agent process already running')
    })

    it('should throw if spawn returns no pid', async () => {
      const noPidProcess = createMockProcess()
      // @ts-expect-error - testing null pid scenario
      noPidProcess.pid = undefined
      mockSpawn.mockReturnValueOnce(noPidProcess)

      await expect(
        processManager.spawnAgent({
          agentId: 'ag_nopid',
          workingDir: '/test',
          mode: 'regular',
          permissions: ['read'],
        })
      ).rejects.toThrow('Failed to spawn Claude CLI process')
    })
  })

  describe('event handling', () => {
    it('should emit agent:output on stdout data', async () => {
      const outputListener = vi.fn()
      processManager.on('agent:output', outputListener)

      await processManager.spawnAgent({
        agentId: 'ag_output',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
      })

      // Simulate stdout data
      const mockProc = mockProcess as { stdout: EventEmitter }
      mockProc.stdout.emit('data', Buffer.from('Hello from Claude'))

      expect(outputListener).toHaveBeenCalledWith('ag_output', 'Hello from Claude', true)
    })

    it('should emit agent:context on context level output', async () => {
      const contextListener = vi.fn()
      processManager.on('agent:context', contextListener)

      await processManager.spawnAgent({
        agentId: 'ag_context',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
      })

      // Simulate stderr with context info
      const mockProc = mockProcess as { stderr: EventEmitter }
      mockProc.stderr.emit('data', Buffer.from('Context: 45%'))

      expect(contextListener).toHaveBeenCalledWith('ag_context', 45)
    })

    it('should emit agent:status when status changes', async () => {
      const statusListener = vi.fn()
      processManager.on('agent:status', statusListener)

      await processManager.spawnAgent({
        agentId: 'ag_status',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
      })

      // Simulate waiting state
      const mockProc = mockProcess as { stderr: EventEmitter }
      mockProc.stderr.emit('data', Buffer.from('waiting for input'))

      expect(statusListener).toHaveBeenCalledWith('ag_status', 'waiting')
    })

    it('should emit agent:exit when process exits', async () => {
      const exitListener = vi.fn()
      processManager.on('agent:exit', exitListener)

      await processManager.spawnAgent({
        agentId: 'ag_exit',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
      })

      // Simulate process exit
      mockProcess.emit('exit', 0, null)

      expect(exitListener).toHaveBeenCalledWith('ag_exit', 0, null)
    })

    it('should emit agent:error on process error', async () => {
      const errorListener = vi.fn()
      processManager.on('agent:error', errorListener)

      await processManager.spawnAgent({
        agentId: 'ag_error',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
      })

      const testError = new Error('Process failed')
      mockProcess.emit('error', testError)

      expect(errorListener).toHaveBeenCalledWith('ag_error', testError)
    })
  })

  describe('sendMessage', () => {
    it('should write message to stdin', async () => {
      await processManager.spawnAgent({
        agentId: 'ag_msg',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
      })

      await processManager.sendMessage('ag_msg', 'Hello')

      const mockProc = mockProcess as { stdin: { write: Mock } }
      expect(mockProc.stdin.write).toHaveBeenCalledWith('Hello\n')
    })

    it('should throw if agent not found', async () => {
      await expect(processManager.sendMessage('ag_notfound', 'Hello')).rejects.toThrow(
        'Agent process not found'
      )
    })

    it('should throw if stdin not writable', async () => {
      const mockProc = mockProcess as { stdin: { write: Mock; writable: boolean } }
      mockProc.stdin.writable = false

      await processManager.spawnAgent({
        agentId: 'ag_nowrite',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
      })

      await expect(processManager.sendMessage('ag_nowrite', 'Hello')).rejects.toThrow(
        'Agent stdin not writable'
      )
    })
  })

  describe('stopAgent', () => {
    it('should send SIGTERM by default', async () => {
      await processManager.spawnAgent({
        agentId: 'ag_stop',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
      })

      await processManager.stopAgent('ag_stop')

      const mockProc = mockProcess as { kill: Mock; stdin: { end: Mock } }
      expect(mockProc.stdin.end).toHaveBeenCalled()
      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM')
    })

    it('should send SIGKILL when force=true', async () => {
      await processManager.spawnAgent({
        agentId: 'ag_force',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
      })

      await processManager.stopAgent('ag_force', true)

      const mockProc = mockProcess as { kill: Mock }
      expect(mockProc.kill).toHaveBeenCalledWith('SIGKILL')
    })

    it('should not throw if agent not found', async () => {
      // Should complete without error
      await expect(processManager.stopAgent('ag_notfound')).resolves.toBeUndefined()
    })
  })

  describe('isRunning', () => {
    it('should return true for running agent', async () => {
      await processManager.spawnAgent({
        agentId: 'ag_running',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
      })

      expect(processManager.isRunning('ag_running')).toBe(true)
    })

    it('should return true for waiting agent', async () => {
      await processManager.spawnAgent({
        agentId: 'ag_waiting',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
      })

      // Simulate waiting state
      const mockProc = mockProcess as { stderr: EventEmitter }
      mockProc.stderr.emit('data', Buffer.from('waiting for input'))

      expect(processManager.isRunning('ag_waiting')).toBe(true)
    })

    it('should return false for non-existent agent', () => {
      expect(processManager.isRunning('ag_notfound')).toBe(false)
    })

    it('should return false after process exits', async () => {
      await processManager.spawnAgent({
        agentId: 'ag_exited',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
      })

      // Simulate process exit
      mockProcess.emit('exit', 0, null)

      expect(processManager.isRunning('ag_exited')).toBe(false)
    })
  })

  describe('getRunningCount', () => {
    it('should count running processes', async () => {
      // Start first process
      await processManager.spawnAgent({
        agentId: 'ag_1',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
      })

      // Start second process with new mock
      const mockProcess2 = createMockProcess(12346)
      mockSpawn.mockReturnValueOnce(mockProcess2)

      await processManager.spawnAgent({
        agentId: 'ag_2',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
      })

      expect(processManager.getRunningCount()).toBe(2)
    })
  })

  describe('stopAllAgents', () => {
    it('should stop all running agents', async () => {
      // Start first process
      const mockProcess1 = createMockProcess(12345)
      mockSpawn.mockReturnValueOnce(mockProcess1)

      await processManager.spawnAgent({
        agentId: 'ag_all1',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
      })

      // Start second process
      const mockProcess2 = createMockProcess(12346)
      mockSpawn.mockReturnValueOnce(mockProcess2)

      await processManager.spawnAgent({
        agentId: 'ag_all2',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
      })

      await processManager.stopAllAgents()

      expect((mockProcess1 as { kill: Mock }).kill).toHaveBeenCalled()
      expect((mockProcess2 as { kill: Mock }).kill).toHaveBeenCalled()
    })
  })

  describe('getProcess', () => {
    it('should return process for existing agent', async () => {
      await processManager.spawnAgent({
        agentId: 'ag_get',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
      })

      const proc = processManager.getProcess('ag_get')
      expect(proc).toBeDefined()
      expect(proc!.agentId).toBe('ag_get')
    })

    it('should return undefined for non-existent agent', () => {
      expect(processManager.getProcess('ag_notfound')).toBeUndefined()
    })
  })

  describe('getStatus', () => {
    it('should return status for running agent', async () => {
      await processManager.spawnAgent({
        agentId: 'ag_getstatus',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
      })

      expect(processManager.getStatus('ag_getstatus')).toBe('running')
    })

    it('should return null for non-existent agent', () => {
      expect(processManager.getStatus('ag_notfound')).toBeNull()
    })
  })

  describe('cleanup', () => {
    it('should stop all processes and clear maps', async () => {
      await processManager.spawnAgent({
        agentId: 'ag_cleanup',
        workingDir: '/test',
        mode: 'regular',
        permissions: ['read'],
      })

      processManager.cleanup()

      expect(processManager.getRunningCount()).toBe(0)
      expect(processManager.getProcess('ag_cleanup')).toBeUndefined()
    })
  })

  describe('singleton behavior', () => {
    it('should return same instance', () => {
      const instance1 = getProcessManager()
      const instance2 = getProcessManager()
      expect(instance1).toBe(instance2)
    })

    it('should reset properly', () => {
      const instance1 = getProcessManager()
      resetProcessManager()
      const instance2 = getProcessManager()
      expect(instance1).not.toBe(instance2)
    })
  })
})
