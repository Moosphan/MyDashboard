const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { createServer } = require('node:net')
const { setTimeout: delay } = require('node:timers/promises')

async function main() {
  const application = process.argv[2]
  assert.ok(application, 'Pass the absolute MyDashboard.app directory')
  const root = mkdtempSync(join(tmpdir(), 'voice-design-package-'))
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  const child = spawn(
    join(application, 'Contents/MacOS/MyDashboard'),
    [`--remote-debugging-port=${port}`],
    { env: { ...process.env, MYDASHBOARD_USER_DATA: root }, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let logs = ''
  child.stdout.on('data', (data) => {
    logs = (logs + data.toString()).slice(-20000)
  })
  child.stderr.on('data', (data) => {
    logs = (logs + data.toString()).slice(-20000)
  })
  let socket
  const pending = new Map()
  let sequence = 0
  try {
    let target
    for (let attempt = 0; attempt < 200; attempt++) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
        target = targets.find((item) => item.type === 'page' && item.url.startsWith('file:'))
        if (target) break
      } catch {}
      if (child.exitCode !== null) throw new Error(`Package exited: ${child.exitCode}`)
      await delay(100)
    }
    assert.ok(target, 'Packaged renderer available')
    socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      if (message.error) request.reject(new Error(JSON.stringify(message.error)))
      else request.resolve(message.result)
    })
    const call = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++sequence
        pending.set(id, { resolve, reject })
        socket.send(JSON.stringify({ id, method, params }))
      })
    const evaluate = async (expression) => {
      const response = await call('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true,
      })
      if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails))
      return response.result.value
    }
    const waitFor = async (expression) => {
      for (let attempt = 0; attempt < 150; attempt++) {
        if (await evaluate(`Boolean(${expression})`)) return
        await delay(100)
      }
      throw new Error(`Timed out: ${expression}`)
    }
    await waitFor('document.querySelector("nav")')
    await evaluate(
      "window.history.pushState({},'', '/video');window.dispatchEvent(new PopStateEvent('popstate'))",
    )
    await waitFor(
      '[...document.querySelectorAll("button")].some(item=>item.textContent.includes("AI 配音"))',
    )
    await evaluate(
      "[...document.querySelectorAll('button')].find(item=>item.textContent.includes('AI 配音')).click()",
    )
    await waitFor('document.querySelector("input[value=design]")')
    await evaluate('document.querySelector("input[value=design]").click()')
    await waitFor('document.querySelector("[data-voice-design]")')
    const plans = await evaluate("window.electronAPI.invoke('tts:listVoiceDesigns')")
    assert.equal(plans.success, true)
    assert.equal(plans.data.filter((item) => item.builtin).length, 4)
    await evaluate(
      "[...document.querySelectorAll('button')].find(item=>item.textContent==='试听内置声音').click()",
    )
    await waitFor(
      'document.querySelector(".voiceover-dialog audio")?.src.startsWith("data:audio/wav")',
    )
    assert.match(await evaluate('document.querySelector("[role=dialog]").textContent'), /原始样音/)
    await evaluate(
      "(()=>{const field=document.querySelector('[data-design-description]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'少女感，轻柔软糯，带气声。');field.dispatchEvent(new Event('input',{bubbles:true}))})()",
    )
    await waitFor('!document.querySelector(".voiceover-dialog audio")?.getAttribute("src")')
    assert.ok(
      await evaluate(
        "[...document.querySelectorAll('button')].find(item=>item.textContent==='试听内置声音').disabled",
      ),
    )
    await evaluate(
      "[...document.querySelectorAll('summary')].find(item=>item.textContent==='细化声音特征').click()",
    )
    assert.equal(
      await evaluate('document.querySelectorAll("[data-voice-design] input[type=range]").length'),
      8,
    )
    writeFileSync(
      join(root, 'package.png'),
      Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
    )
    console.log(
      'PASS packaged Voice Design IPC, bundled WAV, custom preview isolation and eight emotion controls',
      root,
    )
  } catch (error) {
    console.error(logs)
    throw error
  } finally {
    socket?.close()
    child.kill('SIGTERM')
    await delay(1000)
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    writeFileSync(join(root, 'package.log'), logs)
  }
}
const timeout = setTimeout(() => {
  console.error('Package smoke timed out')
  process.exit(1)
}, 60000)
main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => clearTimeout(timeout))
