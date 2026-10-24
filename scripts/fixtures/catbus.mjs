import fs from 'node:fs'
import path from 'node:path'

const home = process.env.CATBUS_HOME
const root = path.resolve(home, '../../..')
const mode = fs.existsSync(path.join(root, 'mode'))
  ? fs.readFileSync(path.join(root, 'mode'), 'utf8')
  : ''
const args = process.argv.slice(2)
const [platform, resource, action] = args
let data
if (platform === 'version') data = { version: '0.2.1', node: '22.22.2' }
else if (resource === 'auth') {
  if (action === 'login') {
    fs.mkdirSync(path.join(home, 'cache/bilibili'), { recursive: true })
    fs.writeFileSync(
      path.join(home, 'cache/bilibili/qrcode.png'),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
        'base64',
      ),
    )
    await new Promise((resolve) => setTimeout(resolve, 1800))
    fs.writeFileSync(path.join(home, 'test-login'), 'connected')
  }
  data = {
    logged_in: mode !== 'signed-out' || fs.existsSync(path.join(home, 'test-login')),
    user: { id: mode === 'wrong-account' ? '999' : '123', name: '测试 UP' },
  }
} else if (action === 'categories')
  data = [
    { id: '1', name: '父分区', parent_id: null },
    { id: '17', name: '测试分区', parent_id: '1' },
  ]
else if (action === 'list')
  data =
    mode === 'missing'
      ? []
      : [
          {
            id: 'BV1xx411c7mD',
            title: '审核标题',
            status: 'published',
            author: { id: mode === 'wrong-owner' ? '999' : '123' },
          },
        ]
else if (action === 'publish') {
  fs.appendFileSync(path.join(root, 'calls'), JSON.stringify(args) + '\n')
  const description = fs.readFileSync(args[args.indexOf('--text') + 1].slice(1), 'utf8')
  fs.writeFileSync(path.join(root, 'description'), description)
  if (mode === 'slow') await new Promise((resolve) => setTimeout(resolve, 900))
  if (['network', 'risk'].includes(mode)) {
    console.log(
      JSON.stringify({
        ok: false,
        error: { code: mode === 'risk' ? 'RISK_CONTROL' : 'NETWORK', message: 'cookie=SECRET' },
      }),
    )
    process.exit(6)
  }
  data = {
    id: 'BV1xx411c7mD',
    url:
      mode === 'bad-receipt'
        ? 'https://example.com/video/BV1xx411c7mD'
        : 'https://www.bilibili.com/video/BV1xx411c7mD',
    status: 'reviewing',
  }
}
console.log(
  JSON.stringify({
    ok: true,
    platform: platform === 'version' ? null : platform,
    endpoint: 'web',
    resource,
    action,
    account: 'mydashboard-bili',
    data,
    error: null,
  }),
)
