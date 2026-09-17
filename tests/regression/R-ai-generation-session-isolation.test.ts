/**
 * R-ai-generation-session-isolation · AI 生成会话跨组件卸载保留（bug B1 / E-1）
 *
 * 验证点：
 * - 会话按 projectId + moduleKey + entityId 隔离；
 * - 流式输出、错误、用量和操作类型均可在重新读取时恢复；
 * - reset 只清当前会话，不影响其它面板或实体；
 * - 未建立的会话返回稳定空状态。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createAISessionKey,
  selectAIGenerationSession,
  useAIGenerationSessionStore,
} from '../../src/stores/ai-generation-session'

describe('R-ai-generation-session-isolation · AI 生成会话隔离与恢复', () => {
  beforeEach(() => {
    useAIGenerationSessionStore.setState({ sessions: {} })
  })

  it('同一会话重新读取时保留流式输出与操作类型', () => {
    const key = createAISessionKey(7, 'chapter.content', 42)
    useAIGenerationSessionStore.getState().patchSession(key, {
      output: '尚未采纳的正文草稿',
      isStreaming: true,
      operation: 'continue',
    })

    const restored = selectAIGenerationSession(key)(useAIGenerationSessionStore.getState())
    expect(restored.output).toBe('尚未采纳的正文草稿')
    expect(restored.isStreaming).toBe(true)
    expect(restored.operation).toBe('continue')
  })

  it('不同项目、模块和实体互不串台', () => {
    const chapterA = createAISessionKey(1, 'chapter.content', 10)
    const chapterB = createAISessionKey(1, 'chapter.content', 11)
    const worldview = createAISessionKey(1, 'worldview.dimension', 'origin')
    const otherProject = createAISessionKey(2, 'chapter.content', 10)

    const store = useAIGenerationSessionStore.getState()
    store.patchSession(chapterA, { output: 'A' })
    store.patchSession(chapterB, { output: 'B' })
    store.patchSession(worldview, { output: 'W' })
    store.patchSession(otherProject, { output: 'P2' })

    const state = useAIGenerationSessionStore.getState()
    expect(selectAIGenerationSession(chapterA)(state).output).toBe('A')
    expect(selectAIGenerationSession(chapterB)(state).output).toBe('B')
    expect(selectAIGenerationSession(worldview)(state).output).toBe('W')
    expect(selectAIGenerationSession(otherProject)(state).output).toBe('P2')
  })

  it('reset 只清当前会话', () => {
    const first = createAISessionKey(1, 'story.generate', 'theme')
    const second = createAISessionKey(1, 'story.generate', 'mainPlot')
    const store = useAIGenerationSessionStore.getState()
    store.patchSession(first, { output: '主题草稿' })
    store.patchSession(second, { output: '主线草稿' })
    store.resetSession(first)

    const state = useAIGenerationSessionStore.getState()
    expect(selectAIGenerationSession(first)(state).output).toBe('')
    expect(selectAIGenerationSession(second)(state).output).toBe('主线草稿')
  })

  it('未建立的会话返回空状态', () => {
    const empty = selectAIGenerationSession('missing')(useAIGenerationSessionStore.getState())
    expect(empty).toMatchObject({
      output: '',
      isStreaming: false,
      error: null,
      tokenUsage: null,
      operation: null,
    })
  })
})
