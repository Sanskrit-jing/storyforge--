import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CodexPanel from '../../src/components/codex/CodexPanel'
import type { Project } from '../../src/lib/types'

/**
 * UIFIX-2 · AI 拆分词条「结束后没有结果」反馈修复
 *
 * 用户反馈（手机截图）：拆分结束后弹窗里既没有候选也没有任何提示。
 * 根因：
 * 1. handleExtractEntries 用 try/finally 无 catch，AI 调用失败被静默吞掉，弹窗无任何反馈；
 * 2. 候选区渲染在弹窗滚动区底部，窄屏一屏放不下，不滚动就看不到。
 * 回归锁：
 * - 成功：出现「拆分完成 · 共 N 条候选」标题 + 候选卡片，并自动滚动到候选区；
 * - 空结果：出现「没有产出候选词条」的持久提示（toast 会消失，必须落进弹窗）；
 * - 失败：弹窗内持久展示「拆分失败：<原因>」并触发 toast.error。
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock('../../src/lib/ai/client', () => ({
  chat: mocks.chat,
  // 只需 isAIConfigReady 通过（apiKey 存在即可）
  resolveRequestConfig: () => ({ config: { provider: 'custom', apiKey: 'test-key', baseUrl: 'http://localhost', model: 'test' } }),
}))
vi.mock('../../src/lib/registry/assemble-context', () => ({
  assembleContext: vi.fn(async () => ({ text: '拆分来源文本' })),
}))
vi.mock('../../src/lib/registry/adopt', () => ({
  adopt: vi.fn(async () => ({ written: [], skipped: [] })),
}))
vi.mock('../../src/stores/codex', () => ({
  useCodexStore: () => ({
    categories: [{
      id: 1, projectId: 1, domain: 'natural', parentId: null,
      name: '世界结构', builtInKey: 'world-structure', fieldSchema: '[]',
      hidden: false, order: 0, createdAt: 1, updatedAt: 1, icon: '📚', worldGroupId: null,
    }],
    entries: [],
    loadAll: vi.fn(async () => {}),
    addCategory: vi.fn(), deleteCategory: vi.fn(), setCategoryHidden: vi.fn(), updateCategory: vi.fn(),
    addEntry: vi.fn(), updateEntry: vi.fn(), deleteEntry: vi.fn(),
  }),
}))
vi.mock('../../src/stores/ai-config', () => ({
  useAIConfigStore: (selector: (state: { config: unknown }) => unknown) =>
    selector({ config: { provider: 'custom', apiKey: 'test-key' } }),
}))
vi.mock('../../src/stores/world-group', () => ({
  useWorldGroupStore: (selector: (state: { activeGroupId: null; groups: unknown[] }) => unknown) =>
    selector({ activeGroupId: null, groups: [] }),
}))
vi.mock('../../src/hooks/useIsNarrow', () => ({ useIsNarrow: () => false }))
vi.mock('../../src/components/shared/Toast', () => ({ useToast: () => mocks.toast }))
vi.mock('../../src/components/shared/Dialog', () => ({
  useDialog: () => ({ prompt: vi.fn(async () => null), confirm: vi.fn(async () => true), alert: vi.fn(async () => {}) }),
}))
vi.mock('../../src/components/codex/CodexEntryDetail', () => ({ default: () => null }))
vi.mock('../../src/components/codex/CodexCategoryFieldsEditor', () => ({ default: () => null }))
vi.mock('../../src/lib/ai/adapters/structured-extract-adapter', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/lib/ai/adapters/structured-extract-adapter')>()
  // buildCodexExtractPrompt 依赖 prompt store 的真实模板（IndexedDB），与本回归无关，打桩
  return { ...actual, buildCodexExtractPrompt: vi.fn(() => []) }
})

const mounted: Array<{ host: HTMLDivElement; root: ReturnType<typeof createRoot> }> = []
let scrollSpy: ReturnType<typeof vi.spyOn>

const project = { id: 1, name: '测试项目', enableMultiWorld: false } as unknown as Project

beforeEach(() => {
  mocks.chat.mockReset()
  mocks.toast.success.mockClear()
  mocks.toast.error.mockClear()
  mocks.toast.info.mockClear()
  mocks.toast.warning.mockClear()
  if (!Element.prototype.scrollIntoView) {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true })
  }
  scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView')
})

afterEach(async () => {
  scrollSpy.mockRestore()
  while (mounted.length > 0) {
    const item = mounted.pop()!
    await act(async () => item.root.unmount())
    item.host.remove()
  }
})

async function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  mounted.push({ host, root })
  await act(async () => root.render(createElement(CodexPanel, { project, extractionSourceText: '' })))
  return host
}

async function openDialogAndStart(host: HTMLDivElement) {
  const open = Array.from(host.querySelectorAll('button'))
    .find(button => button.textContent?.includes('AI 从内容拆分词条'))
  expect(open).toBeDefined()
  await act(async () => open!.click())

  const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!
  expect(textarea).toBeDefined()
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  await act(async () => {
    setValue.call(textarea, '西荒大陆位于世界西北角，地貌以荒漠为主。')
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })

  const start = Array.from(host.querySelectorAll('button'))
    .find(button => button.textContent?.includes('开始拆分'))
  expect(start).toBeDefined()
  await act(async () => start!.click())
}

describe('UIFIX-2 · AI 拆分词条结果反馈', () => {
  it('拆分成功：弹窗展示「拆分完成 · 共 N 条候选」+ 候选卡片，并自动滚动到候选区', async () => {
    const host = await mount()
    mocks.chat.mockResolvedValueOnce('```json\n[{"name":"西荒大陆","summary":"西北荒漠","icon":"🏜","importance":3,"tags":["地理"]}]\n```')

    await openDialogAndStart(host)
    // 候选完成后 80ms 自动滚动到候选区锚点
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 150)) })

    expect(host.textContent).toContain('拆分完成 · 共 1 条候选')
    expect(host.textContent).toContain('西荒大陆')
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('拆分完成但零候选：弹窗内出现持久提示，不再静默', async () => {
    const host = await mount()
    mocks.chat.mockResolvedValueOnce('AI 没有从这段内容中识别出词条。')

    await openDialogAndStart(host)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 150)) })

    expect(host.textContent).toContain('没有产出候选词条')
    expect(mocks.toast.info).toHaveBeenCalledWith('AI 未从这段内容中识别出可独立登记的词条。')
  })

  it('拆分失败：弹窗内持久展示失败原因并触发 toast.error，不再静默吞错', async () => {
    const host = await mount()
    mocks.chat.mockRejectedValueOnce(new Error('网络请求失败'))

    await openDialogAndStart(host)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 150)) })

    expect(host.textContent).toContain('拆分失败：网络请求失败')
    expect(mocks.toast.error).toHaveBeenCalledWith('拆分失败：网络请求失败')
    // 失败后不得残留成功提示
    expect(host.textContent).not.toContain('拆分完成 · 共')
  })
})
