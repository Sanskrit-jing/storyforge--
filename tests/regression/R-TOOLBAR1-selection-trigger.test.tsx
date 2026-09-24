import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FloatingToolbar from '../../src/components/editor/FloatingToolbar'

/**
 * TOOLBAR-1 · 选中文本浮动工具栏触发灵敏度
 *
 * 用户反馈：选中文本后工具条触发不灵敏——闪一下就消失、拖拽选字中途弹出打断选区。
 * 根因（旧实现）：
 * 1. selectionchange 一超过 5 字立即弹出 → 拖拽中途工具条出现在光标下，吃掉 pointerup；
 * 2. 延迟隐藏 setTimeout(200) 不取消、回调不复查实时选区 →「塌陷→新选区」竞态下
 *    旧计时器把刚弹出的工具条误杀（双击选词必现）；
 * 3. 门槛 length > 5 → 中文 2~5 字短语选区（如「他笑了笑」）不触发。
 * 回归锁：
 * - 拖拽选字进行中不弹出，松手（pointerup）后立即弹出；
 * - 竞态反例：塌陷后紧跟新选区，工具条不被旧计时器隐藏；
 * - 2 字短语选区可触发；
 * - pointerdown 落在编辑器/正文区立即收起旧工具条；落在工具条内则按钮保持可点。
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ host: HTMLDivElement; root: ReturnType<typeof createRoot> }> = []

afterEach(async () => {
  vi.useRealTimers()
  while (mounted.length > 0) {
    const item = mounted.pop()!
    await act(async () => item.root.unmount())
    item.host.remove()
  }
})

async function mount(getSelectedText: () => string, getSelectionRect: () => DOMRect | null) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  mounted.push({ host, root })
  await act(async () =>
    root.render(createElement(FloatingToolbar, { getSelectedText, getSelectionRect, replaceSelectedText: vi.fn() })),
  )
  return host
}

function fire(target: EventTarget, type: string) {
  act(() => {
    target.dispatchEvent(new Event(type))
  })
}

const RECT = {
  top: 100, bottom: 120, left: 200, right: 300, width: 100, height: 20, x: 200, y: 100,
  toJSON: () => ({}),
} as DOMRect

function toolbarVisible(host: HTMLDivElement): boolean {
  return Array.from(host.querySelectorAll('button')).some(button => button.textContent === '润色')
}

describe('TOOLBAR-1 · 浮动工具栏触发灵敏度', () => {
  it('拖拽选字进行中不弹出，松手（pointerup）后立即弹出', async () => {
    let text = ''
    const host = await mount(() => text, () => RECT)

    // 按下并拖拽出有效选区：期间工具条不得弹出（否则吃掉 pointerup、打断选区）
    fire(document.body, 'pointerdown')
    text = '这是一段被拖拽选中的文字'
    fire(document, 'selectionchange')
    expect(toolbarVisible(host)).toBe(false)

    // 松手：按当前选区评估，立即弹出
    fire(document.body, 'pointerup')
    expect(toolbarVisible(host)).toBe(true)
  })

  it('竞态反例：塌陷后紧跟新选区（双击选词），工具条不被 200ms 前的旧计时器隐藏', async () => {
    vi.useFakeTimers()
    let text = ''
    const host = await mount(() => text, () => RECT)

    // 第一次点击选区塌陷 → 安排 200ms 延迟隐藏
    fire(document, 'selectionchange')
    // 双击选中一个词 → 有效选区弹出
    text = '被选中的词'
    fire(document, 'selectionchange')
    expect(toolbarVisible(host)).toBe(true)

    // 旧计时器到期：不得把新弹出的工具条杀掉（旧代码在此处失败）
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(toolbarVisible(host)).toBe(true)
  })

  it('2 字中文短语选区即可触发（旧门槛 >5 字会漏掉）', async () => {
    let text = ''
    const host = await mount(() => text, () => RECT)

    text = '流世'
    fire(document, 'selectionchange')
    expect(toolbarVisible(host)).toBe(true)
  })

  it('在正文区重新按下立即收起旧工具条；在工具条内按下则按钮保持可点', async () => {
    const text = '一段有效选区'
    const host = await mount(() => text, () => RECT)
    fire(document, 'selectionchange')
    expect(toolbarVisible(host)).toBe(true)

    const toolbar = host.querySelector('div.fixed') as HTMLElement | null
    expect(toolbar).toBeTruthy()

    // 工具条内按下：不得隐藏（否则按钮点不到）
    fire(toolbar!, 'pointerdown')
    fire(toolbar!, 'pointerup')
    expect(toolbarVisible(host)).toBe(true)

    // 正文区重新按下（新手势开始）：立即收起，避免挡住新一轮拖拽
    fire(document.body, 'pointerdown')
    expect(toolbarVisible(host)).toBe(false)
  })
})
