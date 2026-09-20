import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  appendAgentEvent,
  deleteAgentConversation,
  deleteAgentEvent,
  deleteAgentEventsFromSequence,
  getOrCreateAgentConversation,
  listArchivedAgentConversations,
  readAgentEvents,
  reopenAgentConversation,
  startNewAgentConversation,
} from '../../src/lib/agent/conversations'
import { db } from '../../src/lib/db/schema'

async function createProject(name: string) {
  const now = Date.now()
  return db.projects.add({
    name,
    genre: 'fantasy',
    genres: ['fantasy'],
    status: 'drafting',
    description: '',
    targetWordCount: 100_000,
    enableMultiWorld: false,
    createdAt: now,
    updatedAt: now,
  }) as Promise<number>
}

describe('AGENT-7 · 主 Agent 对话生命周期（新建/删除/撤销/重写）', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })
  afterEach(() => db.close())

  it('新建对话归档当前对话并切换到空对话，旧对话事件保留', async () => {
    const projectId = await createProject('归档测试')
    const first = await getOrCreateAgentConversation({ projectId, worldGroupId: null })
    await appendAgentEvent({ projectId, conversationId: first.id!, kind: 'message', role: 'user', content: '第一轮请求' })
    await appendAgentEvent({ projectId, conversationId: first.id!, kind: 'message', role: 'assistant', content: '第一轮回复' })

    const second = await startNewAgentConversation({
      projectId,
      worldGroupId: null,
      currentConversationId: first.id!,
    })

    expect(second.id).not.toBe(first.id)
    expect((await db.agentConversations.get(first.id!))?.status).toBe('archived')
    expect((await readAgentEvents(first.id!)).length).toBe(2)
    expect(await readAgentEvents(second.id!)).toEqual([])

    // getOrCreate 之后应命中新建的 active 对话，而不是复活归档对话
    const reopened = await getOrCreateAgentConversation({ projectId, worldGroupId: null })
    expect(reopened.id).toBe(second.id)
  })

  it('只能删除对话消息，plan/candidate 审计事件与其他项目事件受保护', async () => {
    const projectId = await createProject('删除测试')
    const otherProjectId = await createProject('另一个项目')
    const conversation = await getOrCreateAgentConversation({ projectId, worldGroupId: null })
    const otherConversation = await getOrCreateAgentConversation({ projectId: otherProjectId, worldGroupId: null })
    const message = await appendAgentEvent({ projectId, conversationId: conversation.id!, kind: 'message', role: 'user', content: '可删除' })
    const candidate = await appendAgentEvent({
      projectId,
      conversationId: conversation.id!,
      kind: 'candidate',
      content: '候选草稿',
      payload: { version: 1, taskId: 't1', agentId: 'character', label: '候选', contextSources: [], baseSnapshot: {} },
    })
    const foreign = await appendAgentEvent({ projectId: otherProjectId, conversationId: otherConversation.id!, kind: 'message', role: 'user', content: '他项目消息' })

    // 反例：候选事件不可删
    await expect(deleteAgentEvent(candidate.id!, projectId)).rejects.toThrow('只能删除对话消息')
    // 反例：跨项目事件不可删
    await expect(deleteAgentEvent(foreign.id!, projectId)).rejects.toThrow('要删除的 Agent 消息不存在')
    // 正例：本项目的消息可删
    await deleteAgentEvent(message.id!, projectId)
    expect(await db.agentEvents.get(message.id!)).toBeUndefined()
    // 他项目事件不受影响
    expect(await db.agentEvents.get(foreign.id!)).toBeDefined()
  })

  it('按序号撤销只删目标对话中 sequence >= N 的事件，不影响其他对话与项目', async () => {
    const projectId = await createProject('撤销测试')
    const otherProjectId = await createProject('他项目')
    const conversation = await getOrCreateAgentConversation({ projectId, worldGroupId: null })
    const otherConversation = await getOrCreateAgentConversation({ projectId: otherProjectId, worldGroupId: null })

    const first = await appendAgentEvent({ projectId, conversationId: conversation.id!, kind: 'message', role: 'user', content: '第一轮' })
    await appendAgentEvent({ projectId, conversationId: conversation.id!, kind: 'plan', content: '计划' })
    await appendAgentEvent({ projectId, conversationId: conversation.id!, kind: 'message', role: 'assistant', content: '第一轮回复' })
    const second = await appendAgentEvent({ projectId, conversationId: conversation.id!, kind: 'message', role: 'user', content: '第二轮' })
    await appendAgentEvent({ projectId, conversationId: conversation.id!, kind: 'message', role: 'assistant', content: '第二轮回复' })
    await appendAgentEvent({ projectId: otherProjectId, conversationId: otherConversation.id!, kind: 'message', role: 'user', content: '他对话消息' })

    // 反例：跨项目删除被拒绝
    await expect(deleteAgentEventsFromSequence({ projectId, conversationId: otherConversation.id!, fromSequence: 1 }))
      .rejects.toThrow()

    const removed = await deleteAgentEventsFromSequence({ projectId, conversationId: conversation.id!, fromSequence: second.sequence })
    expect(removed).toBe(2)
    const remaining = await readAgentEvents(conversation.id!)
    // 只剩第一轮（用户消息 + 计划 + 回复），第二轮及之后被删除
    expect(remaining.map(event => event.sequence)).toEqual([first.sequence, first.sequence + 1, first.sequence + 2])
    expect(remaining[0].content).toBe('第一轮')
    expect((await readAgentEvents(otherConversation.id!)).length).toBe(1)
  })

  it('历史列表只含本项目/本世界的归档对话，消息数只计 message，按更新时间倒序', async () => {
    const projectId = await createProject('历史列表测试')
    const otherProjectId = await createProject('他项目')
    const first = await getOrCreateAgentConversation({ projectId, worldGroupId: null })
    await appendAgentEvent({ projectId, conversationId: first.id!, kind: 'message', role: 'user', content: '旧对话' })
    await appendAgentEvent({ projectId, conversationId: first.id!, kind: 'plan', content: '计划' })
    const second = await startNewAgentConversation({ projectId, worldGroupId: null, currentConversationId: first.id! })
    const worldA = await getOrCreateAgentConversation({ projectId, worldGroupId: 7 })
    await appendAgentEvent({ projectId, conversationId: worldA.id!, kind: 'message', role: 'user', content: 'A 世界' })
    // 再新建一条 A 世界对话，把 worldA 归档，验证世界隔离不受影响
    await startNewAgentConversation({ projectId, worldGroupId: 7, currentConversationId: worldA.id! })
    const otherProjectConversation = await getOrCreateAgentConversation({ projectId: otherProjectId, worldGroupId: null })
    await appendAgentEvent({ projectId: otherProjectId, conversationId: otherProjectConversation.id!, kind: 'message', role: 'user', content: '他项目' })

    const history = await listArchivedAgentConversations({ projectId, worldGroupId: null })
    // 只含本项目、本世界（worldGroupId=null）的归档对话：first；second/worldB/other 仍是 active，worldA 属于别的世界
    expect(history.map(row => row.id)).toEqual([first.id])
    expect(history[0].messageCount).toBe(1) // plan 不计数
    expect(history[0].title).toBe('旧对话')

    // 世界 A 的历史列表独立
    const worldAHistory = await listArchivedAgentConversations({ projectId, worldGroupId: 7 })
    expect(worldAHistory.map(row => row.id)).toEqual([worldA.id])

    // 再新建一轮后，second 也归档，列表按 updatedAt 倒序（second 较新排前）
    const third = await startNewAgentConversation({ projectId, worldGroupId: null, currentConversationId: second.id! })
    const historyTwo = await listArchivedAgentConversations({ projectId, worldGroupId: null })
    expect(historyTwo.map(row => row.id)).toEqual([second.id, first.id])
    expect((await getOrCreateAgentConversation({ projectId, worldGroupId: null })).id).toBe(third.id)
  })

  it('恢复历史对话会把当前 active 归档，跨项目恢复被拒绝', async () => {
    const projectId = await createProject('恢复测试')
    const otherProjectId = await createProject('他项目')
    const first = await getOrCreateAgentConversation({ projectId, worldGroupId: null })
    await appendAgentEvent({ projectId, conversationId: first.id!, kind: 'message', role: 'user', content: '第一段对话' })
    const second = await startNewAgentConversation({ projectId, worldGroupId: null, currentConversationId: first.id! })
    const otherConversation = await getOrCreateAgentConversation({ projectId: otherProjectId, worldGroupId: null })

    // 反例：跨项目恢复被拒绝
    await expect(reopenAgentConversation({ projectId, conversationId: otherConversation.id! }))
      .rejects.toThrow('历史对话不存在或不属于当前项目')

    const restored = await reopenAgentConversation({ projectId, conversationId: first.id! })
    expect(restored.id).toBe(first.id)
    expect((await db.agentConversations.get(first.id!))?.status).toBe('active')
    expect((await db.agentConversations.get(second.id!))?.status).toBe('archived')
    // getOrCreate 命中恢复的对话
    expect((await getOrCreateAgentConversation({ projectId, worldGroupId: null })).id).toBe(first.id)
    // 恢复后事件完整保留
    expect((await readAgentEvents(first.id!)).length).toBe(1)
  })

  it('删除历史对话会连同事件一起删除，active 对话与跨项目对话受保护', async () => {
    const projectId = await createProject('删除历史测试')
    const otherProjectId = await createProject('他项目')
    const first = await getOrCreateAgentConversation({ projectId, worldGroupId: null })
    await appendAgentEvent({ projectId, conversationId: first.id!, kind: 'message', role: 'user', content: '旧消息' })
    const second = await startNewAgentConversation({ projectId, worldGroupId: null, currentConversationId: first.id! })
    const otherConversation = await getOrCreateAgentConversation({ projectId: otherProjectId, worldGroupId: null })

    // 反例：跨项目删除被拒绝
    await expect(deleteAgentConversation({ projectId, conversationId: otherConversation.id! }))
      .rejects.toThrow('历史对话不存在或不属于当前项目')
    // 反例：active 对话不可删
    await expect(deleteAgentConversation({ projectId, conversationId: second.id! }))
      .rejects.toThrow('只能删除历史（已归档）对话')

    // 正例：删除归档对话后对话与事件一起消失
    await deleteAgentConversation({ projectId, conversationId: first.id! })
    expect(await db.agentConversations.get(first.id!)).toBeUndefined()
    expect((await readAgentEvents(first.id!)).length).toBe(0)
    // 当前对话不受影响
    expect((await db.agentConversations.get(second.id!))?.status).toBe('active')
    const history = await listArchivedAgentConversations({ projectId, worldGroupId: null })
    expect(history.map(row => row.id)).toEqual([])
  })
})
