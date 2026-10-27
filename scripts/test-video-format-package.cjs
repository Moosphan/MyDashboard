const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { randomUUID } = require('node:crypto')
const { createServer } = require('node:net')
const { setTimeout: delay } = require('node:timers/promises')

async function main() {
  const application = process.argv[2]
  assert.ok(application, 'Pass the absolute MyDashboard.app directory')
  const root = mkdtempSync(join(tmpdir(), 'video-format-package-'))
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
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (data) => {
      logs = (logs + data.toString()).slice(-20000)
    })
  let socket
  const pending = new Map()
  let sequence = 0
  try {
    let target
    for (let attempt = 0; attempt < 200; attempt++) {
      try {
        target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(
          (item) => item.type === 'page' && item.url.startsWith('file:'),
        )
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
    const evaluate = async (expression) => {
      const response = await new Promise((resolve, reject) => {
        const id = ++sequence
        pending.set(id, { resolve, reject })
        socket.send(
          JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: { expression, returnByValue: true, awaitPromise: true, userGesture: true },
          }),
        )
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
    const call = async (action, ...args) => {
      const response = await evaluate(
        `window.electronAPI.invoke(${JSON.stringify('workflow:' + action)}, ...${JSON.stringify(args)})`,
      )
      assert.equal(response.success, true, response.error)
      return response.data
    }
    await waitFor('window.electronAPI && document.querySelector("nav")')
    let project = await call('create', '竖版打包验证')
    for (const [stage, payload] of [
      ['brief', { text: '抖音竖版全屏，打包验证', duration: 10, format: 'portrait' }],
      ['copy', { text: '从历史走向人间。依据史料讲清人物与时代。' }],
      [
        'storyboard',
        {
          mode: 'template',
          template: 'history',
          format: 'portrait',
          scenes: [
            { id: 'one', title: '从历史走向人间', body: '依据史料讲清人物与时代', layout: 'title' },
          ],
        },
      ],
    ]) {
      project = await call('save', project.id, stage, payload, project.revision, randomUUID())
      if (stage !== 'storyboard')
        project = await call(
          'approve',
          project.id,
          stage,
          project.stages[stage].id,
          project.revision,
          randomUUID(),
        )
    }
    await evaluate(
      "window.history.pushState({},'', '/video');window.dispatchEvent(new PopStateEvent('popstate'))",
    )
    await waitFor('document.querySelector(".workflow-project-row")')
    await evaluate(
      "[...document.querySelectorAll('button')].find(item=>item.textContent.trim()==='继续创作').click()",
    )
    await evaluate('document.querySelectorAll(".workflow-step-button")[2].click()')
    await waitFor('document.querySelector(".workflow-preview iframe")')
    assert.equal(
      await evaluate('document.querySelector(".workflow-preview iframe").style.width'),
      '1080px',
    )
    assert.equal(
      await evaluate('document.querySelector(".workflow-preview iframe").style.height'),
      '1920px',
    )
    assert.ok(await evaluate('document.body.textContent.includes("竖版 9:16 · 1080×1920")'))
    writeFileSync(
      join(root, 'verification.json'),
      JSON.stringify(
        {
          packaged: true,
          projectId: project.id,
          format: project.stages.storyboard.payload.format,
          width: 1080,
          height: 1920,
        },
        null,
        2,
      ),
    )
    console.log(
      'PASS: packaged app persists portrait brief, validates templates and displays portrait storyboard. Artifacts:',
      root,
    )
  } catch (error) {
    console.error(logs)
    throw error
  } finally {
    socket?.close()
    child.kill('SIGTERM')
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
