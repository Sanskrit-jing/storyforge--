import { beforeEach, describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../src/lib/types'
import {
  buildChapterContentPrompt,
  buildContinuePrompt,
  buildDeAIPrompt,
  buildExpandPrompt,
  buildPolishPrompt,
} from '../../src/lib/ai/adapters/chapter-adapter'
import type { RunOptions } from '../../src/lib/ai/adapters/chapter-adapter'
import {
  IMAGERY_CONSTRAINT,
  SENSORY_IMMERSION_CONSTRAINT,
} from '../../src/lib/ai/adapters/prompt-guards'
import {
  setEmotionExternalizationEnabled,
  setImageryEnabled,
  setSensoryImmersionEnabled,
} from '../../src/lib/ai/writing-preferences'
import {
  formatCustomConstraintsGuard,
  parseCustomConstraints,
} from '../../src/lib/ai/custom-constraints'
import type { CustomWritingConstraint } from '../../src/lib/types/creative-rules'

const MARKERS = {
  emotion: '【情绪外化写法】',
  imagery: '【画面感写法】',
  sensory: '【代入感写法】',
} as const

function lastUser(messages: ChatMessage[]): ChatMessage {
  return [...messages].reverse().find(message => message.role === 'user')!
}

/** 五处正文链路：正文生成 2 处 + 改写短链路 3 处，统一走 appendProseCraftGuardsIfEnabled。 */
function allBuilders(extra?: RunOptions): ChatMessage[][] {
  const generationOptions: RunOptions = { skipContinuityEnvelope: true, ...extra }
  return [
    buildChapterContentPrompt('章题', '本章梗概', '世界观', '角色设定', '', undefined, undefined, generationOptions),
    buildContinuePrompt('已有正文。', '本章梗概', '世界观', undefined, generationOptions),
    buildPolishPrompt('原文段落。', '写得更凝练', extra),
    buildExpandPrompt('原文段落。', '补充细节', extra),
    buildDeAIPrompt('原文段落。', extra),
  ]
}

describe('R-PROSE-CRAFT · 真人感写作约束组', () => {
  beforeEach(() => {
    localStorage.clear()
    setEmotionExternalizationEnabled(true)
    setImageryEnabled(true)
    setSensoryImmersionEnabled(true)
  })

  it('默认全部开启：五处 builder 均注入三条约束，按 情绪→画面→代入 顺序排列在末尾', () => {
    for (const messages of allBuilders()) {
      const content = lastUser(messages).content
      expect(content).toContain(MARKERS.imagery)
      expect(content).toContain(MARKERS.sensory)
      expect(content).toContain(IMAGERY_CONSTRAINT)
      expect(content).toContain(SENSORY_IMMERSION_CONSTRAINT)
      // 三条约束依次追加，最后一条是代入感
      const emotionIndex = content.indexOf(MARKERS.emotion)
      const imageryIndex = content.indexOf(MARKERS.imagery)
      const sensoryIndex = content.indexOf(MARKERS.sensory)
      expect(emotionIndex).toBeGreaterThanOrEqual(0)
      expect(imageryIndex).toBeGreaterThan(emotionIndex)
      expect(sensoryIndex).toBeGreaterThan(imageryIndex)
      expect(content.endsWith(SENSORY_IMMERSION_CONSTRAINT)).toBe(true)
    }
  })

  it('约束文本含素材特征：画面感反例与正例、代入感「写苦不写苦」示例', () => {
    expect(IMAGERY_CONSTRAINT).toContain('荒凉死寂')
    expect(IMAGERY_CONSTRAINT).toContain('镜头取景')
    expect(SENSORY_IMMERSION_CONSTRAINT).toContain('旁观者式总结')
    expect(SENSORY_IMMERSION_CONSTRAINT).toContain('感官')
  })

  it('单独关闭画面感：仅画面感不注入，其余两条不受影响', () => {
    setImageryEnabled(false)
    for (const messages of allBuilders()) {
      const content = lastUser(messages).content
      expect(content).not.toContain(MARKERS.imagery)
      expect(content).not.toContain(IMAGERY_CONSTRAINT)
      expect(content).toContain(MARKERS.emotion)
      expect(content).toContain(MARKERS.sensory)
    }
  })

  it('全部关闭：五处均不含任何一条约束', () => {
    setEmotionExternalizationEnabled(false)
    setImageryEnabled(false)
    setSensoryImmersionEnabled(false)
    for (const messages of allBuilders()) {
      const content = lastUser(messages).content
      expect(content).not.toContain(MARKERS.emotion)
      expect(content).not.toContain(MARKERS.imagery)
      expect(content).not.toContain(MARKERS.sensory)
    }
  })
})

describe('R-CUSTOM-CONSTRAINT · 作者自定义写法约束', () => {
  beforeEach(() => {
    localStorage.clear()
    setEmotionExternalizationEnabled(true)
    setImageryEnabled(true)
    setSensoryImmersionEnabled(true)
  })

  const CC = '【追逐戏写法】追逐时用短句，动词开头，不写心理独白。'

  it('五处链路注入自定义约束，位于内置三条之后（末尾）', () => {
    for (const messages of allBuilders({ customConstraints: CC })) {
      const content = lastUser(messages).content
      expect(content).toContain(CC)
      expect(content.indexOf(CC)).toBeGreaterThan(content.indexOf(MARKERS.sensory))
      expect(content.endsWith(CC)).toBe(true)
    }
  })

  it('未传或空串不注入，内置约束不受影响', () => {
    for (const messages of [...allBuilders(), ...allBuilders({ customConstraints: '' })]) {
      const content = lastUser(messages).content
      expect(content).not.toContain(CC)
      expect(content).toContain(MARKERS.sensory)
    }
  })

  it('lib 层：标题包裹、禁用条目过滤、坏 JSON / 缺字段容错', () => {
    const list: CustomWritingConstraint[] = [
      { id: 'a', title: '追逐戏', content: '短句推进', enabled: true },
      { id: 'b', title: '', content: '无标题条目', enabled: true },
      { id: 'c', title: '已禁用', content: '不应出现', enabled: false },
    ]
    expect(formatCustomConstraintsGuard(list)).toBe('【追逐戏】\n短句推进\n\n无标题条目')
    expect(formatCustomConstraintsGuard(list)).not.toContain('不应出现')
    expect(formatCustomConstraintsGuard(list.filter(item => !item.enabled))).toBe('')
    // 空正文草稿不注入（添加后未填写完成前允许存在）
    expect(formatCustomConstraintsGuard([
      { id: 'd', title: '草稿', content: '', enabled: true },
      { id: 'e', title: '', content: '   ', enabled: true },
    ])).toBe('')

    expect(parseCustomConstraints(null)).toEqual([])
    expect(parseCustomConstraints('not json')).toEqual([])
    expect(parseCustomConstraints('{"a":1}')).toEqual([])
    expect(parseCustomConstraints(JSON.stringify([
      null,
      {},
      { id: 'x' },
      { content: '缺 id' },
      { id: ' ', content: 'id 为空白' },
      { id: 'ok', content: 'ok' },
      // 空正文草稿必须保留：否则「添加」后在保存回读时被丢弃，表现为无法添加
      { id: 'draft', content: '' },
    ]))).toEqual([{ id: 'ok', content: 'ok' }, { id: 'draft', content: '' }])
  })
})
