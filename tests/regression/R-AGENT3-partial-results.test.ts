/**
 * R-AGENT3 · 多任务编排部分结果保留
 *
 * 背景：executeMasterAgentPlan 此前单任务失败即整体 throw，
 * 已成功任务的候选全部丢失（第三任务失败会连坐前两个成功候选）。
 * 现改为：失败任务记录并级联跳过依赖它的后续任务，独立任务继续执行；
 * 部分成功时正常返回已有候选，仅当全部任务失败才抛出最后错误。
 *
 * 本测试 mock world-origin / character 两个领域 Agent 与预算执行节点，
 * 第三个灵感任务因空库（无灵感碎片）自然失败，验证部分结果保留与级联跳过。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { executeMasterAgentPlan } from '../../src/lib/agent/orchestrator'
import type {
  ExecutedMasterCandidate,
  MasterAgentPlan,
} from '../../src/lib/agent/orchestrator'
import {
  prepareCharacterCopilot,
} from '../../src/lib/agent/character-copilot'
import { prepareWorldOriginCopilot } from '../../src/lib/agent/world-origin-copilot'
import { runBudgetedGenerationNode } from '../../src/lib/agent/team-execution'
import { useAIConfigStore } from '../../src/stores/ai-config'

vi.mock('../../src/lib/agent/world-origin-copilot', () => ({
  prepareWorldOriginCopilot: vi.fn(),
}))

vi.mock('../../src/lib/agent/character-copilot', () => ({
  prepareCharacterCopilot: vi.fn(),
  parseCharacterCandidateDraft: vi.fn(),
}))

vi.mock('../../src/lib/agent/team-execution', () => ({
  runBudgetedGenerationNode: vi.fn(),
}))

interface TaskEvent {
  taskId: string
  status: 'running' | 'completed' | 'failed'
  error?: string
}

describe('R-AGENT3 · 多任务部分结果保留', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    useAIConfigStore.setState({ presets: [], taskRoutes: {} })
  })

  afterEach(() => {
    vi.clearAllMocks()
    useAIConfigStore.setState({ presets: [], taskRoutes: {} })
    db.close()
  })

  it('第三任务失败不丢弃前两个成功候选，依赖失败的任务级联跳过', async () => {
    vi.mocked(prepareWorldOriginCopilot).mockResolvedValue({
      node: {},
      prepared: {},
      snapshot: { id: null, updatedAt: null, worldOrigin: '' },
      contextSources: [],
      contextEvidence: [],
    } as any)
    vi.mocked(prepareCharacterCopilot).mockResolvedValue({
      node: {},
      prepared: {},
      snapshot: {},
      contextSources: [],
      contextEvidence: [],
    } as any)
    vi.mocked(runBudgetedGenerationNode)
      .mockResolvedValueOnce({ output: '潮汐世界草案' } as any)
      .mockResolvedValueOnce({ output: { name: '守灯人' } } as any)

    // 4 个任务：world ← hero ← spark(必失败) ← blocked(依赖 spark，应级联跳过)
    const plan = {
      summary: '多任务部分结果测试',
      tasks: [
        { id: 'world', agentId: 'world-origin', instruction: '建立潮汐世界', dependsOn: [] },
        { id: 'hero', agentId: 'character', instruction: '设计守灯人主角', dependsOn: ['world'] },
        { id: 'spark', agentId: 'inspiration', instruction: '灵感反推', dependsOn: ['hero'] },
        { id: 'blocked', agentId: 'character', instruction: '被连坐的任务', dependsOn: ['spark'] },
      ],
    } as unknown as MasterAgentPlan

    const events: TaskEvent[] = []
    const candidates: ExecutedMasterCandidate[] = await executeMasterAgentPlan({
      projectId: 1,
      worldGroupId: null,
      plan,
      onTask: (task, status, error) => {
        events.push({ taskId: task.id, status, error })
      },
    })

    // 前两个成功候选被保留
    expect(candidates.map(c => c.payload.taskId)).toEqual(['world', 'hero'])

    // world / hero 正常完成
    expect(events.filter(e => e.taskId === 'world').map(e => e.status)).toEqual(['running', 'completed'])
    expect(events.filter(e => e.taskId === 'hero').map(e => e.status)).toEqual(['running', 'completed'])

    // spark：空库无灵感碎片自然失败
    const sparkEvents = events.filter(e => e.taskId === 'spark')
    expect(sparkEvents.map(e => e.status)).toEqual(['running', 'failed'])
    expect(sparkEvents[1].error).toBe('项目尚无已保存的灵感碎片。')

    // blocked：级联跳过，没有 running 事件、没有真实执行
    const blockedEvents = events.filter(e => e.taskId === 'blocked')
    expect(blockedEvents.map(e => e.status)).toEqual(['failed'])
    expect(blockedEvents[0].error).toBe('依赖任务失败，已跳过')

    // AI 调用只发生在前两个任务上
    expect(runBudgetedGenerationNode).toHaveBeenCalledTimes(2)
    expect(prepareCharacterCopilot).toHaveBeenCalledTimes(1)
  })

  it('全部任务失败时抛出最后一个错误（保持原报错路径）', async () => {
    // world-origin prepare 未配置 mock 返回值 → mockResolvedValue 为 undefined，
    // prepareWorldOriginCopilot() 返回 undefined 会导致解构失败吗？
    // 直接让 runBudgetedGenerationNode 抛错更可控。
    vi.mocked(prepareWorldOriginCopilot).mockResolvedValue({
      node: {},
      prepared: {},
      snapshot: { id: null, updatedAt: null, worldOrigin: '' },
      contextSources: [],
      contextEvidence: [],
    } as any)
    vi.mocked(runBudgetedGenerationNode).mockRejectedValue(new Error('上游模型不可用'))

    const plan = {
      summary: '全失败测试',
      tasks: [
        { id: 'a', agentId: 'world-origin', instruction: '任务A', dependsOn: [] },
        { id: 'b', agentId: 'world-origin', instruction: '任务B', dependsOn: [] },
      ],
    } as unknown as MasterAgentPlan

    const events: TaskEvent[] = []
    await expect(executeMasterAgentPlan({
      projectId: 1,
      worldGroupId: null,
      plan,
      onTask: (task, status, error) => {
        events.push({ taskId: task.id, status, error })
      },
    })).rejects.toThrow('上游模型不可用')

    // 两个任务都尝试过且都失败，返回空候选路径走 throw
    expect(events.filter(e => e.taskId === 'a').map(e => e.status)).toEqual(['running', 'failed'])
    expect(events.filter(e => e.taskId === 'b').map(e => e.status)).toEqual(['running', 'failed'])
  })
})
