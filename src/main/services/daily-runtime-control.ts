import { createServer } from 'node:net'
import { chmodSync, readFileSync, realpathSync } from 'node:fs'

export function startDailyRuntimeControl(focus: () => void, quit: () => void): () => void {
  const path = process.env.MYDASHBOARD_DAILY_CONTROL
  if (!path) return () => {}
  const record = JSON.parse(readFileSync(path, 'utf8')) as { root: string; token: string; endpoint: string }
  if (realpathSync(process.cwd()) !== record.root || typeof record.token !== 'string' || record.token.length < 32)
    throw new Error('Invalid daily runtime control record')
  const server = createServer(socket => {
    socket.setTimeout(1500, () => socket.destroy())
    let input = ''
    socket.on('error', () => {})
    socket.on('data', chunk => {
      input += chunk.toString()
      if (input.length > 4096) { socket.destroy(); return }
      if (!input.includes('\n')) return
      try {
        const request = JSON.parse(input)
        if (request.token !== record.token || !['status', 'focus', 'stop'].includes(request.command)) { socket.end('denied\n'); return }
        socket.end('ok\n')
        if (request.command === 'focus') focus()
        if (request.command === 'stop') setImmediate(quit)
      } catch { socket.destroy() }
    })
  })
  server.on('error', () => { server.close(); quit() })
  server.listen(record.endpoint, () => {
    if (process.platform !== 'win32') chmodSync(record.endpoint, 0o600)
  })
  return () => server.close()
}
