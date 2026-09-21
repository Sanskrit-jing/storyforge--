import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AIStreamOutput from '../../src/components/shared/AIStreamOutput'

/**
 * UIFIX-1 · AI 生成结果操作栏单行横排
 *
 * 用户反馈（手机设定页截图）：全屏/重试/好示例/反例/采纳 被折成两行。
 * 回归锁：按钮组容器必须 flex-nowrap（不折行），且全部操作按钮位于同一容器内；
 * 窄屏通过缩小按钮（text-[11px] + px-1.5）保证一行放得下。
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ host: HTMLDivElement; root: ReturnType<typeof createRoot> }> = []

afterEach(async () => {
  while (mounted.length > 0) {
    const item = mounted.pop()!
    await act(async () => item.root.unmount())
    item.host.remove()
  }
})

async function mount(component: ReturnType<typeof createElement>) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  mounted.push({ host, root })
  await act(async () => root.render(component))
  return host
}

/** 操作栏里的按钮组容器（ml-auto + 按钮子元素） */
function findButtonGroup(host: HTMLDivElement): HTMLDivElement {
  const group = Array.from(host.querySelectorAll('div'))
    .find(div => div.className.includes('ml-auto') && div.querySelector('button'))
  expect(group).toBeDefined()
  return group!
}

const BASE_PROPS = {
  output: 'AI 生成的正文内容。',
  isStreaming: false,
  error: null,
  onStop: vi.fn(),
  onAccept: vi.fn(),
  onRetry: vi.fn(),
  onDismiss: vi.fn(),
  moduleKey: 'codex.extract' as const,
}

describe('UIFIX-1 · AI 生成结果操作栏单行横排', () => {
  it('按钮组强制 flex-nowrap，全屏/重试/好示例/反例/采纳/关闭 都在同一容器内', async () => {
    const host = await mount(createElement(AIStreamOutput, BASE_PROPS))

    const group = findButtonGroup(host)
    // 单行锁：按钮组不允许再出现 flex-wrap 折行
    expect(group.className).toContain('flex-nowrap')
    expect(group.className).not.toContain('flex-wrap')
    // 窄屏缩小按钮：11px 字号 + 收紧内边距（保证一行放得下）
    expect(group.className).toContain('text-[11px]')
    expect(group.className).toContain('[&>button]:px-1.5')
    // 全部操作按钮位于同一容器
    const labels = Array.from(group.querySelectorAll('button')).map(button => button.textContent ?? '')
    for (const label of ['全屏', '重试', '好示例', '反例', '采纳', '关闭']) {
      expect(labels.some(text => text.includes(label))).toBe(true)
    }
  })

  it('流式生成中（停止按钮）同样保持单行容器', async () => {
    const host = await mount(createElement(AIStreamOutput, { ...BASE_PROPS, isStreaming: true }))

    const group = findButtonGroup(host)
    expect(group.className).toContain('flex-nowrap')
    const labels = Array.from(group.querySelectorAll('button')).map(button => button.textContent ?? '')
    expect(labels.some(text => text.includes('停止'))).toBe(true)
  })
})
