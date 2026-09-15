import { expect, type Locator, type Page } from '@playwright/test'

export function currentWorldReleasePanel(page: Page): Locator {
  return page.getByRole('region', { name: '世界修订、发布与产品交接' })
}

/**
 * Freeze and publish the current semantic world through the only supported UI
 * boundary. Product builds, media and sessions deliberately remain outside.
 */
export async function publishCurrentWorldRelease(
  page: Page,
  label = 'E2E 纯语义世界修订',
): Promise<Locator> {
  await openWorldSection(page, 'versions')
  const panel = currentWorldReleasePanel(page)
  await expect(panel).toBeVisible({ timeout: 15_000 })
  await panel.getByLabel('修订名称').fill(label)
  await panel.getByRole('button', { name: '冻结修订', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('已冻结新的纯语义世界修订')
  await panel.getByRole('button', { name: '发布版本', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(/发布修订 \d+？/)
  await dialog.getByRole('button', { name: '发布世界版本', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('不可变 WorldRelease 已发布')
  return panel
}

/** Follow the product's visible navigation, preserving the selected world. */
export async function openWorldSection(page:Page, section:string):Promise<void> {
  await expect(page.getByTestId('world-engine-page')).toBeVisible({timeout:15000})
  const labels:Record<string,string>={versions:'版本与封存',sharing:'分享与导入',story:'故事与叙事'}
  const url=new URL(page.url())
  if(!url.searchParams.has('project')) {
    await page.locator('.lf-library-grid article').first().getByRole('button',{name:'编辑世界',exact:true}).click()
  }
  if(!await page.getByRole('navigation',{name:'世界页面导航'}).isVisible())await page.getByRole('button',{name:'世界目录',exact:true}).click()
  await page.getByRole('navigation',{name:'世界页面导航'}).getByRole('button',{name:section==='story'?'世界设定':labels[section],exact:true}).click()
  if(section==='story') {
    await expect(page).toHaveURL(/\/world\/worldbuilding(?:\?|$)/)
    const contents=page.getByRole('navigation',{name:'世界内容导航'})
    await expect(contents).toBeAttached()
    if(!await contents.isVisible())await page.getByRole('button',{name:'设定目录',exact:true}).click()
    await contents.getByRole('button',{name:labels[section],exact:true}).click()
  }
}
