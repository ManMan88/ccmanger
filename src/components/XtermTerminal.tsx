import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface XtermTerminalProps {
  agentId: string
  isActive: boolean
}

const MAX_RECONNECT_ATTEMPTS = 5

export function XtermTerminal({ agentId, isActive }: XtermTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const intentionalCloseRef = useRef(false)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const disposersRef = useRef<{
    onData: { dispose(): void }
    onResize: { dispose(): void }
  } | null>(null)

  // Create xterm.js terminal once
  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'monospace',
      theme: {
        background: '#300a24',
      },
      convertEol: true,
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)
    fitAddon.fit()

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [])

  // Connect PTY WebSocket when agent process is alive
  useEffect(() => {
    if (!isActive || !terminalRef.current) return

    intentionalCloseRef.current = false
    reconnectAttemptRef.current = 0

    const terminal = terminalRef.current

    function connect() {
      const ws = new WebSocket(`ws://127.0.0.1:3001/ws/pty/${agentId}`)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onmessage = (event) => {
        const data = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : event.data
        terminal.write(data)
      }

      // Send keystrokes to PTY
      const onData = terminal.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(new TextEncoder().encode(data))
        }
      })

      // Send resize events
      const onResize = terminal.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', rows, cols }))
        }
      })

      disposersRef.current = { onData, onResize }

      // Send initial size once connected
      ws.onopen = () => {
        if (reconnectAttemptRef.current > 0) {
          terminal.writeln('\r\n\x1b[32m[Reconnected]\x1b[0m')
        }
        reconnectAttemptRef.current = 0
        const { cols, rows } = terminal
        ws.send(JSON.stringify({ type: 'resize', rows, cols }))
      }

      ws.onerror = () => {
        if (!intentionalCloseRef.current) {
          terminal.writeln('\r\n\x1b[31m[WebSocket connection error]\x1b[0m')
        }
      }

      ws.onclose = () => {
        if (disposersRef.current) {
          disposersRef.current.onData.dispose()
          disposersRef.current.onResize.dispose()
          disposersRef.current = null
        }

        if (intentionalCloseRef.current) return

        reconnectAttemptRef.current++
        if (reconnectAttemptRef.current <= MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 8000)
          terminal.writeln(
            `\r\n\x1b[33m[Connection lost - reconnecting in ${delay / 1000}s (attempt ${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS})]\x1b[0m`
          )
          reconnectTimeoutRef.current = setTimeout(connect, delay)
        } else {
          terminal.writeln('\r\n\x1b[31m[Connection lost - reopen terminal to retry]\x1b[0m')
        }
      }
    }

    connect()

    return () => {
      intentionalCloseRef.current = true
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      if (disposersRef.current) {
        disposersRef.current.onData.dispose()
        disposersRef.current.onResize.dispose()
        disposersRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [agentId, isActive])

  return <div ref={containerRef} className="h-full w-full" />
}
