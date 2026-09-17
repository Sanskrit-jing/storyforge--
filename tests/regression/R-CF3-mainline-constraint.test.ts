import { describe, it, expect } from 'vitest'
import { buildVolumeOutlinePrompt, buildChapterOutlinePrompt } from '../../src/lib/ai/adapters/outline-adapter'

const textOf = (messages: { content: string }[]) => messages.map(m => m.content).join('\n')

describe('R-CF3-mainline-constraint', () => {
  it('故事核心/主线非空 → 卷纲 prompt 出现主线一致性硬约束', () => {
    const msgs = buildVolumeOutlinePrompt(
      '测试书', '玄幻', '世界观…',
      '主线：少年逆袭夺回家族；中心冲突：与四大世家的世仇', // storyCoreContext 非空
      1000000,
    )
    const all = textOf(msgs)
    expect(all).toContain('主线一致性')
    expect(all).toContain('禁止另起新主线')
  })

  it('故事核心为空 → 不强加主线硬约束（避免无主线时空喊）', () => {
    const msgs = buildVolumeOutlinePrompt('测试书', '玄幻', '世界观…', '', 1000000)
    expect(textOf(msgs)).not.toContain('主线一致性')
  })

  it('章纲 prompt 必带主线一致性硬约束（服从本卷 summary 主线方向）', () => {
    const msgs = buildChapterOutlinePrompt('第一卷', '本卷推进主线第一阶段', '世界观…', '')
    const all = textOf(msgs)
    expect(all).toContain('主线一致性')
    expect(all).toContain('不得另起或让支线压过主线')
  })
})
