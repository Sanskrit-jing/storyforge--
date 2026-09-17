import { describe, expect, it, vi } from 'vitest'
import {
  adoptGenerationNodeOutput,
  prepareGenerationNode,
  runGenerationNode,
  type GenerationNode,
} from '../../src/lib/generation/generation-node'

describe('PIPELINE-1 · GenerationNode 运行边界', () => {
  it('默认使用装配快照运行且不自动采纳', async () => {
    const run = vi.fn(async () => '生成结果')
    const adopt = vi.fn(async () => '已采纳')
    const node: GenerationNode<{ context: string }, string, string> = {
      id: 'outline.chapter:single:7',
      kind: 'outline.chapter',
      editableInput: true,
      assembleInput: input => [
        { role: 'system', content: '系统约束' },
        { role: 'user', content: `作品上下文：${input.context}` },
      ],
      run,
      adopt,
    }

    const prepared = prepareGenerationNode(node, { context: '守住角色动机' })
    const result = await runGenerationNode(node, prepared)

    expect(run).toHaveBeenCalledWith([
      { role: 'system', content: '系统约束' },
      { role: 'user', content: '作品上下文：守住角色动机' },
    ])
    expect(result.output).toBe('生成结果')
    expect(result.adopted).toBe(false)
    expect(adopt).not.toHaveBeenCalled()
  })

  it('一次性覆盖送入模型但不污染准备快照', async () => {
    const run = vi.fn(async () => '结果')
    const node: GenerationNode<string, string> = {
      id: 'outline.volume:batch',
      kind: 'outline.volume',
      editableInput: true,
      assembleInput: content => [{ role: 'user', content }],
      run,
    }
    const prepared = prepareGenerationNode(node, '原始拼接内容')

    await runGenerationNode(node, prepared, {
      messages: [{ role: 'user', content: '作者本次编辑内容' }],
    })

    expect(run).toHaveBeenCalledWith([{ role: 'user', content: '作者本次编辑内容' }])
    expect(prepared.messages).toEqual([{ role: 'user', content: '原始拼接内容' }])
  })

  it('确定性 gate 阻断时即使显式请求也不采纳', async () => {
    const adopt = vi.fn(async () => '不应执行')
    const node: GenerationNode<string, string, string> = {
      id: 'outline.chapter.quality',
      kind: 'outline.chapter.quality',
      editableInput: true,
      assembleInput: content => [{ role: 'user', content }],
      run: async () => '角色重复获得同一物品',
      gate: () => ({
        status: 'blocked',
        issues: [{ code: 'duplicate-item', message: '物品已由该角色持有' }],
      }),
      adopt,
    }
    const result = await runGenerationNode(
      node,
      prepareGenerationNode(node, '质检'),
      { adopt: true },
    )

    expect(result.gate?.status).toBe('blocked')
    expect(result.adopted).toBe(false)
    expect(adopt).not.toHaveBeenCalled()
  })

  it('采纳已经确认的精确候选时不重新调用模型，并重新执行 gate', async () => {
    const run = vi.fn(async () => '模型第一次生成')
    const gate = vi.fn((output: string) => ({
      status: output.length >= 4 ? 'pass' as const : 'blocked' as const,
      issues: output.length >= 4 ? [] : [{ code: 'too-short', message: '内容过短' }],
    }))
    const adopt = vi.fn(async (output: string) => `已采纳：${output}`)
    const node: GenerationNode<string, string, string> = {
      id: 'chat-copilot.world-origin',
      kind: 'worldview.dimension',
      editableInput: true,
      assembleInput: content => [{ role: 'user', content }],
      run,
      gate,
      adopt,
    }

    const generated = await runGenerationNode(
      node,
      prepareGenerationNode(node, '生成世界来源'),
    )
    const result = await adoptGenerationNodeOutput(node, '作者编辑后的候选')

    expect(generated.output).toBe('模型第一次生成')
    expect(run).toHaveBeenCalledTimes(1)
    expect(gate).toHaveBeenLastCalledWith('作者编辑后的候选')
    expect(adopt).toHaveBeenCalledWith('作者编辑后的候选')
    expect(result).toMatchObject({
      output: '作者编辑后的候选',
      adopted: true,
      adoption: '已采纳：作者编辑后的候选',
    })
  })

  it('精确候选的二次 gate 被阻断时保持只读', async () => {
    const adopt = vi.fn(async () => '不应执行')
    const node: GenerationNode<string, string, string> = {
      id: 'chat-copilot.world-origin',
      kind: 'worldview.dimension',
      editableInput: true,
      assembleInput: content => [{ role: 'user', content }],
      run: async () => '候选',
      gate: output => ({
        status: output.trim() ? 'pass' : 'blocked',
        issues: output.trim() ? [] : [{ code: 'empty', message: '候选为空' }],
      }),
      adopt,
    }

    const result = await adoptGenerationNodeOutput(node, '   ')

    expect(result.gate?.status).toBe('blocked')
    expect(result.adopted).toBe(false)
    expect(adopt).not.toHaveBeenCalled()
  })

  it('拒绝空消息和跨节点快照', async () => {
    const emptyNode: GenerationNode<string, string> = {
      id: 'empty',
      kind: 'test',
      editableInput: true,
      assembleInput: () => [{ role: 'user', content: '   ' }],
      run: async () => '',
    }
    expect(() => prepareGenerationNode(emptyNode, '')).toThrow('空消息')

    const first: GenerationNode<string, string> = {
      ...emptyNode,
      id: 'first',
      assembleInput: content => [{ role: 'user', content }],
    }
    const second = { ...first, id: 'second' }
    const prepared = prepareGenerationNode(first, '有效')
    await expect(runGenerationNode(second, prepared)).rejects.toThrow('不匹配')
  })
})
