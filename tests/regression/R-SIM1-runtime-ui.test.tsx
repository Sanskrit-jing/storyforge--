import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import SimulationRuntimePanel from '../../src/components/simulation/SimulationRuntimePanel'
import { DialogProvider } from '../../src/components/shared/Dialog'
import { db } from '../../src/lib/db/schema'
import { EMPTY_SIMULATION_STATE, type Project } from '../../src/lib/types'
import { useSimulationRuntimeStore } from '../../src/stores/simulation-runtime'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function changeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function button(host: HTMLElement, text: string): HTMLButtonElement {
  const result = Array.from(host.querySelectorAll('button'))
    .find(item => item.textContent?.trim() === text)
  if (!result) throw new Error(`找不到按钮: ${text}`)
  return result
}

async function clickWhenEnabled(host: HTMLElement, text: string) {
  const target = button(host, text)
  await viWaitFor(() => expect(target.disabled).toBe(false))
  await act(async () => {
    target.click()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

describe('SIM-1A · 互动运行时 UI', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let project: Project

  beforeEach(async () => {
    await db.delete()
    await db.open()
    useSimulationRuntimeStore.setState({
      projectId: null,
      sessions: [],
      selectedSessionId: null,
      events: [],
      checkpoints: [],
      runtimeState: structuredClone(EMPTY_SIMULATION_STATE),
      loading: false,
      error: '',
    })
    const now = Date.now()
    const projectId = await db.projects.add({
      name: '互动运行时 UI',
      genre: '',
      genres: [],
      status: 'drafting',
      description: '',
      targetWordCount: 0,
      enableMultiWorld: false,
      createdAt: now,
      updatedAt: now,
    } as Project) as number
    project = (await db.projects.get(projectId))!
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    db.close()
  })

  it('从可见入口创建会话、追加事件、保存检查点、建立分支并安全删除', async () => {
    await act(async () => {
      root.render(createElement(
        DialogProvider,
        null,
        createElement(SimulationRuntimePanel, { project, worldGroupId: null }),
      ))
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    const title = host.querySelector<HTMLInputElement>('input[placeholder="新会话名称"]')!
    await act(async () => changeValue(title, '雾港跑团'))
    await clickWhenEnabled(host, '新建独立会话')
    await viWaitFor(() => expect(host.textContent).toContain('雾港跑团'))
    expect(await db.simulationSessions.count()).toBe(1)

    const time = host.querySelector<HTMLInputElement>('input[aria-label="推进时间"]')!
    await act(async () => changeValue(time, '3'))
    await clickWhenEnabled(host, '推进时间')
    await viWaitFor(() => expect(host.textContent).toContain('时间 +3'))

    const narrative = host.querySelector<HTMLTextAreaElement>('textarea')!
    await act(async () => changeValue(narrative, '守门人交出了潮汐密钥。'))
    await clickWhenEnabled(host, '追加叙事事件')
    await viWaitFor(() => expect(host.textContent).toContain('守门人交出了潮汐密钥。'))

    const checkpoint = host.querySelector<HTMLInputElement>('input[placeholder="检查点名称"]')!
    await act(async () => changeValue(checkpoint, '进入钟楼前'))
    await clickWhenEnabled(host, '保存')
    await viWaitFor(() => expect(host.textContent).toContain('进入钟楼前'))

    const branch = host.querySelector<HTMLInputElement>('input[placeholder="新分支名称"]')!
    await act(async () => changeValue(branch, '拒绝密钥分支'))
    await clickWhenEnabled(host, '分支')
    await viWaitFor(() => expect(db.simulationSessions.count()).resolves.toBe(2))
    const child = (await db.simulationSessions.toArray())
      .find(session => session.title === '拒绝密钥分支')
    expect(child).toMatchObject({ parentThroughSequence: 2 })
    expect(child?.parentSessionId).toBeTypeOf('number')

    const remove = host.querySelector<HTMLButtonElement>(
      'button[aria-label="删除会话 拒绝密钥分支"]',
    )!
    await act(async () => remove.click())
    await viWaitFor(() => expect(host.textContent).toContain('删除互动会话“拒绝密钥分支”？'))
    await act(async () => {
      button(host, '删除').click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await viWaitFor(() => expect(db.simulationSessions.count()).resolves.toBe(1))
    expect(await db.simulationEvents.count()).toBe(2)
  })
})

async function viWaitFor(assertion: () => void | Promise<void>) {
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < 3_000) {
    try {
      await act(async () => {
        await assertion()
      })
      return
    } catch (error) {
      lastError = error
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
    }
  }
  throw lastError
}
