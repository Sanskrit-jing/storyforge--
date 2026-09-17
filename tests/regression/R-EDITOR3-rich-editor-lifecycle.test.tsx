import { StrictMode, createElement, useState } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import RichEditor from '../../src/components/editor/RichEditor'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ host: HTMLDivElement; root: ReturnType<typeof createRoot> }> = []

function CompareHarness() {
  const [compare, setCompare] = useState(false)
  return createElement('div', null,
    createElement('button', { type: 'button', onClick: () => setCompare(true) }, '打开对照'),
    compare
      ? createElement('div', null,
        createElement(RichEditor, {
          value: '<p>原稿</p>',
          onChange: () => {},
          disabled: true,
          showToolbar: false,
        }),
        createElement(RichEditor, {
          value: '<p>改稿</p>',
          onChange: () => {},
        }),
      )
      : createElement(RichEditor, {
        value: '<p>当前正文</p>',
        onChange: () => {},
      }),
  )
}

afterEach(async () => {
  while (mounted.length > 0) {
    const item = mounted.pop()!
    await act(async () => item.root.unmount())
    item.host.remove()
  }
})

describe('R-EDITOR3 · 富文本编辑器严格模式生命周期', () => {
  it('从单编辑器切换到双栏对照时不访问已销毁的 TipTap schema', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    mounted.push({ host, root })
    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(CompareHarness)))
      await Promise.resolve()
    })
    await act(async () => {
      host.querySelector('button')!.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(host.querySelectorAll('.tiptap-editor')).toHaveLength(2)
    expect(host.textContent).toContain('原稿')
    expect(host.textContent).toContain('改稿')
  })
})
