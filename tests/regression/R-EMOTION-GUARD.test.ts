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
import { EMOTION_EXTERNALIZATION_CONSTRAINT } from '../../src/lib/ai/adapters/prompt-guards'
import {
  setEmotionExternalizationEnabled,
  setImageryEnabled,
  setSensoryImmersionEnabled,
} from '../../src/lib/ai/writing-preferences'

const MARKER = '【情绪外化写法】'

function lastUser(messages: ChatMessage[]): ChatMessage {
  return [...messages].reverse().find(message => message.role === 'user')!
}

/** 五处正文链路：正文生成 2 处 + 改写短链路 3 处。 */
function allBuilders(): ChatMessage[][] {
  const generationOptions: RunOptions = { skipContinuityEnvelope: true }
  return [
    buildChapterContentPrompt('章题', '本章梗概', '世界观', '角色设定', '', undefined, undefined, generationOptions),
    buildContinuePrompt('已有正文。', '本章梗概', '世界观', undefined, generationOptions),
    buildPolishPrompt('原文段落。', '写得更凝练'),
    buildExpandPrompt('原文段落。', '补充细节'),
    buildDeAIPrompt('原文段落。'),
  ]
}

describe('R-EMOTION-GUARD · 情绪外化轻约束', () => {
  beforeEach(() => {
    localStorage.clear()
    setEmotionExternalizationEnabled(true)
    setImageryEnabled(true)
    setSensoryImmersionEnabled(true)
  })

  it('默认开启：五处 builder 末尾 user message 均注入约束（含示例特征）', () => {
    for (const messages of allBuilders()) {
      const user = lastUser(messages)
      expect(user.content).toContain(MARKER)
      expect(user.content).toContain('怒极反笑')
      expect(user.content).toContain(EMOTION_EXTERNALIZATION_CONSTRAINT)
    }
  })

  it('设置关闭后五处均不注入（其余约束组的注入不受影响）', () => {
    setEmotionExternalizationEnabled(false)
    for (const messages of allBuilders()) {
      expect(lastUser(messages).content).not.toContain(MARKER)
      expect(lastUser(messages).content).not.toContain(EMOTION_EXTERNALIZATION_CONSTRAINT)
    }
  })
})
