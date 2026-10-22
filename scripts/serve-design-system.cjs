const http = require('node:http')
const { createReadStream, statSync } = require('node:fs')
const { resolve, sep, extname } = require('node:path')

const root = resolve(__dirname, '..')
const allowed = ['docs/design-system', 'assets', 'src/renderer/assets/logos'].map(
  (folder) => resolve(root, folder) + sep,
)
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}
const port = Number(process.env.DESIGN_SYSTEM_PORT || 3034)
const server = http.createServer((request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405).end()
      return
    }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    if (pathname === '/' || pathname === '/docs/design-system/') {
      response.writeHead(302, { Location: '/docs/design-system/index.html' }).end()
      return
    }
    const file = resolve(root, `.${pathname}`)
    if (!allowed.some((folder) => file.startsWith(folder)) || !types[extname(file)]) {
      response.writeHead(403).end('Not available')
      return
    }
    const stat = statSync(file)
    if (!stat.isFile()) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { 'Content-Type': types[extname(file)], 'Cache-Control': 'no-store' })
    if (request.method === 'HEAD') response.end()
    else
      createReadStream(file)
        .on('error', () => response.destroy())
        .pipe(response)
  } catch {
    response.writeHead(404).end('Not found')
  }
})
server.listen(port, '127.0.0.1', () =>
  console.log(`Design preview: http://127.0.0.1:${port}/docs/design-system/index.html`),
)
