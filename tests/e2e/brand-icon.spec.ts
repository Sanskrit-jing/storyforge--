import { expect, test } from '@playwright/test'

test('all product headers and browser icons use the supplied StoryForge mark', async ({ page, request }) => {
  for (const route of ['', 'world', 'long', 'short/library', 'script/library', 'comic/library', 'motion/library', 'ttrpg/library', 'chat/library', 'town/library', 'avg/library', 'adventure/library', 'openworld/library', 'community/market']) {
    await page.goto(`./${route}`)
    const mark = page.locator('[data-storyforge-brand]').first()
    await expect(mark).toBeVisible()
    await expect(mark).toHaveAttribute('src', '/storyforge/brand/storyforge-icon.png')
    await expect.poll(() => mark.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 1024)).toBe(true)
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/storyforge/brand/storyforge-icon.png')
  }
  for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]] as const) {
    const response = await request.get(`./${file}`)
    expect(response.ok()).toBe(true)
    const png = await response.body()
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(size)
    expect(png.readUInt32BE(20)).toBe(size)
  }
})
