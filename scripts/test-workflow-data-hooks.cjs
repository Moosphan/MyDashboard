const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')
const { buildSync } = createRequire(require.resolve('vite/package.json'))('esbuild')
const directory = mkdtempSync(join(tmpdir(), 'synthetic-workflow-hooks-'))
buildSync({
  entryPoints: [resolve('scripts/fixtures/workflow-data-hook.tsx')],
  bundle: true,
  outfile: join(directory, 'fixture.js'),
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  alias: { '@': resolve('src/renderer'), '@shared': resolve('src/shared') },
  define: { 'process.env.NODE_ENV': '"production"' },
})
writeFileSync(
  join(directory, 'index.html'),
  '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'"><div id="root"></div><script src="fixture.js"></script>',
)
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) console.error('Fixture renderer:', message)
  })
  const evaluate = (source) => win.webContents.executeJavaScript(source, true)
  const wait = async (source) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(source)) return
      await delay(10)
    }
    throw new Error('Timed out: ' + source)
  }
  const take = async (channel, data) => {
    await wait(`requests.some(item=>item.channel===${JSON.stringify(channel)})`)
    return evaluate(
      `(()=>{const index=requests.findIndex(item=>item.channel===${JSON.stringify(channel)});const request=requests.splice(index,1)[0];request.resolve(${JSON.stringify(data)});return request.args})()`,
    )
  }
  const project = (id, phase) => ({
    id,
    title: id,
    revision: 1,
    archived: false,
    updatedAt: '2026-10-01',
    stages: {},
    history: [],
    jobs: [{ id: 'job', phase }],
    publications: [],
  })
  const summary = (id) => ({
    id,
    title: id,
    revision: 1,
    archived: false,
    updatedAt: '2026-10-01',
    sortOrder: 1,
    stages: {},
    nextStage: 'brief',
    approvedCount: 0,
    imported: false,
    format: 'landscape',
    running: false,
  })
  try {
    await win.loadFile(join(directory, 'index.html'))
    await take('workflow:list', [summary('a'), summary('b')])
    await wait('state.loading===false')
    await evaluate(
      'window.openResult="pending";void state.open("a").then(value=>window.openResult=value)',
    )
    await wait('requests.some(item=>item.channel==="workflow:get")')
    await evaluate(
      'window.oldOpen=requests.splice(requests.findIndex(item=>item.channel==="workflow:get"),1)[0];updated("a")',
    )
    await take('workflow:summary', summary('a'))
    await take('workflow:get', {
      ...project('a', 'new phase'),
      stages: { brief: { stage: 'brief', status: 'approved', payload: {} } },
    })
    await wait('state.project?.jobs[0].phase==="new phase"')
    await evaluate(`oldOpen.resolve(${JSON.stringify(project('a', 'old phase'))})`)
    await delay(30)
    assert.equal(await evaluate('state.project.jobs[0].phase'), 'new phase')
    assert.equal(await evaluate('state.project.stages.brief.status'), 'approved')
    assert.equal(
      await evaluate('openResult'),
      null,
      'superseded open must not return obsolete unapproved stages to caller',
    )
    await evaluate(
      'window.failedOpenResult="pending";void state.open("a").then(value=>window.failedOpenResult=value)',
    )
    await wait('requests.some(item=>item.channel==="workflow:get")')
    await evaluate(
      'window.failedOpen=requests.splice(requests.findIndex(item=>item.channel==="workflow:get"),1)[0];updated("a")',
    )
    await take('workflow:summary', summary('a'))
    await take('workflow:get', project('a', 'refreshed before old failure'))
    await wait('state.project.jobs[0].phase==="refreshed before old failure"')
    await evaluate('failedOpen.fail("Synthetic obsolete failure")')
    await wait('failedOpenResult!=="pending"')
    assert.equal(await evaluate('failedOpenResult'), null)
    assert.equal(
      await evaluate('state.error'),
      '',
      'superseded failure must not change current selection error',
    )
    await evaluate('updated("a")')
    await take('workflow:summary', summary('a'))
    await take('workflow:get', project('a', 'refreshed after old failure'))
    await wait('state.project.jobs[0].phase==="refreshed after old failure"')
    await evaluate('void state.open("b");updated("a")')
    await take('workflow:get', project('b', 'selected'))
    await take('workflow:summary', summary('a'))
    await delay(30)
    assert.equal(await evaluate('state.project.id'), 'b')
    await evaluate('for(let index=0;index<100;index++)updated("a")')
    await take('workflow:summary', summary('a'))
    await delay(100)
    assert.equal(
      await evaluate('requests.length'),
      0,
      'unselected progress does not reload list or details',
    )
    await evaluate('state.setArchived(true)')
    await wait('requests.some(item=>item.channel==="workflow:list")')
    await evaluate(
      'window.oldList=requests.splice(requests.findIndex(item=>item.channel==="workflow:list"),1)[0];state.setArchived(false)',
    )
    await take('workflow:list', [summary('b')])
    await take('workflow:get', project('b', 'current'))
    await evaluate('oldList.resolve([])')
    await delay(30)
    assert.equal(
      await evaluate('state.projects.length'),
      1,
      'archived response cannot overwrite current view',
    )
    const revisions = Array.from({ length: 40 }, (_, index) => ({
      id: 'revision-' + (40 - index),
      stage: 'brief',
      version: 40 - index,
      createdAt: '2026-10-01',
      status: 'stale',
    }))
    await evaluate(`setHistoryProject(${JSON.stringify(project('b', 'history'))})`)
    await take('workflow:history', { items: revisions.slice(0, 20), nextCursor: 20 })
    await wait('historyState.items.length===20')
    await evaluate('void historyState.more()')
    await take('workflow:history', { items: revisions.slice(20), nextCursor: null })
    await wait('historyState.items.length===40')
    await evaluate(
      `setHistoryProject(${JSON.stringify({ ...project('b', 'history'), revision: 2 })})`,
    )
    await take('workflow:history', {
      items: [{ ...revisions[0], id: 'revision-41', version: 41 }, ...revisions.slice(0, 19)],
      nextCursor: 21,
    })
    await wait('historyState.items.length===41')
    assert.equal(
      await evaluate('historyState.cursor'),
      null,
      'refresh retains exhausted older pages',
    )
    assert.equal(await evaluate('historyState.items.some(item=>item.id==="revision-1")'), true)
    await evaluate(
      `setDraftProject(${JSON.stringify({ ...project('b', 'draft'), stages: { brief: { payload: { text: 'saved', duration: 60 } } } })})`,
    )
    await wait('Boolean(window.draft)')
    await evaluate('draft.update({text:"unsaved synthetic",duration:60})')
    await wait('draft.dirty===true')
    await evaluate(
      `setDraftProject(${JSON.stringify({ ...project('b', 'draft'), revision: 2, stages: { brief: { payload: { text: 'other saved', duration: 60 } } } })})`,
    )
    await wait('draft.conflict===true')
    assert.equal(await evaluate('draft.payload.text'), 'unsaved synthetic')
    assert.equal(await evaluate('draft.expected'), 1)
    await evaluate(
      `setContextInput({project:${JSON.stringify(project('b', 'context'))},id:'old-render'})`,
    )
    await wait('contextState.loading===true')
    assert.equal(await evaluate('contextState.ready'), false)
    await take('workflow:revisionContext', [{ id: 'old-render', stage: 'render', payload: {} }])
    await wait('contextState.ready===true')
    await evaluate(
      `setContextInput({project:${JSON.stringify(project('b', 'context'))},id:'failed-render'})`,
    )
    await wait('requests.some(item=>item.channel==="workflow:revisionContext")')
    await evaluate(
      'requests.splice(requests.findIndex(item=>item.channel==="workflow:revisionContext"),1)[0].fail("Synthetic context failure")',
    )
    await wait('contextState.error==="Synthetic context failure"')
    assert.equal(await evaluate('contextState.ready'), false)
    await evaluate('contextState.retry()')
    await take('workflow:revisionContext', [{ id: 'failed-render', stage: 'render', payload: {} }])
    await wait('contextState.ready===true')
    await evaluate(
      `setContextInput({project:${JSON.stringify(project('b', 'context'))},id:'other-render'})`,
    )
    await wait('contextState.loading===true')
    assert.equal(
      await evaluate(
        'contextState.project.history.some(item=>item.id==="old-render" || item.id==="failed-render")',
      ),
      false,
    )
    await take('workflow:revisionContext', [{ id: 'other-render', stage: 'render', payload: {} }])
    await wait('contextState.ready===true')
    await evaluate(
      `setRestoreInput({project:${JSON.stringify(project('b', 'restore'))},open:true})`,
    )
    await wait('Boolean(window.restoreState)')
    await evaluate(
      'window.restoreResult="pending";void restoreState.load("old").then(value=>window.restoreResult=value)',
    )
    await wait('requests.some(item=>item.channel==="workflow:revision")')
    await evaluate(
      `setRestoreInput({project:${JSON.stringify(project('b', 'restore'))},open:false})`,
    )
    await delay(30)
    await take('workflow:revision', { id: 'old', stage: 'brief', payload: { text: 'obsolete' } })
    await wait('restoreResult!=="pending"')
    assert.equal(
      await evaluate('restoreResult'),
      null,
      'closing history invalidates pending restore',
    )
    await evaluate(
      `setRestoreInput({project:${JSON.stringify(project('b', 'restore'))},open:true})`,
    )
    await delay(30)
    await evaluate(
      'window.restoreResult="pending";void restoreState.load("old").then(value=>window.restoreResult=value)',
    )
    await wait('requests.some(item=>item.channel==="workflow:revision")')
    await evaluate(
      `setRestoreInput({project:${JSON.stringify(project('c', 'restore'))},open:true})`,
    )
    await delay(30)
    await take('workflow:revision', { id: 'old', stage: 'brief', payload: { text: 'obsolete' } })
    await wait('restoreResult!=="pending"')
    assert.equal(
      await evaluate('restoreResult'),
      null,
      'switching project invalidates pending restore',
    )
    console.log(
      'Workflow hook races, targeted events, archive view, and history preservation passed',
    )
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    win.destroy()
    rmSync(directory, { recursive: true, force: true })
    app.exit(process.exitCode ?? 0)
  }
})
