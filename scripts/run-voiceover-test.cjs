const { spawnSync } = require('node:child_process')
const { join } = require('node:path')
const args = process.argv.slice(2)
const result = spawnSync(process.execPath, ['--import', 'tsx', ...(args[0] === '--smoke' ? [join(__dirname, 'smoke-voiceover.ts'), ...args.slice(1)] : ['--test', join(__dirname, 'test-voiceover.ts')])], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit',
})
process.exit(result.status ?? 1)
