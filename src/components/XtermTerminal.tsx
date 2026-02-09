import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface XtermTerminalProps {
  agentId: string
  isRunning: boolean
}

export function XtermTerminal({ agentId, isRunning }: XtermTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

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

  // Connect PTY WebSocket when agent is running
  useEffect(() => {
    if (!isRunning || !terminalRef.current) return

    const ws = new WebSocket(`ws://127.0.0.1:3001/ws/pty/${agentId}`)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    const terminal = terminalRef.current

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

    // Send initial size once connected
    ws.onopen = () => {
      const { cols, rows } = terminal
      ws.send(JSON.stringify({ type: 'resize', rows, cols }))
    }

    ws.onerror = () => {
      terminal.writeln('\r\n\x1b[31m[WebSocket connection error]\x1b[0m')
    }

    ws.onclose = () => {
      terminal.writeln('\r\n\x1b[33m[Session ended]\x1b[0m')
    }

    return () => {
      onData.dispose()
      onResize.dispose()
      ws.close()
      wsRef.current = null
    }
  }, [agentId, isRunning])

  return <div ref={containerRef} className="h-full w-full" />
}
