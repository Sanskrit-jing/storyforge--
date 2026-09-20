import { db } from '../db/schema'
import type {
  AgentConversation,
  AgentEvent,
  AgentEventKind,
} from '../types'

export async function getOrCreateAgentConversation(input: {
  projectId: number
  worldGroupId: number | null
}): Promise<AgentConversation> {
  const rows = await db.agentConversations
    .where('projectId')
    .equals(input.projectId)
    .toArray()
  const current = rows
    .filter(row => row.status === 'active' && (row.worldGroupId ?? null) === input.worldGroupId)
    .sort((left, right) => right.updatedAt - left.updatedAt)[0]
  if (current) return current

  const now = Date.now()
  const row: AgentConversation = {
    projectId: input.projectId,
    worldGroupId: input.worldGroupId,
    title: '创作对话',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
  const id = await db.agentConversations.add(row) as number
  return { ...row, id }
}

export async function readAgentEvents(conversationId: number): Promise<AgentEvent[]> {
  return db.agentEvents
    .where('conversationId')
    .equals(conversationId)
    .sortBy('sequence')
}

export async function appendAgentEvent(input: {
  projectId: number
  conversationId: number
  kind: AgentEventKind
  role?: AgentEvent['role']
  content: string
  payload?: unknown
}): Promise<AgentEvent> {
  return db.transaction('rw', db.agentConversations, db.agentEvents, async () => {
    const conversation = await db.agentConversations.get(input.conversationId)
    if (!conversation || conversation.projectId !== input.projectId) {
      throw new Error('Agent 对话不存在或不属于当前项目。')
    }
    const existing = await db.agentEvents
      .where('conversationId')
      .equals(input.conversationId)
      .toArray()
    const sequence = existing.reduce((max, event) => Math.max(max, event.sequence), 0) + 1
    const createdAt = Date.now()
    const event: AgentEvent = {
      projectId: input.projectId,
      conversationId: input.conversationId,
      sequence,
      kind: input.kind,
      role: input.role,
      content: input.content,
      payload: JSON.stringify(input.payload ?? {}),
      createdAt,
    }
    const id = await db.agentEvents.add(event) as number
    await db.agentConversations.update(input.conversationId, {
      updatedAt: createdAt,
      ...(conversation.title === '创作对话' && input.role === 'user'
        ? { title: input.content.trim().slice(0, 40) || conversation.title }
        : {}),
    })
    return { ...event, id }
  })
}

export async function updateAgentEventCandidate(
  eventId: number,
  projectId: number,
  content: string,
): Promise<void> {
  const event = await db.agentEvents.get(eventId)
  if (!event || event.projectId !== projectId || event.kind !== 'candidate') {
    throw new Error('待更新的 Agent 候选不存在。')
  }
  await db.agentEvents.update(eventId, { content })
}

/** 新建对话：归档当前对话（历史仍在库中），创建一条空对话并成为 getOrCreate 的最新目标。 */
export async function startNewAgentConversation(input: {
  projectId: number
  worldGroupId: number | null
  currentConversationId: number
}): Promise<AgentConversation> {
  return db.transaction('rw', db.agentConversations, async () => {
    const current = await db.agentConversations.get(input.currentConversationId)
    if (current && current.projectId === input.projectId && current.status === 'active') {
      await db.agentConversations.update(input.currentConversationId, {
        status: 'archived',
        updatedAt: Date.now(),
      })
    }
    const now = Date.now()
    const row: AgentConversation = {
      projectId: input.projectId,
      worldGroupId: input.worldGroupId,
      title: '创作对话',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }
    const id = await db.agentConversations.add(row) as number
    return { ...row, id }
  })
}

/** 删除单条对话消息（仅 message，不碰 plan/task/candidate 等审计事件）。 */
export async function deleteAgentEvent(eventId: number, projectId: number): Promise<void> {
  const event = await db.agentEvents.get(eventId)
  if (!event || event.projectId !== projectId) {
    throw new Error('要删除的 Agent 消息不存在。')
  }
  if (event.kind !== 'message') {
    throw new Error('只能删除对话消息，不能删除计划、任务或候选事件。')
  }
  await db.agentEvents.delete(eventId)
}

/** 删除某对话中 sequence >= fromSequence 的全部事件（撤销/重写上一轮），返回删除数量。 */
export async function deleteAgentEventsFromSequence(input: {
  projectId: number
  conversationId: number
  fromSequence: number
}): Promise<number> {
  return db.transaction('rw', db.agentConversations, db.agentEvents, async () => {
    const conversation = await db.agentConversations.get(input.conversationId)
    if (!conversation || conversation.projectId !== input.projectId) {
      throw new Error('Agent 对话不存在或不属于当前项目。')
    }
    const rows = await db.agentEvents
      .where('conversationId')
      .equals(input.conversationId)
      .toArray()
    const targets = rows.filter(row => row.sequence >= input.fromSequence)
    await db.agentEvents.bulkDelete(targets.map(row => row.id!))
    return targets.length
  })
}

/** 列出某项目/世界下已归档的历史对话（按更新时间倒序），附带消息条数。 */
export async function listArchivedAgentConversations(input: {
  projectId: number
  worldGroupId: number | null
}): Promise<Array<AgentConversation & { messageCount: number }>> {
  const rows = await db.agentConversations
    .where('projectId')
    .equals(input.projectId)
    .toArray()
  const archived = rows
    .filter(row => row.status === 'archived' && (row.worldGroupId ?? null) === input.worldGroupId)
    .sort((left, right) => right.updatedAt - left.updatedAt || right.id! - left.id!)
  if (archived.length === 0) return []
  const events = await db.agentEvents
    .where('conversationId')
    .anyOf(archived.map(row => row.id!))
    .toArray()
  const counts = new Map<number, number>()
  events.forEach(event => {
    if (event.kind === 'message') {
      counts.set(event.conversationId, (counts.get(event.conversationId) ?? 0) + 1)
    }
  })
  return archived.map(row => ({ ...row, messageCount: counts.get(row.id!) ?? 0 }))
}

/** 删除一条已归档的历史对话及其全部事件（active 对话不可删，防止误删正在使用的对话）。 */
export async function deleteAgentConversation(input: {
  projectId: number
  conversationId: number
}): Promise<void> {
  await db.transaction('rw', db.agentConversations, db.agentEvents, async () => {
    const conversation = await db.agentConversations.get(input.conversationId)
    if (!conversation || conversation.projectId !== input.projectId) {
      throw new Error('历史对话不存在或不属于当前项目。')
    }
    if (conversation.status !== 'archived') {
      throw new Error('只能删除历史（已归档）对话，当前对话请先新建或切换。')
    }
    await db.agentEvents
      .where('conversationId')
      .equals(input.conversationId)
      .delete()
    await db.agentConversations.delete(input.conversationId)
  })
}

/** 恢复历史对话：归档当前 active 对话，把目标对话重新置为 active。 */
export async function reopenAgentConversation(input: {
  projectId: number
  conversationId: number
}): Promise<AgentConversation> {
  return db.transaction('rw', db.agentConversations, async () => {
    const target = await db.agentConversations.get(input.conversationId)
    if (!target || target.projectId !== input.projectId) {
      throw new Error('历史对话不存在或不属于当前项目。')
    }
    const rows = await db.agentConversations
      .where('projectId')
      .equals(input.projectId)
      .toArray()
    const siblingWorldGroupId = target.worldGroupId ?? null
    for (const row of rows) {
      if (row.status === 'active' && (row.worldGroupId ?? null) === siblingWorldGroupId) {
        await db.agentConversations.update(row.id!, { status: 'archived', updatedAt: Date.now() })
      }
    }
    await db.agentConversations.update(input.conversationId, {
      status: 'active',
      updatedAt: Date.now(),
    })
    return { ...target, status: 'active' as const }
  })
}
