import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AIConfig } from '../../src/lib/types'

const mocks = vi.hoisted(() => ({
  chat: vi.fn(async () => '他掠过长街。'),
}))

vi.mock('../../src/lib/ai/client', () => ({
  chat: mocks.chat,
  resolveRequestConfig: (config: AIConfig) => ({ config }),
}))

import StyleCalibrationPanel from '../../src/components/style/StyleCalibrationPanel'
import { ToastProvider } from '../../src/components/shared/Toast'
import { useAIConfigStore } from '../../src/stores/ai-config'
import { useUserStyleStore } from '../../src/stores/user-style'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ host: HTMLDivElement; root: ReturnType<typeof createRoot> }> = []

function setTextareaValue(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  setter.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function setInputValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function button(host: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(host.querySelectorAll('button'))
    .find(item => item.textContent?.includes(text)) as HTMLButtonElement
}

afterEach(async () => {
  mocks.chat.mockClear()
  while (mounted.length > 0) {
    const item = mounted.pop()!
    await act(async () => item.root.unmount())
    item.host.remove()
  }
})

describe('R-FB5 · 互动文风校准 UI', () => {
  it('生成结果先由作者编辑，再分别记录判断与显式保存样本', async () => {
    const captureRevisionPair = vi.fn(async () => ({
      id: 'manual-1',
      chapterTitle: '互动校准样本',
      beforeText: '他很快地跑过长街。',
      afterText: '他穿过长街。',
      capturedAt: 1,
    }))
    const addCalibrationFeedback = vi.fn(async () => ({
      id: 'feedback-1',
      verdict: 'needs-adjustment' as const,
      note: '动作还不够克制',
      sourceExcerpt: '他很快地跑过长街。',
      resultExcerpt: '他穿过长街。',
      createdAt: 1,
    }))
    useUserStyleStore.setState({ captureRevisionPair, addCalibrationFeedback })
    useAIConfigStore.setState({
      config: {
        provider: 'custom',
        apiKey: 'test-key',
        baseUrl: 'http://localhost:1234/v1',
        model: 'test-model',
        temperature: 0.7,
        maxTokens: 0,
      },
    })

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    mounted.push({ host, root })
    await act(async () => {
      root.render(createElement(ToastProvider, null,
        createElement(StyleCalibrationPanel, {
          projectId: 9,
          profile: {
            id: 1,
            projectId: 9,
            profile: '偏爱短句与白描',
            enabled: true,
            sourceChapterIds: '[]',
            sampleCount: 0,
            sampleWords: 0,
            revisionPairs: JSON.stringify([{
              id: 'pair-1',
              chapterTitle: '旧样本',
              beforeText: '非常快速地走',
              afterText: '快步走',
              capturedAt: 1,
            }]),
            createdAt: 1,
            updatedAt: 1,
          },
        }),
      ))
    })

    const source = host.querySelector<HTMLTextAreaElement>('textarea[placeholder*="待校准短文"]')!
    await act(async () => setTextareaValue(source, '他很快地跑过长街。'))
    await act(async () => {
      button(host, '生成校准稿').click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.chat).toHaveBeenCalledOnce()
    expect(mocks.chat.mock.calls[0][2]).toMatchObject({ category: 'style.calibrate', projectId: 9 })
    const messages = mocks.chat.mock.calls[0][0] as Array<{ content: string }>
    expect(messages.at(-1)?.content).toContain('快步走')

    const result = host.querySelector<HTMLTextAreaElement>('#style-calibration-result')!
    expect(result.value).toBe('他掠过长街。')
    await act(async () => setTextareaValue(result, '他穿过长街。'))
    const note = host.querySelector<HTMLInputElement>('input[placeholder*="具体哪里"]')!
    await act(async () => setInputValue(note, '动作还不够克制'))

    await act(async () => {
      button(host, '仍需调整').click()
      await Promise.resolve()
    })
    expect(addCalibrationFeedback).toHaveBeenCalledWith(9, expect.objectContaining({
      verdict: 'needs-adjustment',
      note: '动作还不够克制',
      sourceText: '他很快地跑过长街。',
      resultText: '他穿过长街。',
    }))

    await act(async () => {
      button(host, '保存为改稿样本').click()
      await Promise.resolve()
    })
    expect(captureRevisionPair).toHaveBeenCalledWith(9, expect.objectContaining({
      beforeText: '他很快地跑过长街。',
      afterText: '他穿过长街。',
      authorNote: '动作还不够克制',
    }))
  })
})
