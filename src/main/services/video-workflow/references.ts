import { lookup } from 'node:dns/promises'
import type { LookupAddress } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'

export function publicIPv4(address: string) {
  if (isIP(address) !== 4) return false
  const parts = address.split('.').map(Number)
  const [first, second, third] = parts
  return (
    first > 0 &&
    first < 224 &&
    first !== 10 &&
    first !== 127 &&
    !(first === 169 && second === 254) &&
    !(first === 172 && second >= 16 && second <= 31) &&
    !(first === 192 && (second === 168 || second === 0 || second === 2)) &&
    !(first === 198 && (second === 18 || second === 19 || second === 51)) &&
    !(first === 203 && second === 0 && third === 113) &&
    !(first === 100 && second >= 64 && second <= 127)
  )
}
export async function snapshotReference(
  value: string,
  signal: AbortSignal,
  redirects = 0,
): Promise<string> {
  const url = new URL(value)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port)) ||
    redirects > 3
  )
    throw new Error('参考链接不支持认证、私有端口或过多跳转，请改用 HTML 文件')
  if (isIP(url.hostname) && !publicIPv4(url.hostname))
    throw new Error('参考链接不能访问本机或私有网络，请导入 HTML 文件')
  const addresses = await new Promise<LookupAddress[]>((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
    }
    const abort = () => {
      finish()
      reject(new Error('参考读取已取消'))
    }
    const timer = setTimeout(() => {
      finish()
      reject(new Error('参考域名解析超时，请导入 HTML 文件'))
    }, 15000)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      abort()
      return
    }
    void lookup(url.hostname, { all: true, family: 4 }).then(resolve, reject).finally(finish)
  })
  if (!addresses.length || addresses.some((item) => !publicIPv4(item.address)))
    throw new Error('参考链接解析到非公开地址，请改用 HTML 文件')
  if (signal.aborted) throw new Error('已取消')
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http
    const request = client.request(
      {
        hostname: addresses[0].address,
        servername: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          Host: url.host,
          Accept: 'text/html,text/plain',
          'User-Agent': 'MyDashboard-Reference/1.0',
        },
        signal,
        timeout: 15000,
      },
      (response) => {
        if (
          [301, 302, 303, 307, 308].includes(response.statusCode ?? 0) &&
          response.headers.location
        ) {
          response.resume()
          void snapshotReference(
            new URL(response.headers.location, url).href,
            signal,
            redirects + 1,
          ).then(resolve, reject)
          return
        }
        if (
          response.statusCode !== 200 ||
          !/^text\/(html|plain)/i.test(response.headers['content-type'] ?? '')
        ) {
          response.resume()
          reject(new Error('参考网页不可读或需要登录，请导入 HTML 文件或粘贴描述'))
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        response.on('data', (chunk) => {
          size += chunk.length
          if (size > 2 * 1024 * 1024) {
            request.destroy(new Error('参考网页超过 2 MB'))
            return
          }
          chunks.push(chunk)
        })
        response.once('error', reject)
        response.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      },
    )
    request.once('timeout', () => request.destroy(new Error('参考网页读取超时，请导入 HTML 文件')))
    request.once('error', reject)
    request.end()
  })
}
