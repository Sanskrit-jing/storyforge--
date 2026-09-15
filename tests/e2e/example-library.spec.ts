import { expect, test, type Page } from '@playwright/test'

async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const imp = new Function('p', 'return import(p)')
    const { db } = await imp('/storyforge/src/lib/db/schema.ts')
    return { works: await db.works.toArray(), chapters: await db.chapters.toArray(), releases: await db.productReleases.toArray() }
  })
}

test('empty homepage restores examples; reading and downloading do not create author works', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('link', { name: '浏览全部示例' }).click()
  await page.getByRole('button', { name: '阅读完整样例《盐从记忆里长出来》' }).click()
  await expect(page.getByRole('dialog')).toContainText('盐从记忆里长出来')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 Markdown' }).click()
  expect((await download).suggestedFilename()).toContain('盐从记忆里长出来')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '阅读完整样例《盐从记忆里长出来》' })).toBeFocused()
  expect((await snapshot(page)).works).toHaveLength(0)
  await page.reload()
  await expect(page.getByTestId('short-novel-showcase')).toBeVisible()
})

test('script reader has actual Fountain and no legacy UI screenshot', async ({ page }) => {
  await page.goto('./script/library')
  await page.getByRole('button', { name: '查看专业剧本《婚礼第零桌》' }).click()
  await expect(page.getByRole('dialog')).toContainText('Title: 婚礼第零桌')
  await expect(page.getByRole('dialog').locator('img')).toHaveCount(0)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 Fountain' }).click()
  expect((await download).suggestedFilename()).toBe('婚礼第零桌.fountain')
})

test('comic exposes all pages and valid archives, also on a phone', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./comic/library')
  await page.getByRole('button', { name: '查看完整漫画《雨停之前》' }).click()
  await expect(page.locator('.comic-showcase-reader figure')).toHaveCount(6)
  for (const extension of ['PDF', 'CBZ']) {
    const url = await page.getByRole('link', { name: `下载 ${extension}` }).getAttribute('href')
    const response = await request.get(url!)
    expect(response.ok()).toBe(true)
    expect((await response.body()).subarray(0, 4).toString()).toContain(extension === 'PDF' ? '%PDF' : 'PK')
  }
  await expect.poll(() => page.locator('.comic-showcase-reader figure img').first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(500)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: '/tmp/example-reader-mobile.png' })
})

test('source copy persists as separate editable work and leaves the existing work intact', async ({ page }) => {
  await page.goto('./long')
  await page.evaluate(async () => {
    const imp = new Function('p', 'return import(p)')
    const { createWorkspace } = await imp('/storyforge/src/lib/workspace/create-workspace.ts')
    await createWorkspace({ name: '作者原作', description: '禁止覆盖', genres: [], targetWordCount: 300000, status: 'drafting' }, { kind: 'novel', novelProfile: 'long', importedNovelText: '作者自己的正文，必须原样保留。' })
  })
  const before = await snapshot(page)
  await page.getByRole('button', { name: '创建体验副本' }).first().click()
  await expect(page).toHaveURL(/workspace\/\d+\?module=chapters-list/)
  await page.reload()
  const after = await snapshot(page)
  expect(after.works).toHaveLength(before.works.length + 1)
  expect(after.works.find((work: { title: string }) => work.title === '作者原作')).toEqual(before.works[0])
  expect(after.chapters.filter((chapter: { workId: number }) => chapter.workId === before.works[0].id)).toEqual(before.chapters)
  expect(after.chapters.some((chapter: { content: string }) => chapter.content.length > 1000)).toBe(true)
})

test('town example installs without a preexisting work; a corrupted bundle creates nothing', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('./home/examples?type=town')
  await expect(page.getByTestId('community-prototype-gallery')).toContainText('回潮镇')
  await page.route('**/prototypes/tidewake-town/release.storyforge-product.json', route => route.fulfill({ contentType: 'application/json', body: '{"invalid":true}' }))
  await page.getByRole('button', { name: '导入原型并准备游玩' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect((await snapshot(page)).works).toHaveLength(0)
  await page.unroute('**/prototypes/tidewake-town/release.storyforge-product.json')
  await page.getByRole('button', { name: '导入原型并准备游玩' }).click()
  await expect(page).toHaveURL(/town\/play\?project=\d+&work=\d+/, { timeout: 90000 })
  const after = await snapshot(page)
  expect(after.works).toHaveLength(1)
  expect(after.releases).toHaveLength(1)
  await page.reload()
  expect((await snapshot(page)).releases).toEqual(after.releases)
})

test('built-in AVG and TTRPG have real play entries', async ({ page }) => {
  await page.goto('./avg/library')
  await page.getByRole('link', { name: '开始体验雾港' }).click()
  await expect(page).toHaveURL(/play\/mist-harbor/)
  await expect(page.locator('body')).toContainText('失潮钟声')
  await page.goto('./home/examples?type=ttrpg')
  await page.getByRole('button', { name: '开始一场新冒险' }).click()
  await expect(page).toHaveURL(/ttrpg\/play\?project=\d+&work=\d+&session=\d+/)
  await expect(page.getByTestId('ttrpg-play-table')).toBeVisible()
  await expect(page.getByRole('button', { name: /本地多人轮流玩/ })).toBeVisible()
  const installed = await snapshot(page)
  expect(installed.releases).toHaveLength(1)
  expect(installed.works[0].kind).toBe('ttrpg')
})

test('short example creates an editable copy that survives backup and refresh', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./short/library')
  await page.getByRole('button', { name: '阅读完整样例《潮汐电台》' }).click()
  await expect(page.getByRole('button', { name: '创建短篇体验副本' })).toHaveCSS('font-size', '12px')
  await page.getByRole('button', { name: '创建短篇体验副本' }).click()
  await expect(page).toHaveURL(/short\/editor\?project=\d+/)
  await page.reload()
  const result = await page.evaluate(async () => {
    const imp = new Function('p', 'return import(p)')
    const { db } = await imp('/storyforge/src/lib/db/schema.ts')
    const { exportProjectJSON, importProjectJSON } = await imp('/storyforge/src/lib/export/json-export.ts')
    const work = await db.works.toCollection().first()
    const before = await db.chapters.where('projectId').equals(work.projectId).toArray()
    const backup = await exportProjectJSON(work.projectId)
    const imported = await importProjectJSON(backup)
    const restored = await db.chapters.where('projectId').equals(imported).toArray()
    return { title: work.title, before: before.map((c: { content: string }) => c.content), restored: restored.map((c: { content: string }) => c.content) }
  })
  expect(result.title).toBe('潮汐电台（体验副本）')
  expect(result.before.join('')).toContain('潮汐电台')
  expect(result.restored).toEqual(result.before)
})
