/**
 * R-WV · 世界观面板字段级互参收口回归。
 *
 * 背景：世界起源/自然环境/人文环境/故事核心 4 个面板历史上各自手拼
 * slice(0,100~300) 摘要做字段级 AI 上下文，绕过了 CONTEXT_SOURCES 预算管理。
 * 收口后统一走注册表 worldview 源 + worldviewExcludeKeys（排除「正在生成的
 * 字段」自身），其余字段全量注入，由 capBySourceBudget / trimToFit 软裁。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { assembleContext } from '../../src/lib/registry/assemble-context'
import { assembleWorldviewPeerContext } from '../../src/lib/registry/worldview-peer-context'
import { formatWorldviewBlock } from '../../src/lib/ai/context-builder'

async function createProject(): Promise<number> {
  const now = Date.now()
  return await db.projects.add({
    name: 'WV Peer Context Test',
    genre: '',
    description: '',
    targetWordCount: 0,
    enableMultiWorld: true,
    createdAt: now,
    updatedAt: now,
  } as any) as number
}

describe('formatWorldviewBlock · 字段级排除', () => {
  const wv = {
    summary: '蒸汽朋克东方大陆',
    worldOrigin: '创世齿轮转动而生',
    powerHierarchy: '械师九阶',
    divineDesign: { hasDivinity: true, divineRank: '三垣', divineNames: '枢机', divineRules: '不可直视' },
    races: '铜肤族',
  } as any

  it('不传 excludeKeys 时全量注入（含 divineDesign）', () => {
    const block = formatWorldviewBlock(wv)
    expect(block).toContain('摘要：蒸汽朋克东方大陆')
    expect(block).toContain('世界来源：创世齿轮转动而生')
    expect(block).toContain('力量体系：械师九阶')
    expect(block).toContain('神明设定：三垣；枢机；不可直视')
    expect(block).toContain('种族民族：铜肤族')
  })

  it('排除单字段：被排除行不出现，其余字段保留', () => {
    const block = formatWorldviewBlock(wv, ['powerHierarchy'])
    expect(block).not.toContain('械师九阶')
    expect(block).toContain('世界来源：创世齿轮转动而生')
    expect(block).toContain('神明设定：三垣')
  })

  it('排除 divineDesign：神明整行消失', () => {
    const block = formatWorldviewBlock(wv, ['divineDesign'])
    expect(block).not.toContain('神明设定')
    expect(block).toContain('摘要：蒸汽朋克东方大陆')
  })

  it('v2 旧字段路径同样支持排除', () => {
    const legacy = { geography: '群山环抱', society: '城邦林立', rules: '灵气潮汐' } as any
    const kept = formatWorldviewBlock(legacy)
    expect(kept).toContain('地理：群山环抱')
    const trimmed = formatWorldviewBlock(legacy, ['society', 'rules'])
    expect(trimmed).toContain('地理：群山环抱')
    expect(trimmed).not.toContain('城邦林立')
    expect(trimmed).not.toContain('灵气潮汐')
  })
})

describe('assembleContext · worldviewExcludeKeys 透传', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    db.close()
  })

  it('worldview 源读取时排除指定字段，其余字段进入装配结果', async () => {
    const projectId = await createProject()
    const now = Date.now()
    await db.worldviews.add({
      projectId, worldGroupId: null,
      worldOrigin: '世界来源独白',
      powerHierarchy: '力量体系独白',
      races: '种族分布独白',
      createdAt: now, updatedAt: now,
    } as any)

    const assembled = await assembleContext({
      projectId,
      worldGroupId: null,
      sourceKeys: ['worldview'],
      worldviewExcludeKeys: ['powerHierarchy'],
    })

    expect(assembled.included).toContain('worldview')
    expect(assembled.text).toContain('世界来源独白')
    expect(assembled.text).toContain('种族分布独白')
    expect(assembled.text).not.toContain('力量体系独白')
  })

  it('不传 worldviewExcludeKeys 时全量注入（既有调用方行为不变）', async () => {
    const projectId = await createProject()
    const now = Date.now()
    await db.worldviews.add({
      projectId, worldGroupId: null,
      worldOrigin: '来源全文',
      powerHierarchy: '层级全文',
      createdAt: now, updatedAt: now,
    } as any)

    const assembled = await assembleContext({
      projectId,
      worldGroupId: null,
      sourceKeys: ['worldview'],
    })

    expect(assembled.text).toContain('来源全文')
    expect(assembled.text).toContain('层级全文')
  })

  it('assembleWorldviewPeerContext：面板互参辅助排除当前字段', async () => {
    const projectId = await createProject()
    const now = Date.now()
    await db.worldviews.add({
      projectId, worldGroupId: null,
      worldOrigin: '起源内容',
      climateByRegion: '四季如春',
      createdAt: now, updatedAt: now,
    } as any)

    const peerCtx = await assembleWorldviewPeerContext(projectId, null, ['worldOrigin'])

    expect(peerCtx).toContain('四季如春')
    expect(peerCtx).not.toContain('起源内容')
  })
})
