import { StrictMode, createElement, useState } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import RichEditor, { type RichEditorHandle } from '../../src/components/editor/RichEditor'

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

function WordCountHarness() {
  const [value, setValue] = useState('<p>当前正文</p>')
  return createElement('div', null,
    createElement('button', { type: 'button', onClick: () => setValue('<p>新的章节内容，共十个字</p>') }, '替换内容'),
    createElement(RichEditor, { value, onChange: () => {} }),
  )
}

// 字数缓存回归：wordCount 只在文档变化时重算，
// 三条变更路径（挂载初值 / 外部 value 替换 / handle.setContent）都必须刷新工具栏字数。
describe('R-EDITOR3 · 字数统计缓存同步', () => {
  async function mountRichEditor(render: (root: ReturnType<typeof createRoot>) => void) {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    mounted.push({ host, root })
    await act(async () => {
      render(root)
      await Promise.resolve()
    })
    return host
  }

  it('挂载后按初值内容统计字数', async () => {
    const host = await mountRichEditor(root =>
      root.render(createElement(RichEditor, { value: '<p>当前正文</p>', onChange: () => {} })),
    )
    expect(host.textContent).toContain('4 字')
  })

  it('外部 value 替换（切章 / AI 整段替换）后字数刷新', async () => {
    const host = await mountRichEditor(root => root.render(createElement(WordCountHarness)))
    expect(host.textContent).toContain('4 字')
    await act(async () => {
      host.querySelector('button')!.click()
      await Promise.resolve()
    })
    // 「新的章节内容，共十个字」= 11 个非空白字符
    expect(host.textContent).toContain('11 字')
    expect(host.textContent).not.toContain('4 字')
  })

  it('handle.setContent 后字数刷新', async () => {
    const handle: { current: RichEditorHandle | null } = { current: null }
    const host = await mountRichEditor(root =>
      root.render(createElement(RichEditor, { ref: handle, value: '<p>当前正文</p>', onChange: () => {} })),
    )
    expect(host.textContent).toContain('4 字')
    await act(async () => {
      handle.current!.setContent('<p>这是替换后的内容</p>')
      await Promise.resolve()
    })
    // 「这是替换后的内容」= 8 个非空白字符
    expect(host.textContent).toContain('8 字')
    expect(host.textContent).not.toContain('4 字')
  })
})
