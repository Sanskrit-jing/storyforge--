import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { buildHistoricalContext, formatWorldviewBlock } from '../../src/lib/ai/context-builder'

describe('WORLD-1 · 正式历史上下文', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })
  afterEach(() => db.close())

  it('多世界严格隔离，正式历史存在时不重复注入旧 Worldview 历史', async () => {
    const now = Date.now()
    const projectId = await db.projects.add({
      name: '历史隔离', genre: '', description: '', targetWordCount: 0,
      enableMultiWorld: true, createdAt: now, updatedAt: now,
    } as any) as number
    await db.worldviews.bulkAdd([
      { projectId, worldGroupId: 1, historyLine: '甲旧历史', worldEvents: '甲旧大事', createdAt: now, updatedAt: now },
      { projectId, worldGroupId: 2, historyLine: '乙旧历史', worldEvents: '乙旧大事', createdAt: now, updatedAt: now },
    ] as any)
    await db.histories.bulkAdd([
      { projectId, worldGroupId: 1, overview: '甲正式历史', eraSystem: '甲历', events: '[]', createdAt: now, updatedAt: now },
      { projectId, worldGroupId: 2, overview: '乙正式历史', eraSystem: '乙历', events: '[]', createdAt: now, updatedAt: now },
    ])
    await db.historicalTimelineEvents.bulkAdd([
      { projectId, worldGroupId: 1, era: 'custom', year: 1, date: '甲元年', title: '甲事件', description: '', isHistorical: false, createdAt: now, updatedAt: now },
      { projectId, worldGroupId: 2, era: 'custom', year: 2, date: '乙元年', title: '乙事件', description: '', isHistorical: false, createdAt: now, updatedAt: now },
      { projectId, worldGroupId: null, era: 'custom', year: 0, date: '默认年', title: '默认事件', description: '', isHistorical: false, createdAt: now, updatedAt: now },
    ])

    const context = await buildHistoricalContext(projectId, 1)
    expect(context).toContain('甲正式历史')
    expect(context).toContain('甲历')
    expect(context).toContain('甲事件')
    expect(context).not.toContain('甲旧历史')
    expect(context).not.toContain('乙正式历史')
    expect(context).not.toContain('乙事件')
    expect(context).not.toContain('默认事件')
  })

  it('正式历史为空时回退旧字段且不跨世界', async () => {
    const now = Date.now()
    const projectId = await db.projects.add({
      name: '旧史回退', genre: '', description: '', targetWordCount: 0,
      enableMultiWorld: true, createdAt: now, updatedAt: now,
    } as any) as number
    await db.worldviews.bulkAdd([
      { projectId, worldGroupId: 1, historyLine: '甲旧历史', worldEvents: '甲旧大事', createdAt: now, updatedAt: now },
      { projectId, worldGroupId: 2, historyLine: '乙旧历史', worldEvents: '乙旧大事', createdAt: now, updatedAt: now },
    ] as any)

    const context = await buildHistoricalContext(projectId, 1)
    expect(context).toContain('甲旧历史')
    expect(context).toContain('甲旧大事')
    expect(context).not.toContain('乙旧历史')
  })

  it('世界观块不再重复历史，并优先使用拆分后的政治/经济/文化概述', () => {
    const block = formatWorldviewBlock({
      worldOrigin: '星海创世',
      historyLine: '旧世界历史',
      worldEvents: '旧世界大事',
      politicsOverview: '议政院',
      economyOverview: '星币贸易',
      cultureOverview: '灯塔祭',
      politicsEconomyCulture: '旧合并资料',
    } as any)
    expect(block).toContain('政治制度：议政院')
    expect(block).toContain('经济制度：星币贸易')
    expect(block).toContain('文化制度：灯塔祭')
    expect(block).not.toContain('旧世界历史')
    expect(block).not.toContain('旧世界大事')
    expect(block).not.toContain('旧合并资料')
  })
})
