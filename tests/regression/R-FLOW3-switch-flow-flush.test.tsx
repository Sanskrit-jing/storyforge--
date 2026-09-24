import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db/schema'
import type { NodeFlowGraph, Project } from '../../src/lib/types'
import { DialogProvider } from '../../src/components/shared/Dialog'
import { ToastProvider } from '../../src/components/shared/Toast'
import NodeModeWorkspace from '../../src/components/node-flow/NodeModeWorkspace'
import { useNodeFlowStore } from '../../src/stores/node-flow'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const project: Project = {
  id: 73001,
  name: '切流程落盘测试',
  genre: 'fantasy',
  genres: ['fantasy'],
  status: 'drafting',
  description: '',
  targetWordCount: 100_000,
  enableMultiWorld: false,
  createdAt: 1,
  updatedAt: 1,
}

function emptyGraph(): NodeFlowGraph {
  return { version: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [] }
}

async function seedFlows(): Promise<{ flowAId: number; flowBId: number }> {
  const base = { projectId: project.id, worldGroupId: null, description: '', createdAt: 1 }
  const flowAId = await db.nodeFlows.add({
    ...base,
    name: '旧流程',
    graphJson: JSON.stringify(emptyGraph()),
    // updatedAt 更大：组件加载后默认选中第一条
    updatedAt: 200,
  }) as number
  const flowBId = await db.nodeFlows.add({
    ...base,
    name: '新流程',
    graphJson: JSON.stringify(emptyGraph()),
    updatedAt: 100,
  }) as number
  return { flowAId, flowBId }
}

async function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      createElement(DialogProvider, null,
        createElement(ToastProvider, null,
          createElement(NodeModeWorkspace, { project, worldGroupId: null }),
        ),
      ),
    )
  })
  return { host, root }
}

function buttonByText(host: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll('button'))
    .find(candidate => candidate.textContent?.includes(text))
  if (!button) throw new Error(`missing button: ${text}`)
  return button
}

async function storedGraph(flowId: number): Promise<NodeFlowGraph> {
  const row = await db.nodeFlows.get(flowId)
  if (!row) throw new Error(`missing flow row: ${flowId}`)
  return JSON.parse(row.graphJson) as NodeFlowGraph
}

describe('FLOW-3 · 切流程/卸载前未保存编辑落盘', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await db.projects.put(project)
    useNodeFlowStore.setState({ projectId: null, flows: [], runs: [], loading: false })
  })

  it('添加节点后立即切流程：旧流程的未保存编辑写入旧流程，不污染新流程', async () => {
    const { flowAId, flowBId } = await seedFlows()
    const mounted = await mount()

    // 等待流程列表加载并默认选中「旧流程」
    await act(async () => {
      if (!mounted.host.textContent?.includes('旧流程')) throw new Error('等待流程列表加载')
    })
    await act(async () => {
      if (!mounted.host.textContent?.includes('自由文本')) throw new Error('等待节点定义加载')
    })

    // 添加节点：changeGraph 触发 dirty=true + 700ms debounce 自动保存定时器
    await act(async () => {
      buttonByText(mounted.host, '自由文本').click()
    })
    // 不等待 debounce，立即切换流程：切流程 effect 头部 flushPendingFlowSave 应把编辑写回旧流程
    await act(async () => {
      buttonByText(mounted.host, '新流程').click()
    })

    const graphA = await storedGraph(flowAId)
    expect(graphA.nodes).toHaveLength(1)
    expect(graphA.nodes[0]?.kind).toBe('input.text')

    // 新流程未被污染，仍是空图
    const graphB = await storedGraph(flowBId)
    expect(graphB.nodes).toHaveLength(0)
    expect(graphB.edges).toHaveLength(0)

    await act(async () => mounted.root.unmount())
    mounted.host.remove()
  })

  it('添加节点后直接卸载组件：未保存编辑由卸载兜底写入数据库', async () => {
    const { flowAId, flowBId } = await seedFlows()
    const mounted = await mount()

    await act(async () => {
      if (!mounted.host.textContent?.includes('自由文本')) throw new Error('等待节点定义加载')
    })

    // 添加节点后不切流程、不等 debounce，直接卸载（模拟切项目/切视图）
    await act(async () => {
      buttonByText(mounted.host, '自由文本').click()
    })
    await act(async () => {
      mounted.root.unmount()
    })

    const graphA = await storedGraph(flowAId)
    expect(graphA.nodes).toHaveLength(1)
    expect(graphA.nodes[0]?.kind).toBe('input.text')

    const graphB = await storedGraph(flowBId)
    expect(graphB.nodes).toHaveLength(0)

    mounted.host.remove()
  })

  it('无未保存编辑时切流程：不产生多余写入', async () => {
    const { flowAId, flowBId } = await seedFlows()
    const mounted = await mount()

    await act(async () => {
      if (!mounted.host.textContent?.includes('新流程')) throw new Error('等待流程列表加载')
    })

    const beforeA = await db.nodeFlows.get(flowAId)
    await act(async () => {
      buttonByText(mounted.host, '新流程').click()
    })
    const afterA = await db.nodeFlows.get(flowAId)
    // 未编辑：updatedAt 不应被刷新
    expect(afterA?.updatedAt).toBe(beforeA?.updatedAt)
    expect(afterA?.graphJson).toBe(beforeA?.graphJson)

    void flowBId
    await act(async () => mounted.root.unmount())
    mounted.host.remove()
  })
})
