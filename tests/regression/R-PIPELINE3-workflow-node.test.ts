import { describe, expect, it, vi } from 'vitest'
import {
  prepareGenerationNode,
  runGenerationNode,
} from '../../src/lib/generation/generation-node'
import { createWorkflowGenerationNode } from '../../src/lib/generation/workflow-generation-node'

describe('PIPELINE-3 · 既有工作流节点兼容', () => {
  it('PromptWorkflow 步骤经 GenerationNode 执行且不自动写回', async () => {
    const start = vi.fn(async () => '步骤产物')
    const node = createWorkflowGenerationNode({
      workflowId: 8,
      stepId: 'step-2',
      category: 'story.core',
      projectId: 3,
      ai: { start },
    })
    const result = await runGenerationNode(
      node,
      prepareGenerationNode(node, [{ role: 'user', content: '上一步已确认产物' }]),
    )

    expect(node.id).toBe('workflow.8.step-2')
    expect(node.editableInput).toBe(true)
    expect(start).toHaveBeenCalledWith(
      [{ role: 'user', content: '上一步已确认产物' }],
      undefined,
      { category: 'story.core', projectId: 3 },
    )
    expect(result.output).toBe('步骤产物')
    expect(result.adopted).toBe(false)
  })
})
