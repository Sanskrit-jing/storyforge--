import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { retiredHomeDestination, safeSettingsReturn } from '../../src/components/navigation/retired-routes'
import { resolveStoryForgeTheme } from '../../src/lib/theme'

describe('current UI is the only application foundation', () => {
  it('retired bookmarks preserve explicit object, session and handoff parameters', () => {
    expect(retiredHomeDestination(new URLSearchParams())).toBeNull()
    expect(retiredHomeDestination(new URLSearchParams('tab=home&legacy=1'))).toBe('/')
    expect(retiredHomeDestination(new URLSearchParams('tab=worlds&legacy=1&project=42'))).toBe('/world/worlds?project=42')
    expect(retiredHomeDestination(new URLSearchParams('tab=nodes&project=42&work=9'))).toBe('/workspace/42?work=9&mode=nodes&module=visual-workflows')
    for (const [tab, product] of [['ttrpg','ttrpg'],['town','town'],['chat','chat']]) {
      expect(retiredHomeDestination(new URLSearchParams(`tab=${tab}&legacy=1&project=42&work=9&session=11`))).toBe(`/${product}/play?project=42&work=9&session=11`)
    }
    const params=new URLSearchParams({tab:'ttrpg',worldHandoff:JSON.stringify({worldReleaseId:42})})
    const target=retiredHomeDestination(params)!
    expect(target.startsWith('/ttrpg/source?')).toBe(true)
    expect(new URL(target,'https://example.test').searchParams.get('worldHandoff')).toBe(params.get('worldHandoff'))
    expect(retiredHomeDestination(new URLSearchParams('tab=text-games&product=text-open-world&project=3'))).toBe('/openworld/runtime?project=3')
  })
  it('settings return is local and retired saved palettes resolve to the current palette', () => {
    expect(safeSettingsReturn('/ttrpg/play?project=1&session=9')).toBe('/ttrpg/play?project=1&session=9')
    for(const value of ['https://other.test','//other.test','/play/../settings','/play\\other',null])expect(safeSettingsReturn(value)).toBeNull()
    expect(resolveStoryForgeTheme('inkwash')).toBe('inkwash')
    for(const value of ['unknown','warm','jade','slate','forge','scroll','paper','storyforge',null])expect(resolveStoryForgeTheme(value)).toBe('storyforge')
  })
  it('retired UI files and loading escape hatches cannot return', () => {
    for(const file of ['src/pages/ProductHubPage.tsx','src/pages/product-hub.css','src/components/layout/Sidebar.tsx','src/components/guide/WelcomeGuide.tsx','public/world-map-cangyun.svg'])expect(existsSync(file),file).toBe(false)
    expect(readFileSync('src/App.tsx','utf8')).not.toContain('ProductHubPage')
    expect(readFileSync('src/pages/HomePage.tsx','utf8')).not.toContain('ui-preview/index.html')
  })
})
