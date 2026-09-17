/**
 * R-chapter-count-estimate · 章节数智能默认（社区反馈：长卷被压成 ~20 章）
 *
 * 设计要点（作者拍板）：
 *  - 每章字数由用户自定义（默认 3000，可改）；
 *  - 章节数 = 卷字数 ÷ 每章字数，作为「用户没手动设时」的智能默认；
 *  - 不限制用户：上限放开（只兜下限 1），用户可随意滑 / 手填覆盖。
 */
import { describe, it, expect } from 'vitest'
import { estimateChaptersPerVolume, DEFAULT_WORDS_PER_CHAPTER } from '../../src/lib/outline/selectors'

describe('R-chapter-count-estimate · 章节数智能默认', () => {
  it('默认每章 3000 字：200 万 / 5 卷 → 133（不再是 20）', () => {
    expect(DEFAULT_WORDS_PER_CHAPTER).toBe(3000)
    expect(estimateChaptersPerVolume(2_000_000, 5)).toBe(Math.round(400_000 / 3000)) // 133
  })

  it('每章字数可自定义：同样 200 万 / 5 卷，每章 2000 → 200、每章 5000 → 80', () => {
    expect(estimateChaptersPerVolume(2_000_000, 5, 2000)).toBe(200)
    expect(estimateChaptersPerVolume(2_000_000, 5, 5000)).toBe(80)
  })

  it('上限放开：1000 万 / 2 卷 → 1667（不再 clamp 到 200）', () => {
    expect(estimateChaptersPerVolume(10_000_000, 2)).toBe(Math.round(5_000_000 / 3000)) // 1667
  })

  it('下限兜底 1，不出 0/负；每章字数填 0 时回落默认 3000', () => {
    expect(estimateChaptersPerVolume(100, 1)).toBe(1)        // 100/3000≈0 → 兜 1
    expect(estimateChaptersPerVolume(0, 0)).toBeGreaterThanOrEqual(1)
    expect(estimateChaptersPerVolume(2_000_000, 5, 0)).toBe(133) // 每章 0 → 回落 3000
  })
})
