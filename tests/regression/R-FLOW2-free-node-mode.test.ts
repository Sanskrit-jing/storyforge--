import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db/schema'
import {
  adoptNodeRunOutput,
  runNodeFlow,
  updateNodeRunOutput,
} from '../../src/lib/node-flow/executor'
import {
  topologicalNodeOrder,
  validateNodeFlowGraph,
} from '../../src/lib/node-flow/graph'
import type { NodeFlow, NodeFlowGraph, Project } from '../../src/lib/types'
import { useNodeFlowStore } from '../../src/stores/node-flow'

const project: Project = {
  id: 72001,
  name: '自由节点测试',
  genre: 'fantasy',
  genres: ['fantasy'],
  status: 'drafting',
  description: '',
  targetWordCount: 100_000,
  enableMultiWorld: false,
  createdAt: 1,
  updatedAt: 1,
}

const graph: NodeFlowGraph = {
  version: 1,
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    {
      id: 'author',
      kind: 'input.text',
      title: '作者设定',
      x: 0,
      y: 0,
      config: { text: '世界诞生于潮汐退去之后。' },
      inputSlots: [],
    },
    {
      id: 'compose',
      kind: 'transform.compose',
      title: '组合',
      x: 300,
      y: 0,
      config: { template: '【世界来源】\n{{设定}}' },
      inputSlots: [{
        id: 'compose-input',
        label: '设定',
        type: 'text',
        required: true,
        priority: 100,
        maxTokens: 2000,
      }],
    },
    {
      id: 'validate',
      kind: 'validation.required',
      title: '校验',
      x: 600,
      y: 0,
      config: { requiredTerms: '潮汐', forbiddenTerms: '现代地球' },
      inputSlots: [{
        id: 'validate-input',
        label: '候选',
        type: 'candidate',
        required: true,
        priority: 100,
      }],
    },
    {
      id: 'output',
      kind: 'output.preview',
      title: '项目输出',
      x: 900,
      y: 0,
      config: { adoptTarget: 'world-origin' },
      inputSlots: [{
        id: 'output-input',
        label: '最终内容',
        type: 'candidate',
        required: true,
        priority: 100,
      }],
    },
  ],
  edges: [
    { id: 'e1', sourceNodeId: 'author', targetNodeId: 'compose', targetSlotId: 'compose-input' },
    { id: 'e2', sourceNodeId: 'compose', targetNodeId: 'validate', targetSlotId: 'validate-input' },
    { id: 'e3', sourceNodeId: 'validate', targetNodeId: 'output', targetSlotId: 'output-input' },
  ],
}

describe('FLOW-2 · 独立自由节点模式', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await db.projects.put(project)
    useNodeFlowStore.setState({ projectId: null, flows: [], runs: [], loading: false })
  })

  afterEach(() => db.close())

  it('验证自由路径并只运行目标节点的祖先闭包', () => {
    expect(validateNodeFlowGraph(graph)).toEqual([])
    expect(topologicalNodeOrder(graph, 'validate').map(node => node.id)).toEqual([
      'author',
      'compose',
      'validate',
    ])
  })

  it('持久保存实际输入输出，刷新后可编辑，并经显式确认写入 Canon', async () => {
    const now = Date.now()
    const flowId = await db.nodeFlows.add({
      projectId: project.id!,
      worldGroupId: null,
      name: '潮汐起源',
      description: '',
      graphJson: JSON.stringify(graph),
      createdAt: now,
      updatedAt: now,
    }) as number
    const flow = (await db.nodeFlows.get(flowId)) as NodeFlow

    const outcome = await runNodeFlow({ flow })
    expect(outcome.run.status).toBe('completed')
    expect(outcome.snapshots.compose.inputs[0].content).toContain('潮汐退去')
    expect(outcome.results.output.output).toContain('世界来源')

    const stored = await db.nodeRuns.get(outcome.run.id!)
    expect(JSON.parse(stored!.inputSnapshotsJson).compose.totalTokens).toBeGreaterThan(0)
    expect(JSON.parse(stored!.nodeResultsJson).output.output).toContain('潮汐')

    const edited = '潮汐退去之后，第一座城从海床上升起。'
    await updateNodeRunOutput({ runId: outcome.run.id!, nodeId: 'output', output: edited })
    expect(JSON.parse((await db.nodeRuns.get(outcome.run.id!))!.nodeResultsJson).output.output).toBe(edited)
    expect(await db.worldviews.where('projectId').equals(project.id!).count()).toBe(0)

    const adopted = await adoptNodeRunOutput({
      runId: outcome.run.id!,
      nodeId: 'output',
      output: edited,
    })
    expect(adopted.message).toContain('世界来源')
    expect(adopted.results.output.adoptedAt).toBeTypeOf('number')
    expect((await db.worldviews.where('projectId').equals(project.id!).first())?.worldOrigin).toBe(edited)
  })

  it('未完成的节点图也能保存，删除节点图会级联删除运行记录', async () => {
    const flowId = await useNodeFlowStore.getState().createFlow(project.id!, null)
    const flow = (await db.nodeFlows.get(flowId))!
    const incomplete = {
      ...graph,
      edges: [],
    }
    await expect(useNodeFlowStore.getState().saveFlow({
      ...flow,
      graphJson: JSON.stringify(incomplete),
    })).resolves.toBe(flowId)
    await db.nodeRuns.add({
      projectId: project.id!,
      flowId,
      status: 'completed',
      inputSnapshotsJson: '{}',
      nodeResultsJson: '{}',
      startedAt: 1,
      updatedAt: 1,
      completedAt: 1,
    })
    await useNodeFlowStore.getState().removeFlow(flowId)
    expect(await db.nodeFlows.get(flowId)).toBeUndefined()
    expect(await db.nodeRuns.where('flowId').equals(flowId).count()).toBe(0)
  })
})
