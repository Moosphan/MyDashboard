#!/usr/bin/env node
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.cwd(), '../../..')
// Runtime probes must never be treated as a generation request. An absent
// --output-last-message previously selected argv[0] (the Node executable).
if (process.argv.includes('--version')) {
  console.log('cover-agent fixture 1.0.0')
  process.exit(0)
}
if (process.argv[2] === 'mcp' && process.argv[3] === 'list') {
  console.log('[]')
  process.exit(0)
}
const outputIndex = process.argv.indexOf('--output-last-message')
if (!process.argv.includes('--image') && (outputIndex < 0 || !process.argv[outputIndex + 1])) {
  console.error('Fixture requires --output-last-message for code generation')
  process.exit(2)
}
const mode = existsSync(join(root, 'cover-mode')) ? readFileSync(join(root, 'cover-mode'), 'utf8') : ''
if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 30000))
if (process.argv.includes('--image')) {
  if (mode === 'download-error') {
    const { createServer } = await import('node:http')
    const server = createServer((_request, response) => {
      writeFileSync(join(root, 'cover-generation-count'), '1')
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({data:[{url:'https://image-recovery.example/generated-cover.png'}]}))
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/images/edits`, {method:'POST'})
    await response.json()
    await new Promise(resolve => server.close(resolve))
    console.error('Image generated; downloading image file.\nFailed to download generated image: The operation timed out.')
    process.exit(1)
  }
  if (mode === 'api-error') {
    process.stderr.write('OpenAI edits API error: HTTP 503 upstream unavailable\nAuthorization: Bearer test-private-token\nOPENAI_API_KEY=test-private-key\nsk-exampleSensitiveCredential12345\n')
    process.exit(1)
  }
  const args = process.argv.slice(2)
  writeFileSync(join(root, 'cover-image-args.json'), JSON.stringify(args))
  const target = args[args.indexOf('--image') + 1]
  if (mode === 'invalid') writeFileSync(target, 'not an image')
  else copyFileSync(join(root, 'cover-source.png'), target)
} else {
  let prompt = ''
  for await (const chunk of process.stdin) prompt += chunk
  writeFileSync(join(root, 'cover-prompt.txt'), prompt)
  const html = height => `<style>body{background:#f8f0db;color:#392456;font-family:system-ui}main{width:1600px;height:${height}px;padding:85px;display:grid;grid-template-columns:1.2fr 1fr;gap:60px;align-items:center}h1{font-size:98px;margin:20px 0}p{font-size:36px}.card{padding:45px;background:#dfd0ee;border-radius:40px;font-size:48px;line-height:1.8}</style><main><div><p>技术创作 · 从内容到发布</p><h1>${mode === 'v2' ? '让封面更有说服力' : '一份内容，两种封面'}</h1><p>保留视频风格，让主题一眼可见</p></div><div class="card">内容依据<br>视觉层次<br>双比例适配</div></main>`
  const result = JSON.stringify(mode === 'invalid' ? { feedHtml: '' } : {
    feedHtml: html(1200), landscapeHtml: html(900),
  })
  const output = process.argv[outputIndex + 1]
  writeFileSync(output, result)
}
