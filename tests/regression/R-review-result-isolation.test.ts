/**
 * R-review-result-isolation · 审校报告按章隔离 + 持久化（bug G5 / G7 / B1）
 *
 * 验证点：
 *  - 报告写进 store 后，再读还在（收起面板=组件卸载也不丢，store 活在内存）；
 *  - 不同 chapterId 互不串台（切章读各自的报告）；
 *  - 再次检测覆盖旧报告；activeTab 也按章独立。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useReviewResultStore, selectChapterReview } from '../../src/stores/review-result'
import type { ReviewResult } from '../../src/lib/ai/adapters/review-adapter'

const mkReview = (score: number): ReviewResult => ({
  overallScore: score, issues: [], suggestions: [],
})

describe('R-review-result-isolation · 审校报告按章隔离 + 持久化', () => {
  beforeEach(() => { useReviewResultStore.setState({ byChapter: {} }) })

  it('写入后可读回（模拟收起再展开仍在）', () => {
    useReviewResultStore.getState().setReview(1, mkReview(88))
    const got = selectChapterReview(1)(useReviewResultStore.getState())
    expect(got.review?.overallScore).toBe(88)
  })

  it('不同章节互不串台', () => {
    useReviewResultStore.getState().setReview(1, mkReview(88))
    useReviewResultStore.getState().setReview(2, mkReview(42))
    expect(selectChapterReview(1)(useReviewResultStore.getState()).review?.overallScore).toBe(88)
    expect(selectChapterReview(2)(useReviewResultStore.getState()).review?.overallScore).toBe(42)
    // 未检测的章节返回稳定空对象
    expect(selectChapterReview(3)(useReviewResultStore.getState()).review).toBeNull()
  })

  it('再次检测覆盖旧报告', () => {
    useReviewResultStore.getState().setReview(1, mkReview(50))
    useReviewResultStore.getState().setReview(1, mkReview(90))
    expect(selectChapterReview(1)(useReviewResultStore.getState()).review?.overallScore).toBe(90)
  })

  it('activeTab 按章独立保存', () => {
    useReviewResultStore.getState().setActiveTab(1, 'readability')
    expect(selectChapterReview(1)(useReviewResultStore.getState()).activeTab).toBe('readability')
    expect(selectChapterReview(2)(useReviewResultStore.getState()).activeTab).toBe('review') // 默认
  })

  it('null/undefined chapterId 返回空对象不报错', () => {
    expect(selectChapterReview(null)(useReviewResultStore.getState()).review).toBeNull()
    expect(selectChapterReview(undefined)(useReviewResultStore.getState()).review).toBeNull()
  })
})
