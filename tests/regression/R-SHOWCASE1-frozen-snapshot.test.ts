import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

describe('R-SHOWCASE1 社区成品进入冻结 E2E 工作区', () => {
  it('带齐完整阅读和下载素材，仍不复制漫画生产中间产物', () => {
    const source = readFileSync(resolve(process.cwd(), 'scripts/serve-e2e-snapshot.mjs'), 'utf8')
    const manifest = source.match(/const snapshotEntries = (\[[\s\S]*?\n\])/)?.[1]
    expect(manifest).toBeDefined()
    const entries = runInNewContext(manifest!) as string[]
    const included = (asset: string) => entries.some(entry => asset === entry || asset.startsWith(`${entry}/`))
    expect(included('showcase/short-novel')).toBe(true)
    expect(included('showcase/screenplay')).toBe(true)
    for (const slug of ['before-rain-stops', 'borrowed-flame', 'before-the-gun', 'moon-buys-bread']) {
      for (const file of ['source-novel.md', 'art/final/cover.png', 'art/final/pages/page-01.png', `art/final/${slug}.pdf`, `art/final/${slug}.cbz`]) {
        const asset = `showcase/comic/${slug}/${file}`
        expect(included(asset), asset).toBe(true)
        expect(existsSync(resolve(process.cwd(), asset)), asset).toBe(true)
      }
      expect(included(`showcase/comic/${slug}/art/raw`)).toBe(false)
    }
    expect(source).toContain('await mkdir(dirname(snapshotTarget), { recursive: true })')
  })
})
