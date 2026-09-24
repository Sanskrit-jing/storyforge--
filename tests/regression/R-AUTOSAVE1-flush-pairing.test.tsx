import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAutoSave, type AutoSaveController } from '../../src/hooks/useAutoSave'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

interface HostProps {
  data: string
  saveFn: (data: string) => Promise<void>
  delay: number
}

// 最小宿主组件：捕获 controller 引用，模拟「data 与 saveFn 在 render 间各自变化」
let captured: AutoSaveController | null = null

function Host(props: HostProps) {
  captured = useAutoSave(props.data, props.saveFn, props.delay)
  return null
}

async function mountHost(props: HostProps) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(createElement(Host, props))
  })
  return { host, root }
}

async function rerenderHost(root: ReturnType<typeof createRoot>, props: HostProps) {
  await act(async () => {
    root.render(createElement(Host, props))
  })
}

// 不用 fake timers：vitest 的 fake 定时器会拦住 happy-dom MessageChannel 的消息派发，
// 导致 React 19 act 内的初次渲染永远不执行。改用真实定时器 + 短 delay / 大 delay 控制。
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('AUTOSAVE-1 · useAutoSave flush 配对语义', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('切目标后（data 未重置、saveFn 已换绑）flush 仍把旧内容写给旧 saveFn', async () => {
    const saveChapterA = vi.fn(async (_data: string) => {})
    const saveChapterB = vi.fn(async (_data: string) => {})
    // delay 远大于用例耗时，debounce 不会自发到期干扰断言
    const delay = 5000

    const mounted = await mountHost({ data: '章A·v1', saveFn: saveChapterA, delay })
    // 章A 内容编辑：发起 debounce，配对当时的 saveChapterA
    await rerenderHost(mounted.root, { data: '章A·v2', saveFn: saveChapterA, delay })
    // 模拟切章窗口：currentChapter 已换 B（saveFn 换绑），但 content 尚未重置
    await rerenderHost(mounted.root, { data: '章A·v2', saveFn: saveChapterB, delay })

    await act(async () => { await captured!.flush() })

    expect(saveChapterA).toHaveBeenCalledTimes(1)
    expect(saveChapterA).toHaveBeenCalledWith('章A·v2')
    expect(saveChapterB).not.toHaveBeenCalled()

    // 之后 content 重置为新章内容：配对更新为新 saveFn
    await rerenderHost(mounted.root, { data: '章B·v1', saveFn: saveChapterB, delay })
    await act(async () => { await captured!.flush() })
    expect(saveChapterB).toHaveBeenCalledTimes(1)
    expect(saveChapterB).toHaveBeenCalledWith('章B·v1')
    expect(saveChapterA).toHaveBeenCalledTimes(1)

    await act(async () => mounted.root.unmount())
    mounted.host.remove()
  })

  it('flush 清除等待中的 debounce 定时器，到期后不重复保存', async () => {
    const save = vi.fn(async (_data: string) => {})
    const delay = 120
    const mounted = await mountHost({ data: 'v1', saveFn: save, delay })

    await rerenderHost(mounted.root, { data: 'v2', saveFn: save, delay })
    // timer 尚未到期时手动 flush
    await act(async () => { await captured!.flush() })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('v2')

    // 等 debounce 窗口完全过去：timer 已被 flush 清除，不触发第二次保存
    await act(async () => { await sleep(delay * 2) })
    expect(save).toHaveBeenCalledTimes(1)

    await act(async () => mounted.root.unmount())
    mounted.host.remove()
  })

  it('组件卸载时若有未落盘变更，用配对 saveFn 立即保存', async () => {
    const save = vi.fn(async (_data: string) => {})
    const delay = 5000
    const mounted = await mountHost({ data: 'v1', saveFn: save, delay })

    await rerenderHost(mounted.root, { data: 'v2', saveFn: save, delay })
    // 不等 debounce，直接卸载：unmount flush 必须兜底落盘
    await act(async () => {
      mounted.root.unmount()
    })
    await act(async () => { await sleep(0) })

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('v2')
    mounted.host.remove()
  })

  it('无未落盘变更时 flush 为空操作，debounce 到期正常保存', async () => {
    const save = vi.fn(async (_data: string) => {})
    const mounted = await mountHost({ data: 'v1', saveFn: save, delay: 80 })

    // 首次渲染后未编辑：flush 不应触发保存
    await act(async () => { await captured!.flush() })
    expect(save).not.toHaveBeenCalled()

    // 编辑后 debounce 到期：走同一条 flush 路径保存一次
    await rerenderHost(mounted.root, { data: 'v2', saveFn: save, delay: 80 })
    await act(async () => { await sleep(160) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('v2')

    // 到期保存已清 dirty：再次 flush 不重复保存
    await act(async () => { await captured!.flush() })
    expect(save).toHaveBeenCalledTimes(1)

    await act(async () => mounted.root.unmount())
    mounted.host.remove()
  })
})
