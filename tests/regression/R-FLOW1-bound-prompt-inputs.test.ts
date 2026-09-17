import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { assembleBoundPrompt } from '../../src/lib/ai/prompt-variable-bindings'
import type { Project, PromptTemplate } from '../../src/lib/types'

const project: Project = {
  id: 91001,
  name: '节点输入隔离',
  genres: ['mystery'],
  genre: 'mystery',
  description: '',
  targetWordCount: 100_000,
  status: 'ongoing',
  enableMultiWorld: false,
  createdAt: 1,
  updatedAt: 1,
}

const template: PromptTemplate = {
  scope: 'user',
  moduleKey: 'story.generate',
  promptType: 'generate',
  name: 'FLOW 输入',
  description: '',
  systemPrompt: '你是编剧。',
  userPromptTemplate: '世界：{{worldContext}}\n角色：{{characters}}\n要求：{{userHint}}',
  variables: ['worldContext', 'characters', 'userHint'],
  variableBindings: [
    { variable: 'worldContext', label: '世界', required: true },
    { variable: 'characters', label: '角色', required: true },
  ],
  isActive: false,
  createdAt: 1,
  updatedAt: 1,
}

describe('FLOW-1 · 声明式 Prompt 入边', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await db.projects.put(project)
  })

  it('入边值满足必填变量并与作者补充来源分开标记', async () => {
    const result = await assembleBoundPrompt({
      template,
      project,
      previousOutput: '【来自节点：世界设定 → worldContext】\n雾港的记忆可以买卖',
      workflowValues: {
        worldContext: '【来自节点：世界设定】\n雾港的记忆可以买卖',
        characters: '【来自节点：角色设计】\n失忆侦探林默',
      },
      userHint: '保持悬疑',
    })

    expect(result.missingVariables).toEqual([])
    expect(result.variables.worldContext).toContain('工作流上游节点输出')
    expect(result.variables.characters).toContain('失忆侦探林默')
    expect(result.messages.at(-1)?.content).toContain('保持悬疑')
  })
})
