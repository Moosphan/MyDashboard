const { spawnSync } = require('node:child_process')
const { join } = require('node:path')
const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', join(__dirname, 'test-bilibili-publishing.ts')],
  {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
  },
)
process.exit(result.status ?? 1)
