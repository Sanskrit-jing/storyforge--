import { describe, expect, it, vi } from 'vitest'
import {
  createWorldOriginCopilotNode,
  WorldOriginCopilotStaleError,
  type WorldOriginCopilotInput,
  type WorldOriginSnapshot,
} from '../../src/lib/agent/world-origin-copilot'
import {
  adoptGenerationNodeOutput,
  prepareGenerationNode,
  runGenerationNode,
} from '../../src/lib/generation/generation-node'
import type { AdoptResult } from '../../src/lib/registry/types'

const snapshot: WorldOriginSnapshot = {
  id: 9,
  updatedAt: 100,
  worldOrigin: '旧世界由潮汐孕育。',
}

function adoptionResult(output: string): AdoptResult {
  return {
    written: [{ id: 9, fields: output ? ['worldOrigin'] : [] }],
    aliasMapped: [],
    unknown: [],
    typeErrors: [],
    fkErrors: [],
    skipped: [],
  }
}

function input(overrides: Partial<WorldOriginCopilotInput> = {}): WorldOriginCopilotInput {
  return {
    projectId: 1,
    projectName: '潮汐纪元',
    genre: 'fantasy',
    worldGroupId: 3,
    authorRequest: '保留潮汐意象，补充文明起点',
    contextText: '【项目概况】角色 2，章节 1\n【当前世界】存在潮汐信仰',
    snapshot,
    config: {
      provider: 'custom',
      apiKey: '',
      model: 'test-model',
      baseUrl: 'http://127.0.0.1/v1',
      temperature: 0.7,
      maxTokens: 3000,
    },
    ...overrides,
  }
}

describe('AGENT-1 · ChatCopilot 世界来源闭环', () => {
  it('GenerationNode 输入包含登记读取结果与作者要求，生成阶段严格只读', async () => {
    const runAI = vi.fn(async () => '潮汐退去后，第一座盐城从海床升起。')
    const adoptOutput = vi.fn(async (output: string) => adoptionResult(output))
    const nodeInput = input()
    const node = createWorldOriginCopilotNode(nodeInput, {
      runAI,
      readCurrent: async () => snapshot,
      adoptOutput,
    })

    const prepared = prepareGenerationNode(node, nodeInput)
    const result = await runGenerationNode(node, prepared)

    expect(prepared.messages.some(message => message.content.includes('角色 2'))).toBe(true)
    expect(prepared.messages.some(message => message.content.includes('保留潮汐意象'))).toBe(true)
    expect(result.gate?.status).toBe('pass')
    expect(result.adopted).toBe(false)
    expect(adoptOutput).not.toHaveBeenCalled()
  })

  it('用户编辑候选后，确认只写入眼前内容且不再次生成', async () => {
    const runAI = vi.fn(async () => '模型候选：海潮创造世界。')
    const adoptOutput = vi.fn(async (output: string) => adoptionResult(output))
    const nodeInput = input()
    const node = createWorldOriginCopilotNode(nodeInput, {
      runAI,
      readCurrent: async () => snapshot,
      adoptOutput,
    })
    await runGenerationNode(node, prepareGenerationNode(node, nodeInput))

    const result = await adoptGenerationNodeOutput(
      node,
      '作者确认版：潮汐退去后，盐城文明从海床苏醒。',
    )

    expect(runAI).toHaveBeenCalledTimes(1)
    expect(adoptOutput).toHaveBeenCalledWith('作者确认版：潮汐退去后，盐城文明从海床苏醒。')
    expect(result.adopted).toBe(true)
  })

  it.each([
    ['', 'empty-world-origin'],
    ['短', 'world-origin-too-short'],
    ['旧世界由潮汐孕育。', 'world-origin-unchanged'],
    ['长'.repeat(12_001), 'world-origin-too-long'],
  ])('确定性 gate 拒绝非法或无变化候选', async (candidate, issueCode) => {
    const adoptOutput = vi.fn(async (output: string) => adoptionResult(output))
    const node = createWorldOriginCopilotNode(input(), {
      runAI: async () => candidate,
      readCurrent: async () => snapshot,
      adoptOutput,
    })

    const result = await adoptGenerationNodeOutput(node, candidate)

    expect(result.gate?.status).toBe('blocked')
    expect(result.gate?.issues.some(issue => issue.code === issueCode)).toBe(true)
    expect(adoptOutput).not.toHaveBeenCalled()
  })

  it('候选生成后来源被面板修改时拒绝覆盖', async () => {
    const adoptOutput = vi.fn(async (output: string) => adoptionResult(output))
    const node = createWorldOriginCopilotNode(input(), {
      runAI: async () => '新候选内容',
      readCurrent: async () => ({ ...snapshot, updatedAt: 101, worldOrigin: '面板刚刚保存的新内容' }),
      adoptOutput,
    })

    await expect(adoptGenerationNodeOutput(node, '新候选内容'))
      .rejects.toBeInstanceOf(WorldOriginCopilotStaleError)
    expect(adoptOutput).not.toHaveBeenCalled()
  })

  it('字段注册表未完整写回时不伪报成功', async () => {
    const node = createWorldOriginCopilotNode(input(), {
      runAI: async () => '新候选内容',
      readCurrent: async () => snapshot,
      adoptOutput: async () => ({
        ...adoptionResult(''),
        written: [],
        unknown: ['notRegistered'],
      }),
    })

    await expect(adoptGenerationNodeOutput(node, '新候选内容'))
      .rejects.toThrow('未完整通过字段注册表校验')
  })
})
