/**
 * 灵感反推结果的「跨卸载恢复」回归。
 *
 * 背景：流式输出与控制器活在共享 AI 会话里，面板被切走（一级标签切换、平板分屏来回操作）
 * 时组件卸载、本地 state 丢失，但生成继续。历史实现用组件本地 state 作为「流结束后要解析」
 * 的触发器，卸载后标记一起消失，切回来只剩 AI 原文、结果区永远不出现且不报错。
 * 现在标记写在共享会话的 operation 上，因此本用例锁定：卸载期间跑完的生成，重新挂载后
 * 仍能被解析成结果与待确认差异。
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UseAIStreamReturn } from '../../src/hooks/useAIStream'
import { useIncrementalInspiration } from '../../src/hooks/useIncrementalInspiration'
import type { Project } from '../../src/lib/types'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const fakeSession = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  const session: {
    output: string
    isStreaming: boolean
    error: string | null
    operation: string | null
  } = { output: '', isStreaming: false, error: null, operation: null }
  return {
    session,
    listeners,
    notify: () => { for (const listener of listeners) listener() },
    finishStream: (output: string) => {
      session.output = output
      session.isStreaming = false
      for (const listener of listeners) listener()
    },
  }
})

// 共享会话语义：状态脱离组件生命周期，setOperation 直接改会话并不会因卸载而回滚。
vi.mock('../../src/hooks/useAIStream', async () => {
  const { useEffect, useReducer } = await import('react')
  return {
    useAIStream: (): UseAIStreamReturn => {
      const [, forceRender] = useReducer((count: number) => count + 1, 0)
      useEffect(() => {
        fakeSession.listeners.add(forceRender)
        return () => { fakeSession.listeners.delete(forceRender) }
      }, [])
      return {
        output: fakeSession.session.output,
        isStreaming: fakeSession.session.isStreaming,
        error: fakeSession.session.error,
        tokenUsage: null,
        operation: fakeSession.session.operation,
        start: async () => {
          // 真实实现会清空输出并置为生成中；流何时结束由用例显式推进。
          fakeSession.session.output = ''
          fakeSession.session.isStreaming = true
          fakeSession.notify()
          return ''
        },
        stop: () => {},
        reset: () => {},
        setOperation: operation => {
          fakeSession.session.operation = operation
          fakeSession.notify()
        },
      }
    },
  }
})

// 灵感工作区只提供「已有碎片」这一个前提，不触碰真实数据库。
vi.mock('../../src/stores/inspiration-workspace', async () => {
  const { create } = await import('zustand')
  return {
    useInspirationWorkspaceStore: create(() => ({
      workspace: null,
      fragments: [{
        id: 'fragment-1',
        text: '退潮后城市从海床升起',
        label: '',
        sourceKind: 'author',
        createdAt: 1,
      }],
      versions: [],
      loading: false,
      load: async () => {},
      addFragment: async () => null,
      removeFragment: async () => {},
      saveVersion: async () => ({}),
    })),
  }
})

vi.mock('../../src/lib/registry/assemble-context', () => ({
  assembleContext: async () => ({ text: '灵感融合上下文' }),
}))

// 只替换提示词装配，解析器保持真实实现。
vi.mock('../../src/lib/ai/inspiration-reverse', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/lib/ai/inspiration-reverse')>()
  return {
    ...actual,
    buildInspirationReversePrompt: () => [{ role: 'user', content: '反推' }],
    buildInspirationReverseMultiWorldPrompt: () => [{ role: 'user', content: '反推' }],
  }
})

const project: Project = {
  id: 1,
  name: '恢复测试',
  genre: '玄幻',
  genres: ['玄幻'],
  status: 'drafting',
  description: '',
  targetWordCount: 200_000,
  createdAt: 1,
  updatedAt: 1,
}

const WORLD_ORIGIN = '潮汐退去后，第一座守灯城从海床升起。'

const REVERSE_OUTPUT = [
  '好的，以下是反推结果：',
  '```json',
  JSON.stringify({
    worldview: {
      worldOrigin: WORLD_ORIGIN,
      powerHierarchy: '灯火术分三阶：燃、守、熄。',
      continentLayout: '',
      climateByRegion: '',
      historyLine: '',
      races: '',
      factionLayout: '',
    },
    storyCore: {
      logline: '守灯人穿越退潮海床寻找失踪的潮汐钟。',
      theme: '记忆与守望',
      centralConflict: '',
      plotPattern: '',
      mainPlot: '',
    },
    characters: [{
      name: '林照雪',
      roleWeight: 'main',
      moralAxis: 'good',
      orderAxis: 'neutral',
      shortDescription: '守护旧港灯塔的年轻钟匠。',
      personality: '克制',
      background: '出身钟匠世家。',
      motivation: '修复潮汐钟。',
      arc: '学会信任',
    }],
  }, null, 2),
  '```',
].join('\n')

let hook: ReturnType<typeof useIncrementalInspiration>

const mounted: Array<ReturnType<typeof createRoot>> = []

function Harness() {
  hook = useIncrementalInspiration(project, () => {})
  return createElement('div', null, 'idle')
}

async function mountPanel() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  mounted.push(root)
  await act(async () => root.render(createElement(Harness)))
  return {
    unmount: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}

afterEach(async () => {
  while (mounted.length > 0) {
    await act(async () => mounted.pop()!.unmount())
  }
  fakeSession.session.output = ''
  fakeSession.session.isStreaming = false
  fakeSession.session.error = null
  fakeSession.session.operation = null
  fakeSession.listeners.clear()
})

describe('灵感反推 · 生成中卸载后重新挂载', () => {
  it('流在面板卸载期间跑完，切回来仍能解析出结果与待确认差异', async () => {
    const panel = await mountPanel()
    expect(hook.selectedFragmentIds.size).toBe(1)

    await act(async () => { await hook.generate() })
    expect(fakeSession.session.operation).toBe('inspiration.reverse.pending')

    // 面板被切走：组件卸载，本地 state 全部丢失。
    await panel.unmount()
    expect(hook.result).toBeNull()

    // 流在「无人挂载」的状态下跑完。
    await act(async () => { fakeSession.finishStream(REVERSE_OUTPUT) })
    expect(hook.result).toBeNull()

    // 切回来：标记仍在共享会话上，据此补上解析。
    await mountPanel()
    expect(hook.result?.worldview.worldOrigin).toBe(WORLD_ORIGIN)
    expect(hook.pendingDiff).not.toBeNull()
    expect(fakeSession.session.operation).toBeNull()
  })

  it('面板不离场时同样只解析一次并清掉标记', async () => {
    await mountPanel()
    await act(async () => { await hook.generate() })

    await act(async () => { fakeSession.finishStream(REVERSE_OUTPUT) })

    expect(hook.result?.worldview.worldOrigin).toBe(WORLD_ORIGIN)
    expect(hook.pendingDiff).not.toBeNull()
    expect(fakeSession.session.operation).toBeNull()
  })
})
