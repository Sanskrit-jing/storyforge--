/* global console, process */

/**
 * 把 Web 产物同步进鸿蒙壳工程的 rawfile。
 *
 * 产物来自 `npm run harmony:sync` 的前半段 `vite build --mode harmony`：
 * 与 Android 侧同构（base 取 '/'、不注入 PWA），仅 __STORYFORGE_PLATFORM__
 * 标签不同（鸿蒙版 / 安卓版），业务代码同源，不存在「两套实现」。
 *
 * 图标统一从 public/ 取（唯一事实源），避免出现「App 图标和产品图标不是同一张」。
 *
 * 用法：npm run harmony:sync
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(root, 'dist')
const RAWFILE = path.join(root, 'harmony/entry/src/main/resources/rawfile')

/** [来源, 目标] —— 来源固定是 public/ 下的产品图标 */
const ICONS = [
  ['public/icon-512.png', 'harmony/AppScope/resources/base/media/app_icon.png'],
  ['public/icon-512.png', 'harmony/entry/src/main/resources/base/media/app_icon.png'],
]

function fail(message) {
  console.error(`[harmony] ${message}`)
  process.exit(1)
}

function walk(dir) {
  let count = 0
  let bytes = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = walk(full)
      count += nested.count
      bytes += nested.bytes
    } else {
      count += 1
      bytes += fs.statSync(full).size
    }
  }
  return { count, bytes }
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  fail('缺少 dist/index.html，请先运行 `npm run harmony:sync`（会先构建再同步）')
}

fs.rmSync(RAWFILE, { recursive: true, force: true })
fs.mkdirSync(RAWFILE, { recursive: true })
fs.cpSync(DIST, RAWFILE, { recursive: true })
fs.writeFileSync(
  path.join(RAWFILE, '.gitkeep'),
  '# 该目录由 `npm run harmony:sync` 填充（vite build 产物），只保留占位文件。\n',
)

for (const [from, to] of ICONS) {
  const source = path.join(root, from)
  if (!fs.existsSync(source)) fail(`找不到图标 ${from}`)
  const target = path.join(root, to)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(source, target)
}

const { count, bytes } = walk(RAWFILE)
console.log(
  `[harmony] 已同步 Web 产物 → harmony/entry/src/main/resources/rawfile` +
  `（${count} 个文件，${(bytes / 1024 / 1024).toFixed(1)} MB）`,
)
console.log('[harmony] 应用图标来源：public/icon-512.png')
