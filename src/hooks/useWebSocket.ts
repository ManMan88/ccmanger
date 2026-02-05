import { useEffect, useState, useCallback, useRef } from 'react'
import { wsClient } from '@/lib/websocket'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

/**
 * Hook for WebSocket connection management
 */
export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(wsClient.isConnected)
  const [status, setStatus] = useState<ConnectionStatus>(wsClient.status)
  const connectingRef = useRef(false)

  useEffect(() => {
    // Subscribe to status changes
    const unsubscribe = wsClient.onStatusChange((newStatus) => {
      setStatus(newStatus)
      setIsConnected(newStatus === 'connected')
    })

    // Connect on mount if not already connected
    if (!wsClient.isConnected && !connectingRef.current) {
      connectingRef.current = true
      wsClient
        .connect()
        .then(() => {
          setIsConnected(true)
          setStatus('connected')
        })
        .catch((err) => {
          console.error('WebSocket connection failed:', err)
          setIsConnected(false)
          setStatus('error')
        })
        .finally(() => {
          connectingRef.current = false
        })
    }

    return () => {
      unsubscribe()
    }
  }, [])

  const subscribeToAgent = useCallback((agentId: string) => {
    wsClient.subscribeToAgent(agentId)
    return () => wsClient.unsubscribeFromAgent(agentId)
  }, [])

  const subscribeToWorkspace = useCallback((workspaceId: string) => {
    wsClient.subscribeToWorkspace(workspaceId)
    return () => wsClient.unsubscribeFromWorkspace(workspaceId)
  }, [])

  const on = useCallback((type: string, handler: (data: unknown) => void) => {
    return wsClient.on(type, handler)
  }, [])

  const reconnect = useCallback(() => {
    if (!wsClient.isConnected && !connectingRef.current) {
      connectingRef.current = true
      wsClient
        .connect()
        .catch(console.error)
        .finally(() => {
          connectingRef.current = false
        })
    }
  }, [])

  return {
    isConnected,
    status,
    subscribeToAgent,
    subscribeToWorkspace,
    on,
    reconnect,
  }
}

/**
 * Hook for subscribing to a specific agent's updates
 */
export function useAgentSubscription(agentId: string | null) {
  const { subscribeToAgent, isConnected } = useWebSocket()

  useEffect(() => {
    if (!agentId || !isConnected) return

    const unsubscribe = subscribeToAgent(agentId)
    return unsubscribe
  }, [agentId, isConnected, subscribeToAgent])
}

/**
 * Hook for subscribing to workspace updates
 */
export function useWorkspaceSubscription(workspaceId: string | null) {
  const { subscribeToWorkspace, isConnected } = useWebSocket()

  useEffect(() => {
    if (!workspaceId || !isConnected) return

    const unsubscribe = subscribeToWorkspace(workspaceId)
    return unsubscribe
  }, [workspaceId, isConnected, subscribeToWorkspace])
}

/**
 * Hook for listening to specific WebSocket events
 */
export function useWebSocketEvent<T = unknown>(eventType: string, handler: (data: T) => void) {
  const { on } = useWebSocket()

  useEffect(() => {
    const unsubscribe = on(eventType, handler as (data: unknown) => void)
    return unsubscribe
  }, [eventType, handler, on])
}
