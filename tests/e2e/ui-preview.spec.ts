import { expect, test } from '@playwright/test'
import { allPages } from '../../ui-preview/src/catalog'

test('首页打开独立 UI 预览，提示范围、浏览全部页面并返回正式版', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('storyforge_guide_completed', 'e2e'))
  await page.goto('./?tab=home')
  const entry = page.getByTestId('ui-preview-entry')
  await expect(entry).toContainText('优化调整中')
  await expect(entry).toContainText('尚未接入真实功能')
  await expect(entry).toContainText('待功能梳理完成后，新版 UI 将正式上线')
  const before = await page.evaluate(() => JSON.stringify(localStorage))
  await entry.getByRole('link', { name: '浏览新版 UI 预览' }).click()
  await expect(page).toHaveURL(/ui-preview\/index.html#home\/today$/)
  await expect(page.getByRole('note')).toContainText('正在梳理；梳理完成后上线')
  await page.getByRole('button', { name: /全部页面/ }).click()
  await expect(page.locator('.atlas section button')).toHaveCount(allPages.length)
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.goto('./ui-preview/index.html#ttrpg/confirm')
  await expect(page.locator('.breadcrumb')).toContainText('尚未选择世界')
  await page.getByRole('button', { name: '开始制作', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('需要一个世界引擎')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(before)
  await page.getByRole('link', { name: '返回正式版' }).click()
  await expect(page.getByRole('heading', { name: /天地为炉/ })).toBeVisible()
})

test('预览所有页面可直接加载与刷新，示例操作不会访问浏览器数据库或业务 API', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  const businessRequests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) businessRequests.push(request.url())
  })
  await page.addInitScript(() => {
    indexedDB.open = () => { throw new Error('UI preview must not open IndexedDB') }
    Storage.prototype.setItem = () => { throw new Error('UI preview must not persist data') }
  })
  for (const route of allPages) {
    await page.goto(`./ui-preview/index.html#${route.product}/${route.id}`)
    await expect(page.locator('.breadcrumb')).toContainText(route.label)
    await expect(page.getByRole('note')).toBeVisible()
    await page.evaluate(async () => Promise.all([...document.images].map(image => image.decode())))
  }
  await page.getByRole('button', { name: '弹窗与状态', exact: true }).click()
  await page.locator('.modal [data-modal="save"]').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: /^确认/ }).click()
  await page.reload()
  await expect(page.getByRole('note')).toBeVisible()
  expect(errors).toEqual([])
  expect(businessRequests).toEqual([])
})
