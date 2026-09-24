import { describe, expect, it } from 'vitest'
import {
  buildVoiceSampleExtractionPrompt,
  mergeVoiceSamples,
  parseVoiceSampleCandidates,
  verifyVoiceSampleCandidates,
} from '../../src/lib/ai/adapters/voice-sample-adapter'
import type { Character } from '../../src/lib/types'

function makeCharacter(): Character {
  const now = Date.now()
  return {
    projectId: 1,
    name: '李肃',
    role: 'secondary',
    roleWeight: 'npc',
    moralAxis: 'neutral',
    orderAxis: 'neutral',
    shortDescription: '笑面谋士',
    appearance: '',
    personality: '阴柔多谋',
    background: '',
    motivation: '',
    abilities: '',
    relationships: '[]',
    arc: '',
    speechStyle: '爱说反话，带「好啊」口头禅',
    createdAt: now,
    updatedAt: now,
  }
}

describe('R-VOICE-SAMPLE · 声纹样本提取链路', () => {
  it('提取 prompt：system 含逐字硬约束与 JSON 输出格式，user 含角色信息与正文证据', () => {
    const evidence = '第三章：李肃冷笑道：「好啊，好啊，好得很。」'
    const messages = buildVoiceSampleExtractionPrompt({ character: makeCharacter(), passagesContext: evidence })
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('逐字')
    expect(messages[0].content).toContain('绝不编造')
    expect(messages[0].content).toContain('JSON')
    expect(messages[1].role).toBe('user')
    expect(messages[1].content).toContain('李肃')
    expect(messages[1].content).toContain('爱说反话')
    expect(messages[1].content).toContain('好啊，好啊，好得很')
  })

  it('parse：截取 JSON 数组、丢弃非法项、空白容错', () => {
    const raw = [
      '好的，以下是候选：',
      '[{"quote":" 好啊，好得很。 ","chapterTitle":" 第三章 ","reason":"反话"},{"bad":1},{"quote":"   "},{"quote":"第二条","chapterTitle":"第四章","reason":"r"}]',
      '完毕',
    ].join('\n')
    const parsed = parseVoiceSampleCandidates(raw)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toEqual({ quote: '好啊，好得很。', chapterTitle: '第三章', reason: '反话' })
    expect(parsed[1].quote).toBe('第二条')

    expect(parseVoiceSampleCandidates('不是 JSON 输出')).toEqual([])
    expect(parseVoiceSampleCandidates('[broken')).toEqual([])
    expect(parseVoiceSampleCandidates('{"quote":"对象不是数组"}')).toEqual([])
  })

  it('verify：空白归一化后逐字命中保留，编造/转写引文被过滤', () => {
    const evidence = '第三章：李肃说：「 好，好，好，好的很 。」随后他拂袖而去。'
    const candidates = [
      { quote: '好，好，好，好的很。', chapterTitle: '第三章', reason: '逐字命中' },
      { quote: '好， 好，好， 好的很。 ', chapterTitle: '', reason: '空白差异' },
      { quote: '他愤怒地说好得很', chapterTitle: '', reason: 'AI 转写非原话' },
    ]
    const kept = verifyVoiceSampleCandidates(candidates, evidence)
    expect(kept).toHaveLength(2)
    expect(kept.map(c => c.quote)).toEqual(['好，好，好，好的很。', '好， 好，好， 好的很。 '])
  })

  it('merge：按行合并、带出处格式化、按台词去重（忽略已有【】前缀）', () => {
    const merged = mergeVoiceSamples('【第一章】原句A', [
      { quote: '原句A', chapterTitle: '任意出处', reason: '' },
      { quote: '新句B', chapterTitle: '第二章', reason: '' },
      { quote: '无出处句', chapterTitle: '', reason: '' },
    ])
    expect(merged.split('\n')).toEqual(['【第一章】原句A', '【第二章】新句B', '无出处句'])

    expect(mergeVoiceSamples(undefined, [])).toBe('')
  })
})
