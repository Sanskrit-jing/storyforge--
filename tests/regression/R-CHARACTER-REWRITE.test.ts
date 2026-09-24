import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { adopt } from '../../src/lib/registry/adopt'
import {
  buildCharacterRewritePrompt,
  parseCharacterRewrite,
} from '../../src/lib/ai/adapters/character-rewrite-adapter'
import type { Character } from '../../src/lib/types'

function makeChar(over: Partial<Character> = {}): Character {
  const now = Date.now()
  return {
    projectId: 1, name: '云无心', role: 'npc', roleWeight: 'npc',
    moralAxis: 'neutral', orderAxis: 'neutral',
    shortDescription: '客栈老板', appearance: '满脸风霜', personality: '外冷内热',
    abilities: '过目不忘', background: '', motivation: '',
    relationships: '', arc: '',
    createdAt: now, updatedAt: now, ...over,
  }
}

describe('R-CHARACTER-REWRITE', () => {
  beforeEach(async () => { await db.delete(); await db.open() })
  afterEach(() => db.close())

  it('prompt 注入当前旧内容 + 其它设定 + 作者要求，且不把重写维度混进「其它已有设定」', () => {
    const msgs = buildCharacterRewritePrompt({
      character: makeChar(),
      dimensionKey: 'abilities',
      worldContext: '武侠世界，力量体系为内力九段',
      userHint: '金手指不要太逆天，前期只能被动触发',
    })
    const all = msgs.map(m => m.content).join('\n')
    expect(all).toContain('能力/金手指')            // 目标维度 label
    expect(all).toContain('过目不忘')               // 当前旧内容（作者不满意的版本）
    expect(all).toContain('满脸风霜')               // 其它设定作为一致性约束
    expect(all).toContain('外冷内热')
    expect(all).toContain('武侠世界，力量体系为内力九段')
    expect(all).toContain('金手指不要太逆天，前期只能被动触发') // 作者要求
    // 「其它已有设定」里不得出现重写维度自身的旧值条目（- 能力/金手指：过目不忘）
    expect(all).not.toContain('- 能力/金手指：过目不忘')
  })

  it('userHint 留空时 prompt 明确指示换思路重写', () => {
    const msgs = buildCharacterRewritePrompt({
      character: makeChar(),
      dimensionKey: 'abilities',
      worldContext: '',
      userHint: '   ',
    })
    const all = msgs.map(m => m.content).join('\n')
    expect(all).toContain('明显不同的思路')
  })

  it('parseCharacterRewrite：纯文本透传 + 剥 markdown 代码块包裹 + 空输出返回空串', () => {
    expect(parseCharacterRewrite('  能感知半里内的杀意  ')).toBe('能感知半里内的杀意')
    expect(parseCharacterRewrite('```text\n过目不忘，但每次使用流鼻血\n```')).toBe('过目不忘，但每次使用流鼻血')
    expect(parseCharacterRewrite('```\n无标注语言块\n```')).toBe('无标注语言块')
    expect(parseCharacterRewrite('   ')).toBe('')
    expect(parseCharacterRewrite('')).toBe('')
  })

  it('adopt(recordId, merge-diffs) 定点替换目标维度，其它字段不被动', async () => {
    const now = Date.now()
    const projectId = await db.projects.add({ name: 'P', genre: 'wuxia', createdAt: now, updatedAt: now } as any) as number
    const id = await db.characters.add(makeChar({ projectId }) as any) as number

    const next = '左手能看见三秒后的残影，每天只能用一次'
    const result = await adopt({ projectId, target: 'characters', recordId: id, mode: 'merge-diffs', data: { abilities: next } })
    expect(result.written[0]?.id).toBe(id)

    const row = await db.characters.get(id)
    expect(row!.abilities).toBe(next)            // 目标维度被替换
    expect(row!.appearance).toBe('满脸风霜')      // 其它字段不动
    expect(row!.personality).toBe('外冷内热')
    expect(row!.shortDescription).toBe('客栈老板')
  })

  it('adopt(recordId) 拒绝跨项目记录（不属于本项目不写）', async () => {
    const now = Date.now()
    const p1 = await db.projects.add({ name: 'P1', createdAt: now, updatedAt: now } as any) as number
    const p2 = await db.projects.add({ name: 'P2', createdAt: now, updatedAt: now } as any) as number
    const id = await db.characters.add(makeChar({ projectId: p1 }) as any) as number
    const result = await adopt({ projectId: p2, target: 'characters', recordId: id, mode: 'merge-diffs', data: { abilities: '篡改' } })
    expect(result.written).toHaveLength(0)
    expect((await db.characters.get(id))!.abilities).toBe('过目不忘') // 未被改
  })
})
