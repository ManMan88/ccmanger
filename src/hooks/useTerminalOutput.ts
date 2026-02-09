import { useState, useCallback, useEffect, useRef } from 'react'
import { wsClient } from '@/lib/websocket'

export interface TerminalLine {
  id: string
  content: string
  type: 'stdout' | 'stderr' | 'user-input' | 'system'
  timestamp: number
}

// Global in-memory store: persists across modal open/close within session
const globalOutputStore = new Map<string, TerminalLine[]>()

/**
 * Hook for managing terminal output for an agent.
 * Subscribes to WebSocket events and stores output lines in memory.
 */
export function useTerminalOutput(agentId: string | null) {
  const [lines, setLines] = useState<TerminalLine[]>(() =>
    agentId ? (globalOutputStore.get(agentId) ?? []) : []
  )
  const linesRef = useRef(lines)

  // Sync ref with state
  useEffect(() => {
    linesRef.current = lines
  }, [lines])

  // Load lines from global store when agentId changes
  useEffect(() => {
    if (agentId) {
      const stored = globalOutputStore.get(agentId) ?? []
      setLines(stored)
    } else {
      setLines([])
    }
  }, [agentId])

  const appendLine = useCallback(
    (line: TerminalLine) => {
      if (!agentId) return
      const updated = [...(globalOutputStore.get(agentId) ?? []), line]
      globalOutputStore.set(agentId, updated)
      setLines(updated)
    },
    [agentId]
  )

  // Subscribe to agent:output events
  useEffect(() => {
    if (!agentId) return

    const unsubOutput = wsClient.on('agent:output', (data: unknown) => {
      const payload = data as { agentId: string; content: string }
      if (payload.agentId === agentId) {
        appendLine({
          id: `out_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          content: payload.content,
          type: 'stdout',
          timestamp: Date.now(),
        })
      }
    })

    const unsubError = wsClient.on('agent:error', (data: unknown) => {
      const payload = data as { agentId: string; error?: string; message?: string }
      if (payload.agentId === agentId) {
        appendLine({
          id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          content: payload.error || payload.message || '',
          type: 'stderr',
          timestamp: Date.now(),
        })
      }
    })

    const unsubTerminated = wsClient.on('agent:terminated', (data: unknown) => {
      const payload = data as { agentId: string; exitCode?: number; signal?: string }
      if (payload.agentId === agentId) {
        const reason = payload.signal
          ? `Process terminated by ${payload.signal}`
          : `Process exited with code ${payload.exitCode ?? 0}`
        appendLine({
          id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          content: reason,
          type: 'system',
          timestamp: Date.now(),
        })
      }
    })

    return () => {
      unsubOutput()
      unsubError()
      unsubTerminated()
    }
  }, [agentId, appendLine])

  const addUserInput = useCallback(
    (content: string) => {
      if (!agentId) return
      appendLine({
        id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        content,
        type: 'user-input',
        timestamp: Date.now(),
      })
    },
    [agentId, appendLine]
  )

  const clearOutput = useCallback(() => {
    if (!agentId) return
    globalOutputStore.set(agentId, [])
    setLines([])
  }, [agentId])

  return { lines, addUserInput, clearOutput }
}
