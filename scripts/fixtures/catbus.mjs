import fs from 'node:fs'
import path from 'node:path'

const home = process.env.CATBUS_HOME
const root = path.resolve(
  home,
  path.basename(path.dirname(home)).endsWith('-accounts') ? '../../../..' : '../../..',
)
const mode = fs.existsSync(path.join(root, 'mode'))
  ? fs.readFileSync(path.join(root, 'mode'), 'utf8')
  : ''
const args = process.argv.slice(2)
const [platform, resource, action] = args
const loginFile = path.join(home, 'test-login')
const defaultUid = platform === 'douyin' ? 'MS4wLjABAAAA_test_123' : '123'
const boundUid = fs.existsSync(loginFile) ? fs.readFileSync(loginFile, 'utf8') : defaultUid
const uid = mode === 'wrong-account' ? '999' : boundUid
const itemId = platform === 'douyin' ? '7531234567890123456' : 'BV1xx411c7mD'
const itemUrl = `https://www.${platform}.com/video/${itemId}`
let data
if (platform === 'version') data = { version: '0.2.1', node: '22.22.2' }
else if (resource === 'auth') {
  if (action === 'login') {
    fs.mkdirSync(path.join(home, 'cache', platform), { recursive: true })
    fs.writeFileSync(
      path.join(home, 'cache', platform, 'qrcode.png'),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
        'base64',
      ),
    )
    await new Promise((resolve) => setTimeout(resolve, 1800))
    fs.writeFileSync(
      loginFile,
      fs.existsSync(path.join(root, 'login-user'))
        ? fs.readFileSync(path.join(root, 'login-user'), 'utf8')
        : defaultUid,
    )
  }
  data = {
    logged_in: mode !== 'signed-out' || fs.existsSync(loginFile),
    user: {
      id: uid,
      name: platform === 'douyin' ? '抖音测试用户' : uid === '123' ? '测试 UP' : `测试 UP ${uid}`,
    },
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
            id: itemId,
            title: platform === 'douyin' ? '另一平台' : '审核标题',
            status: mode === 'private' ? 'private' : 'published',
            author: { id: mode === 'wrong-owner' ? '999' : uid },
          },
        ]
else if (action === 'publish') {
  fs.appendFileSync(path.join(root, 'calls'), JSON.stringify(args) + '\n')
  const description = fs.readFileSync(args[args.indexOf('--text') + 1].slice(1), 'utf8')
  fs.writeFileSync(path.join(root, 'description'), description)
  const creator = new URL('../platforms/douyin/web/creator.js', import.meta.url)
  if (platform === 'douyin' && fs.existsSync(creator)) {
    const { videoItem } = await import(creator.href)
    const tags = args.flatMap((arg, index) => (arg === '--tag' ? [args[index + 1]] : []))
    const options = {
      title: args[args.indexOf('--title') + 1],
      desc: [description, ...tags.map((tag) => '#' + tag.replace(/^#/, ''))]
        .filter(Boolean)
        .join(' '),
    }
    fs.writeFileSync(
      path.join(root, 'publish-body'),
      JSON.stringify(videoItem({}, '', options, '').item.common),
    )
  }
  if (mode === 'slow') await new Promise((resolve) => setTimeout(resolve, 900))
  if (mode.startsWith('upstream-')) {
    console.log(
      JSON.stringify({
        ok: false,
        error: {
          code: 'UPSTREAM',
          message:
            mode === 'upstream-secret'
              ? '发布失败：cookie=SECRET https://example.com/?token=SECRET'
              : mode === 'upstream-upload'
                ? 'ApplyUploadInner 失败'
                : '发布失败：作品描述不符合要求',
          detail: { status_code: 10001, cookie: 'SECRET', error: { Code: 'SECRET' } },
        },
      }),
    )
    process.exit(6)
  }
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
    id: itemId,
    url: mode === 'bad-receipt' ? 'https://example.com/video/BV1xx411c7mD' : itemUrl,
    status: 'reviewing',
  }
}
console.log(
  JSON.stringify({
    ok: true,
    platform: platform === 'version' ? null : mode === 'wrong-platform' ? 'bilibili' : platform,
    endpoint: 'web',
    resource,
    action,
    account: platform === 'douyin' ? 'mydashboard-douyin' : 'mydashboard-bili',
    data,
    error: null,
  }),
)
