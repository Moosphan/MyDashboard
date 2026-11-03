interface UsageContents {
  loadURL(url: string): Promise<unknown>
  executeJavaScript(source: string): Promise<unknown>
  stop(): void
  isDestroyed(): boolean
  on(event: string, listener: (...args: any[]) => void): unknown
  removeListener(event: string, listener: (...args: any[]) => void): unknown
  setWindowOpenHandler(handler: () => { action: 'deny' }): void
}

interface UsageWindow {
  webContents: UsageContents
  isDestroyed(): boolean
  destroy(): void
  on(event: string, listener: () => void): unknown
  removeListener(event: string, listener: () => void): unknown
}

const tokenScript = `(() => {
  try {
    const bootstrap = document.getElementById('client-bootstrap')
    const data = bootstrap?.textContent ? JSON.parse(bootstrap.textContent) : null
    const token = data?.session?.accessToken || data?.session?.access_token
    return typeof token === 'string' && token ? token : null
  } catch { return null }
})()`

export async function withUsageSession(
  createWindow: () => UsageWindow,
  signal: AbortSignal,
  read: (token: string | undefined) => Promise<void>,
  pageTimeoutMs = 20_000,
): Promise<void> {
  if (signal.aborted) throw new Error('用量刷新已取消')
  const window = createWindow()
  const contents = window.webContents
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const destroy = () => {
    if (!contents.isDestroyed()) contents.stop()
    if (!window.isDestroyed()) window.destroy()
  }
  signal.addEventListener('abort', destroy, { once: true })
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const cleanup = () => {
        clearTimeout(timer)
        contents.removeListener('did-finish-load', loaded)
        contents.removeListener('did-fail-load', failed)
        window.removeListener('closed', closed)
        signal.removeEventListener('abort', aborted)
      }
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        cleanup()
        if (error) reject(error)
        else resolve()
      }
      const loaded = () => finish()
      const failed = (_event: unknown, _code: number, _description: string, _url: string, mainFrame: boolean) => {
        if (mainFrame) finish(new Error('用量会话页面加载失败'))
      }
      const aborted = () => finish(new Error('用量刷新已取消'))
      const closed = () => finish(new Error(signal.aborted ? '用量刷新已取消' : '用量会话页面已关闭'))
      const timer = setTimeout(() => finish(new Error('用量会话页面加载超时')), pageTimeoutMs)
      contents.on('did-finish-load', loaded)
      contents.on('did-fail-load', failed)
      window.on('closed', closed)
      signal.addEventListener('abort', aborted, { once: true })
      if (signal.aborted) aborted()
      else void contents.loadURL('https://chatgpt.com').catch(() => finish(new Error('用量会话页面加载失败')))
    })
    if (signal.aborted || window.isDestroyed()) throw new Error('用量刷新已取消')
    const token = await new Promise<unknown>((resolve, reject) => {
      const finish = (error?: unknown, value?: unknown) => {
        signal.removeEventListener('abort', abort)
        if (error) reject(error)
        else resolve(value)
      }
      const abort = () => finish(new Error('用量刷新已取消'))
      signal.addEventListener('abort', abort, { once: true })
      void contents.executeJavaScript(tokenScript).then(value => finish(undefined, value), finish)
      if (signal.aborted) abort()
    })
    if (signal.aborted || window.isDestroyed()) throw new Error('用量刷新已取消')
    await read(typeof token === 'string' && token ? token : undefined)
  } finally {
    signal.removeEventListener('abort', destroy)
    destroy()
  }
}
