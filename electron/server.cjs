'use strict'

/**
 * 桌面版内嵌服务：把 Vite 构建产物 dist/ 挂到 /storyforge/，并复刻 vite.config.ts
 * 里 server.proxy 的同一组 AI 代理。
 *
 * 为什么用本地 HTTP 服务而不是 file:// 直接加载：
 *   ① 应用是 base '/storyforge/' + BrowserRouter(basename '/storyforge') 的 SPA，
 *      需要绝对路径与 history 回退；
 *   ② IndexedDB / localStorage 按 origin 隔离，只有固定 http://localhost:1111 才能
 *      让桌面版与 npm run dev 共用同一份数据；端口漂移等于用户"作品丢失"；
 *   ③ AI 接口要靠同源代理绕开浏览器 CORS，与开发态行为保持一致。
 */

const http = require('node:http')
const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')

const BASE_PATH = '/storyforge'
const DEFAULT_PORT = 1111

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
}

/**
 * 与 vite.config.ts 的 server.proxy 一一对应。漏掉一项，对应 provider 在桌面版就会
 * 直接撞 CORS 而报"连接失败"。
 */
const PROXY_ROUTES = [
  { prefix: '/deepseek-proxy', target: 'https://api.deepseek.com' },
  { prefix: '/openai-proxy', target: 'https://api.openai.com' },
  { prefix: '/kimi-proxy', target: 'https://api.moonshot.cn' },
  { prefix: '/claude-proxy', target: 'https://api.anthropic.com' },
  { prefix: '/nvidia-proxy', target: 'https://integrate.api.nvidia.com' },
  { prefix: '/doubao-proxy', target: 'https://ark.cn-beijing.volces.com' },
  { prefix: '/agnes-proxy', target: 'https://apihub.agnes-ai.com' },
  { prefix: '/longcat-proxy', target: 'https://api.longcat.chat' },
  { prefix: '/opencode-proxy', target: 'https://opencode.ai', targetPrefix: '/zen/go' },
  { prefix: '/siliconflow-proxy', target: 'https://api.siliconflow.cn' },
  { prefix: '/qwen-proxy', target: 'https://dashscope.aliyuncs.com' },
  { prefix: '/glm-proxy', target: 'https://open.bigmodel.cn' },
]

// Node 会自行决定传输方式；上游的 hop-by-hop 头原样回传会导致分块编码叠加。
const HOP_BY_HOP_HEADERS = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade']

function sendText(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

function findProxyRoute(pathname) {
  return PROXY_ROUTES.find(route =>
    pathname === route.prefix || pathname.startsWith(`${route.prefix}/`),
  )
}

function proxyRequest(req, res, route) {
  const target = new URL(route.target)
  const transport = target.protocol === 'http:' ? http : https
  const suffix = req.url.slice(route.prefix.length)

  const headers = { ...req.headers }
  // 复刻 vite 的 changeOrigin: true —— 只改 Host，其余（含 Origin / Authorization）原样透传。
  headers.host = target.host
  delete headers['accept-encoding']

  const upstream = transport.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      method: req.method,
      path: `${route.targetPrefix ?? ''}${suffix || '/'}`,
      headers,
    },
    upstreamRes => {
      const responseHeaders = { ...upstreamRes.headers }
      for (const name of HOP_BY_HOP_HEADERS) delete responseHeaders[name]
      // 上游可能返回 gzip，但我们原样透传字节，保留 content-encoding 才是正确的。
      if (String(upstreamRes.headers['content-type'] ?? '').includes('text/event-stream')) {
        responseHeaders['cache-control'] = 'no-cache, no-transform'
        responseHeaders['x-accel-buffering'] = 'no'
      }

      res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders)
      // SSE 靠 flushHeaders 立刻把响应头推给渲染进程，否则流式输出会等到首块数据才可见。
      res.flushHeaders()
      upstreamRes.pipe(res)
    },
  )

  upstream.on('error', error => {
    if (res.headersSent) {
      res.destroy()
      return
    }
    sendText(res, 502, `代理请求失败：${route.target}${suffix}\n${error.message}`)
  })

  req.on('aborted', () => upstream.destroy())
  req.pipe(upstream)
}

function resolveStaticFile(webRoot, urlPath) {
  const relative = decodeURIComponent(urlPath.slice(BASE_PATH.length)).replace(/^\/+/, '')
  const resolved = path.resolve(webRoot, relative)
  // 防目录穿越：解析结果必须仍在 webRoot 之内。
  if (resolved !== webRoot && !resolved.startsWith(webRoot + path.sep)) return null
  if (!fs.existsSync(resolved)) return null

  const stat = fs.statSync(resolved)
  if (stat.isDirectory()) {
    const indexFile = path.join(resolved, 'index.html')
    return fs.existsSync(indexFile) ? { file: indexFile, stat: fs.statSync(indexFile) } : null
  }
  return { file: resolved, stat }
}

function serveFile(req, res, file, stat) {
  const ext = path.extname(file).toLowerCase()
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    // 本地磁盘读取，禁用缓存可避免升级后仍跑旧资源（历史上正是缓存导致的重定向/白屏问题）。
    'Cache-Control': 'no-store',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  const stream = fs.createReadStream(file)
  stream.on('error', () => res.destroy())
  stream.pipe(res)
}

function handleStatic(req, res, webRoot) {
  const urlPath = req.url.split('?')[0]
  const indexPath = path.join(webRoot, 'index.html')

  if (!urlPath.startsWith(BASE_PATH)) {
    // 只做一次根路径跳转，且目标永远带 /storyforge/ 前缀，避免历史上出现过的重定向循环。
    res.writeHead(302, { Location: `${BASE_PATH}/` })
    res.end()
    return
  }

  if (urlPath === BASE_PATH) {
    res.writeHead(302, { Location: `${BASE_PATH}/` })
    res.end()
    return
  }

  const found = urlPath === `${BASE_PATH}/` ? null : resolveStaticFile(webRoot, urlPath)

  if (!found) {
    // 带扩展名的资源缺失应当 404，否则 JS/CSS 会拿到 index.html 并报 MIME 类型错误。
    const looksLikeAsset = path.extname(urlPath) !== ''
    if (looksLikeAsset || !fs.existsSync(indexPath)) {
      sendText(res, 404, 'Not Found')
      return
    }
    // SPA 回退：BrowserRouter 的深层路由必须回落到 index.html。
    serveFile(req, res, indexPath, fs.statSync(indexPath))
    return
  }

  serveFile(req, res, found.file, found.stat)
}

/**
 * @param {{ webRoot: string, port?: number }} options
 * @returns {Promise<import('node:http').Server>}
 */
function createAppServer({ webRoot, port = DEFAULT_PORT }) {
  const server = http.createServer((req, res) => {
    try {
      const pathname = req.url.split('?')[0]
      const route = findProxyRoute(pathname)
      if (route) {
        proxyRequest(req, res, route)
        return
      }
      handleStatic(req, res, webRoot)
    } catch (error) {
      sendText(res, 500, `本地服务内部错误：${error.message}`)
    }
  })

  // SSE 长连接不应被默认超时切断。
  server.requestTimeout = 0
  server.headersTimeout = 0

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve(server)
    })
  })
}

module.exports = { createAppServer, BASE_PATH, DEFAULT_PORT }
