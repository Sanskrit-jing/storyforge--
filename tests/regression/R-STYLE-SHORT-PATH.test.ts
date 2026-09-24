import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../src/lib/types'
import {
  buildDeAIPrompt,
  buildExpandPrompt,
  buildPolishPrompt,
} from '../../src/lib/ai/adapters/chapter-adapter'
import type { RunOptions } from '../../src/lib/ai/adapters/chapter-adapter'

const STYLE_CONTEXT = '【作者文风偏好】\n短句为主，少用形容词堆叠；对话推动剧情。'

/** STYLE-SHORT-PATH:三个改写短链路 builder 统一走 appendStyleContext。 */
const BUILDERS: Array<[string, (options?: RunOptions) => ChatMessage[]]> = [
  ['polish', options => buildPolishPrompt('原文段落。', '写得更凝练', options)],
  ['expand', options => buildExpandPrompt('原文段落。', '补充细节', options)],
  ['de-ai', options => buildDeAIPrompt('原文段落。', options)],
]

function lastUser(messages: ChatMessage[]): ChatMessage {
  return [...messages].reverse().find(message => message.role === 'user')!
}

describe('R-STYLE-SHORT-PATH · 改写短链路注入作者文风', () => {
  it('styleContext 存在时注入到末尾 user message', () => {
    for (const [name, build] of BUILDERS) {
      const messages = build({ styleContext: STYLE_CONTEXT })
      const user = lastUser(messages)
      expect(user.content, name).toContain(STYLE_CONTEXT)
      // 情绪 guard（默认开启）在 styleContext 之后追加，风格块应位于其前
      const styleIndex = user.content.indexOf(STYLE_CONTEXT)
      const guardIndex = user.content.indexOf('【情绪外化写法】')
      expect(styleIndex, name).toBeGreaterThanOrEqual(0)
      expect(styleIndex < guardIndex || guardIndex < 0, name).toBe(true)
    }
  })

  it('styleContext 为空白或缺省时不注入，不产生多余约束', () => {
    for (const [name, build] of BUILDERS) {
      const blank = build({ styleContext: '   ' })
      expect(lastUser(blank).content, name).not.toContain('作者文风偏好')
      const absent = build()
      expect(lastUser(absent).content, name).not.toContain('作者文风偏好')
      expect(lastUser(absent).content, name).not.toContain(STYLE_CONTEXT)
    }
  })
})
