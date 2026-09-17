import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { adopt } from '../../src/lib/registry/adopt'
import {
  buildCharacterSupplementPrompt,
  parseCharacterSupplement,
} from '../../src/lib/ai/adapters/character-supplement-adapter'
import type { Character } from '../../src/lib/types'

function makeChar(over: Partial<Character> = {}): Character {
  const now = Date.now()
  return {
    projectId: 1, name: '云无心', role: 'npc', roleWeight: 'npc',
    moralAxis: 'neutral', orderAxis: 'neutral',
    shortDescription: '客栈老板', appearance: '满脸风霜', personality: '',
    background: '', motivation: '', abilities: '', relationships: '', arc: '',
    createdAt: now, updatedAt: now, ...over,
  }
}

describe('R-C1-character-supplement', () => {
  beforeEach(async () => { await db.delete(); await db.open() })
  afterEach(() => db.close())

  it('parseCharacterSupplement 只取请求的维度，忽略多余键与空值', () => {
    const raw = `这是说明文字 {"personality":"外冷内热","goals":"  ","background":"江湖出身","arc":"不该出现"}`
    const patch = parseCharacterSupplement(raw, ['personality', 'goals', 'background'])
    expect(patch).toEqual({ personality: '外冷内热', background: '江湖出身' }) // goals 空被丢，arc 未请求不取
  })

  it('parse 容错：非 JSON / 截断输出返回空补丁，不抛异常', () => {
    expect(parseCharacterSupplement('AI 拒绝输出', ['personality'])).toEqual({})
    expect(parseCharacterSupplement('', ['goals'])).toEqual({})
  })

  it('prompt 带上已有设定 + 只请求选中维度 + evidence 进上下文', () => {
    const msgs = buildCharacterSupplementPrompt({
      character: makeChar(),
      dimensions: ['personality', 'background'],
      worldContext: '武侠世界',
      evidenceContext: '第3章：他出手救了主角',
    })
    const all = msgs.map(m => m.content).join('\n')
    expect(all).toContain('满脸风霜')      // 已有外貌作为一致性约束注入
    expect(all).toContain('"personality"') // 请求维度
    expect(all).toContain('第3章：他出手救了主角') // evidence 注入
    expect(all).toContain('真实表现')       // evidence 模式硬约束措辞
  })

  it('adopt(recordId, merge-diffs) 只更新补全字段，保留既有、不动未选维度', async () => {
    const now = Date.now()
    const projectId = await db.projects.add({ name: 'P', genre: 'wuxia', createdAt: now, updatedAt: now } as any) as number
    const id = await db.characters.add(makeChar({ projectId }) as any) as number

    // 模拟 AI 补全 personality / values / goals（A 新增的扩展维度字段）
    const patch = parseCharacterSupplement(
      `{"personality":"外冷内热","values":"义字当先","goals":"重开分号"}`,
      ['personality', 'values', 'goals'],
    )
    const result = await adopt({ projectId, target: 'characters', recordId: id, mode: 'merge-diffs', data: patch })
    expect(result.written[0]?.id).toBe(id)

    const row = await db.characters.get(id)
    // 补全字段已落库（含 A 扩展的 values/goals → 证 FIELD_REGISTRY 已登记）
    expect(row!.personality).toBe('外冷内热')
    expect((row as any).values).toBe('义字当先')
    expect((row as any).goals).toBe('重开分号')
    // 既有字段保留，未选维度仍为空（不被覆盖）
    expect(row!.appearance).toBe('满脸风霜')
    expect(row!.shortDescription).toBe('客栈老板')
    expect(row!.background).toBe('')
  })

  it('adopt(recordId) 拒绝跨项目记录（不属于本项目不写）', async () => {
    const now = Date.now()
    const p1 = await db.projects.add({ name: 'P1', createdAt: now, updatedAt: now } as any) as number
    const p2 = await db.projects.add({ name: 'P2', createdAt: now, updatedAt: now } as any) as number
    const id = await db.characters.add(makeChar({ projectId: p1 }) as any) as number
    const result = await adopt({ projectId: p2, target: 'characters', recordId: id, mode: 'merge-diffs', data: { personality: '篡改' } })
    expect(result.written).toHaveLength(0)
    expect((await db.characters.get(id))!.personality).toBe('') // 未被改
  })
})
