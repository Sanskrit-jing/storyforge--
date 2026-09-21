/**
 * R-UIFIX3 · chat() 对 429/5xx 自动重试（拆分词条 500「操作失败」修复）
 *
 * 背景：中转网关（one-api/new-api 类）常把上游偶发波动包装成 500「操作失败」，
 * 拆分词条等长输出任务走非流式 chat() 时偶发失败且此前毫无重试。
 *
 * 验证点：
 * - chat() 首次 500 后自动重试并成功（fetch 共 2 次）；
 * - chat() 对 400（参数/鉴权类确定性错误）不重试，立即抛 AIError；
 * - chat() 连续 500 耗尽重试后抛 AIError(500)（fetch 共 1 + 2 次）；
 * - streamChat 与 chat 共享可重试状态码集合：首次 503 重试后成功。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIConfig } from '../../src/lib/types'

const globalConfig: AIConfig = {
  provider: 'deepseek',
  apiKey: 'global-key',
  model: 'deepseek-v4-flash',
  baseUrl: 'https://global.example/v1',
  temperature: 0.7,
  maxTokens: 0,
  contextWindow: 131_072,
}

async function flushRetryWait(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('R-UIFIX3 · chat/streamChat 对 429/5xx 自动重试', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('chat 首次 500（中转网关「操作失败」）后自动重试并成功', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: { code: '500', message: '操作失败' } }),
        { status: 500 },
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ choices: [{ message: { content: '拆分成功' } }] }),
        { status: 200 },
      ))
    vi.stubGlobal('fetch', fetchMock)

    const { chat } = await import('../../src/lib/ai/client')
    const pending = chat(
      [{ role: 'user', content: '拆分词条' }],
      globalConfig,
      { category: 'codex.extract' },
    )
    // 首次 500 后等待 2s 再重试
    await flushRetryWait(2_000)
    await expect(pending).resolves.toBe('拆分成功')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('chat 对 400 确定性错误不重试，立即抛 AIError', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValue(new Response(
        JSON.stringify({ error: { message: 'Invalid API key' } }),
        { status: 400 },
      ))
    vi.stubGlobal('fetch', fetchMock)

    const { chat } = await import('../../src/lib/ai/client')
    await expect(chat(
      [{ role: 'user', content: 'hello' }],
      globalConfig,
    )).rejects.toMatchObject({ name: 'AIError', status: 400 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('chat 连续 500 耗尽 2 次重试后抛 AIError(500)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValue(new Response(
        JSON.stringify({ error: { code: '500', message: '操作失败' } }),
        { status: 500 },
      ))
    vi.stubGlobal('fetch', fetchMock)

    const { chat } = await import('../../src/lib/ai/client')
    const pending = chat(
      [{ role: 'user', content: '拆分词条' }],
      globalConfig,
      { category: 'codex.extract' },
    )
    // 先订阅 rejects 断言，再推进重试等待（2s + 4s），避免 promise 在无 handler 时 reject
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AIError', status: 500 })
    await flushRetryWait(2_000)
    await flushRetryWait(4_000)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('streamChat 首次 503 后自动重试并正常产出流式内容', async () => {
    const sse = 'data: {"choices":[{"delta":{"content":"重试"}}]}\n\ndata: [DONE]\n\n'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('service unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(sse, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    const { streamChat } = await import('../../src/lib/ai/client')
    const pending = (async () => {
      let out = ''
      for await (const chunk of streamChat([{ role: 'user', content: '写一句' }], globalConfig)) {
        out += chunk
      }
      return out
    })()
    await flushRetryWait(2_000)
    await expect(pending).resolves.toBe('重试')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
