import { act, createElement, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TtsConfigCard from '../../src/components/settings/TtsConfigCard'
import EmbeddingConfigCard from '../../src/components/settings/EmbeddingConfigCard'

/**
 * UIFIX-4 · 设置页「语义检索」缺测试功能/保存按钮，「朗读人声」缺保存按钮
 *
 * 用户反馈（截图）：语义检索(embedding)配置卡没有测试功能和保存按钮；
 * 朗读人声卡没有保存按钮——底部文案写着「保存后重新进入章节编辑器生效」，
 * 却找不到保存动作（此前是 onChange 静默即时保存，用户无从感知配置是否已记住）。
 * 修复：两卡改为「草稿 + 显式保存」模式（未保存时有「有未保存更改」提示），
 * 语义检索卡新增「测试连接」（发一条真实嵌入请求验证地址/模型/Key 连通，不写索引）。
 * 回归锁：
 * - 朗读人声：输入不落盘 → 点「保存」才落盘并显示「已保存」；
 * - 语义检索：输入不写 store → 点「保存」才写 store 并显示「已保存」；
 * - 语义检索：测试连接成功显示返回维度、失败显示原因；有未保存更改时提示记得保存。
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const INITIAL_EMBEDDING = {
    enabled: true,
    provider: 'ollama',
    apiKey: '',
    baseUrl: 'http://localhost:11434/v1',
    model: 'bge-m3',
  }
  return {
    INITIAL_EMBEDDING,
    embedding: { ...INITIAL_EMBEDDING } as Record<string, unknown>,
    setEmbeddingConfig: vi.fn(),
    embedTexts: vi.fn(),
  }
})

vi.mock('../../src/stores/ai-config', () => ({
  useAIConfigStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { embedding: mocks.embedding, setEmbeddingConfig: mocks.setEmbeddingConfig }
    return selector ? selector(state) : state
  },
}))

// 测试连接的 UI 反馈行为是回归目标；网络层 embedTexts 打桩（避免真实 fetch 与 IndexedDB 记账）
vi.mock('../../src/lib/ai/adapters/embedding-adapter', () => ({
  embedTexts: mocks.embedTexts,
  isEmbeddingReady: () => false,
}))

vi.mock('../../src/lib/retrieval/retrieval', () => ({
  ensureChunkEmbeddings: vi.fn(),
  rebuildProjectNarrativeSummaries: vi.fn(),
  rebuildProjectRetrievalChunks: vi.fn(),
}))

vi.mock('../../src/stores/project', () => ({
  useProjectStore: (selector: (s: { currentProjectId: number | null }) => unknown) =>
    selector({ currentProjectId: null }),
}))

const mounted: Array<{ host: HTMLDivElement; root: ReturnType<typeof createRoot> }> = []

beforeEach(() => {
  Object.assign(mocks.embedding, mocks.INITIAL_EMBEDDING)
  mocks.setEmbeddingConfig.mockReset()
  // 与真实 store 同构：保存 = 合并进当前配置（引用同对象，重渲染后 dirty 消失）
  mocks.setEmbeddingConfig.mockImplementation((partial: Record<string, unknown>) => {
    Object.assign(mocks.embedding, partial)
  })
  mocks.embedTexts.mockReset()
  localStorage.clear()
})

afterEach(async () => {
  while (mounted.length > 0) {
    const item = mounted.pop()!
    await act(async () => item.root.unmount())
    item.host.remove()
  }
})

async function mount(Component: ComponentType) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  mounted.push({ host, root })
  await act(async () => root.render(createElement(Component)))
  return host
}

const findButton = (host: HTMLDivElement, text: string) =>
  Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes(text))

async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function flush() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
}

describe('UIFIX-4 · 朗读人声卡显式保存', () => {
  it('输入只进草稿不落盘，点「保存」才写入 localStorage 并显示「已保存」', async () => {
    const host = await mount(TtsConfigCard)

    const input = host.querySelector<HTMLInputElement>('input[type="text"]')!
    expect(input).toBeDefined()
    await type(input, 'https://my-worker.example.dev')

    // 未保存：dirty 提示出现，localStorage 未写入
    expect(host.textContent).toContain('有未保存更改')
    expect(localStorage.getItem('storyforge-speech-reader')).toBeNull()

    const save = findButton(host, '保存')!
    expect(save).toBeDefined()
    expect(save.disabled).toBe(false)
    await act(async () => save.click())

    expect(localStorage.getItem('storyforge-speech-reader')).not.toBeNull()
    const stored = JSON.parse(localStorage.getItem('storyforge-speech-reader')!) as { ttsBaseUrl?: string }
    expect(stored.ttsBaseUrl).toBe('https://my-worker.example.dev')
    expect(host.textContent).toContain('已保存')
    expect(host.textContent).not.toContain('有未保存更改')
  })

  it('无更改时「保存」按钮禁用；清空按钮立即生效并恢复浏览器内置语音', async () => {
    localStorage.setItem('storyforge-speech-reader',
      JSON.stringify({ rate: 1, voiceURI: '', ttsBaseUrl: 'https://saved.workers.dev', ttsApiKey: 'k' }))
    const host = await mount(TtsConfigCard)

    const input = host.querySelector<HTMLInputElement>('input[type="text"]')!
    expect((input as HTMLInputElement).value).toBe('https://saved.workers.dev')
    expect(findButton(host, '保存')!.disabled).toBe(true)

    const clear = findButton(host, '清空')!
    await act(async () => clear.click())

    const stored = JSON.parse(localStorage.getItem('storyforge-speech-reader')!) as { ttsBaseUrl?: string }
    expect(stored.ttsBaseUrl).toBe('')
    expect(host.textContent).toContain('已清空')
  })
})

describe('UIFIX-4 · 语义检索卡保存与测试连接', () => {
  it('输入只进草稿不写 store，点「保存」才写入并显示「已保存」', async () => {
    const host = await mount(EmbeddingConfigCard)

    const input = host.querySelector<HTMLInputElement>('input[type="text"]')!
    expect((input as HTMLInputElement).value).toBe('http://localhost:11434/v1')
    await type(input, 'https://api.siliconflow.cn/v1')

    expect(host.textContent).toContain('有未保存更改')
    expect(mocks.setEmbeddingConfig).not.toHaveBeenCalled()

    const save = findButton(host, '保存')!
    expect(save.disabled).toBe(false)
    await act(async () => save.click())

    expect(mocks.setEmbeddingConfig).toHaveBeenCalledTimes(1)
    expect(mocks.setEmbeddingConfig).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://api.siliconflow.cn/v1' }))
    expect(host.textContent).toContain('已保存')
    expect(host.textContent).not.toContain('有未保存更改')
  })

  it('测试连接成功：显示返回维度；有未保存更改时提示记得保存', async () => {
    mocks.embedTexts.mockResolvedValueOnce([[0.1, 0.2, 0.3]])
    const host = await mount(EmbeddingConfigCard)

    const input = host.querySelector<HTMLInputElement>('input[type="text"]')!
    await type(input, 'https://api.siliconflow.cn/v1')

    const test = findButton(host, '测试连接')!
    expect(test).toBeDefined()
    await act(async () => test.click())
    await flush()

    expect(mocks.embedTexts).toHaveBeenCalledTimes(1)
    expect(mocks.embedTexts.mock.calls[0]![0]).toEqual(['连接测试'])
    expect(host.textContent).toContain('连接成功：返回 3 维向量')
    expect(host.textContent).toContain('记得点「保存」生效')
  })

  it('测试连接失败：显示失败原因，不再提示保存', async () => {
    mocks.embedTexts.mockRejectedValueOnce(new Error('embedding HTTP 401'))
    const host = await mount(EmbeddingConfigCard)

    const test = findButton(host, '测试连接')!
    await act(async () => test.click())
    await flush()

    expect(host.textContent).toContain('连接失败：embedding HTTP 401')
    expect(host.textContent).not.toContain('记得点「保存」生效')
  })

  it('Base URL 或嵌入模型为空时测试连接给出填写提示，不发请求', async () => {
    mocks.embedding.model = ''
    const host = await mount(EmbeddingConfigCard)

    const test = findButton(host, '测试连接')!
    await act(async () => test.click())
    await flush()

    expect(mocks.embedTexts).not.toHaveBeenCalled()
    expect(host.textContent).toContain('请先填写 Base URL 与嵌入模型')
  })
})
