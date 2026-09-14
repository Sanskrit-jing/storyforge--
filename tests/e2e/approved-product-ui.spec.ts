import { expect, test } from '@playwright/test'
import { products } from '../../ui-preview/src/catalog'

test('approved home, every product and live longform share complete navigation', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('./')
  await page.goto(page.url().replace(/\/$/, ''))
  await expect(page).toHaveURL(/\/storyforge\/$/)
  await expect(page.getByRole('heading', { name: /天地为炉/ })).toBeVisible()
  await expect(page.getByText('你的创作与游玩空间', { exact: true })).toHaveCount(0)
  const catalog = products.filter(product => product.id !== 'community')
  for (const product of catalog) {
    const nav = page.getByRole('navigation', { name: '产品导航', exact: true })
    await expect(nav.locator('button, a')).toHaveText(catalog.map(item => item.short))
    await nav.getByText(product.short, { exact: true }).click()
    if (product.id === 'long') await expect(page.getByRole('navigation', { name: '长篇一级导航' })).toBeVisible()
    else await expect(page.getByTestId('approved-product-ui')).toBeVisible()
    const url = page.url()
    await page.reload()
    await expect(page).toHaveURL(url)
    await expect(page.getByRole('navigation', { name: '产品导航' })).toBeVisible()
  }
  await page.getByRole('navigation', { name: '产品导航' }).getByText('长篇', { exact: true }).click()
  await page.getByRole('navigation', { name: '产品导航' }).getByText('首页', { exact: true }).click()
  await expect(page.getByRole('heading', { name: /天地为炉/ })).toBeVisible()
  await page.screenshot({ path: '/tmp/storyforge-restored-home.png' })
  expect(errors).toEqual([])
})

test('shortform preview retains every page and cannot save example text as a real work', async ({ page }) => {
  await page.goto('./short')
  const short = products.find(product => product.id === 'short')!
  for (const item of short.pages) {
    await page.locator('.side-scroll').getByRole('button', { name: item.label, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/short/${item.id}$`))
    await expect(page.getByRole('note').first()).toContainText('作品与数据均为示例')
    await page.reload()
    await expect(page.locator('.breadcrumb')).toContainText(item.label)
  }
  await page.goto('./short/intent')
  await page.getByRole('textbox', { name: '作品名', exact: true }).fill('预览不是手稿')
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  const count = await page.evaluate(async () => {
    return new Promise<number>((resolve, reject) => {
      const request = indexedDB.open('storyforge-core')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('works', 'readonly')
        const query = tx.objectStore('works').count()
        query.onsuccess = () => resolve(query.result)
        tx.oncomplete = () => db.close()
      }
    })
  })
  expect(count).toBe(0)
  await page.goto('./short/intent')
  await expect(page.getByRole('textbox', { name: '作品名', exact: true })).toBeVisible()
  await page.screenshot({ path: '/tmp/storyforge-restored-short.png' })
})

test('mobile navigation reaches shortform and home without horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./long')
  await page.getByRole('navigation', { name: '产品导航' }).getByText('短篇', { exact: true }).click()
  await expect(page).toHaveURL(/short$/)
  await page.getByRole('button', { name: '页面目录', exact: true }).click()
  await page.locator('.side-scroll').getByRole('button', { name: '创作意图', exact: true }).click()
  await expect(page).toHaveURL(/short\/intent$/)
  await expect(page.getByRole('textbox', { name: '作品名', exact: true })).toBeVisible()
  await page.getByRole('navigation', { name: '产品导航' }).getByText('首页', { exact: true }).click()
  await expect(page.getByRole('heading', { name: /天地为炉/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: '/tmp/storyforge-restored-mobile.png' })
})
