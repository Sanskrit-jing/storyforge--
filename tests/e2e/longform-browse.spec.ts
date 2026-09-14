import { expect, test, type Page } from '@playwright/test'

async function workCount(page: Page): Promise<number> {
  return page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open('storyforge-core')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('works', 'readonly')
      const count = transaction.objectStore('works').count()
      count.onsuccess = () => resolve(count.result)
      count.onerror = () => reject(count.error)
      transaction.oncomplete = () => database.close()
    }
  }))
}

test('empty longform library allows all pages, inner steps and modes without creating a work', async ({ page }) => {
  await page.goto('./long')
  await expect(page.getByRole('heading', { name: '从你的第一个故事开始' })).toBeVisible()
  const primary = page.getByRole('navigation', { name: '长篇一级导航' })
  for (const label of ['长篇工作台', '版本与导出', '派生世界', '文档导入', '社区与发行', '通用设置']) {
    await primary.getByRole('button', { name: label, exact: true }).click()
    await expect(page.getByRole('heading', { level: 2, name: label, exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: '选择操作的作品' })).toHaveCount(0)
    const url = page.url()
    await page.reload()
    await expect(page).toHaveURL(url)
    await expect(page.getByRole('heading', { level: 2, name: label, exact: true })).toBeVisible()
  }
  await expect(page.getByRole('heading', { name: 'AI 模型配置', exact: true })).toBeVisible()
  await primary.getByRole('button', { name: '长篇工作台', exact: true }).click()
  const steps = page.getByRole('navigation', { name: '长篇工作台二级导航' })
  const labels = await steps.locator(':scope > section > div > button').allTextContents()
  expect(labels.length).toBe(23)
  for (const label of labels) {
    await steps.getByRole('button', { name: label, exact: true }).click()
    await expect(page.getByRole('region', { name: '未选择作品的功能页' })).toBeVisible()
    await expect(page.getByRole('region', { name: '选择操作的作品' })).toHaveCount(0)
  }
  for (const label of ['节点创作', 'Agent']) {
    await page.getByRole('navigation', { name: '工作台创作方式' }).getByRole('button', { name: label, exact: true }).click()
    await page.reload()
    await expect(page.getByRole('region', { name: '未选择作品的功能页' })).toBeVisible()
  }
  expect(await workCount(page)).toBe(0)
  await page.getByRole('button', { name: '开始创作对话', exact: true }).click()
  await expect(page.getByRole('region', { name: '选择操作的作品' })).toBeVisible()
  await page.getByRole('button', { name: '继续浏览', exact: true }).click()
  expect(await workCount(page)).toBe(0)
})

test('work-dependent action selects or creates explicitly and preserves the requested page', async ({ page }) => {
  await page.goto('./long?section=workbench&module=story-design&mode=steps')
  await page.getByRole('button', { name: '编辑故事核心', exact: true }).click()
  await page.getByRole('textbox', { name: '新长篇名称' }).fill('按操作创建的作品')
  await page.getByRole('button', { name: '创建并进入当前页面', exact: true }).click()
  await expect(page).toHaveURL(/workspace\/\d+\?section=workbench&module=story-design&mode=steps$/)
  await expect(page.getByText('点击填写一句话故事…', { exact: true })).toBeVisible()
  expect(await workCount(page)).toBe(1)
  await page.goto('./long?section=versions&module=export')
  await expect(page.getByRole('heading', { level: 2, name: '版本与导出' })).toBeVisible()
  await expect(page).not.toHaveURL(/workspace/)
  await page.getByRole('button', { name: '导出作品', exact: true }).click()
  await expect(page.getByRole('button', { name: '使用这部作品' })).toBeDisabled()
  await page.getByRole('combobox', { name: '选择长篇作品' }).selectOption({ label: '按操作创建的作品' })
  await page.getByRole('button', { name: '使用这部作品' }).click()
  await expect(page).toHaveURL(/workspace\/\d+\?section=versions&module=export&mode=steps$/)
  await expect(page.getByRole('heading', { name: '数据管理', exact: true })).toBeVisible()
  expect(await workCount(page)).toBe(1)
})
