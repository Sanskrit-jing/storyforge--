import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  updateAgentEventCandidate,
} from '../../lib/agent/conversations'
import {
  adoptMasterCandidate,
  createMasterAgentPlan,
  executeMasterAgentPlan,
  type ExecutedMasterCandidate,
  type MasterCandidatePayload,
} from '../../lib/agent/orchestrator'
import type { AgentConversation, AgentEvent, Project } from '../../lib/types'
import { parseAgentEventPayload } from '../../lib/types'
import { AgentTeamBudgetTracker } from '../../lib/agent/team-budget'
import { useAIConfigStore } from '../../stores/ai-config'

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return '操作失败，请稍后重试。'
}

export interface PendingMasterCandidate {
  event: AgentEvent
  payload: MasterCandidatePayload
}

export function useMasterCopilot(input: {
  project: Project
  worldGroupId: number | null
}) {
  const { project, worldGroupId } = input
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [authorRequest, setAuthorRequest] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [historyConversations, setHistoryConversations] = useState<
    Array<AgentConversation & { messageCount: number }>
  >([])
  const [viewingHistoryId, setViewingHistoryId] = useState<number | null>(null)
  const [historyEvents, setHistoryEvents] = useState<AgentEvent[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const runtimeCandidates = useRef(new Map<number, ExecutedMasterCandidate>())
  const scopeKey = `${project.id}:${worldGroupId ?? 'global'}`
  // 跟踪最新作用域：生成流程跨多个 await，期间用户可能已切换项目/世界组。
  const scopeKeyRef = useRef(scopeKey)

  useEffect(() => {
    scopeKeyRef.current = scopeKey
  }, [scopeKey])

  const reload = useCallback(async (id: number) => {
    setEvents(await readAgentEvents(id))
  }, [])

  useEffect(() => {
    let active = true
    abortRef.current?.abort()
    runtimeCandidates.current.clear()
    setBusy(false)
    setLoading(true)
    void (async () => {
      const conversation = await getOrCreateAgentConversation({
        projectId: project.id!,
        worldGroupId,
      })
      if (!active) return
      setConversationId(conversation.id!)
      let rows = await readAgentEvents(conversation.id!)
      if (!rows.length) {
        await appendAgentEvent({
          projectId: project.id!,
          conversationId: conversation.id!,
          kind: 'message',
          role: 'assistant',
          content: '直接告诉我你想完成什么。我会理解目标、调用需要的领域 Agent，并把结果统一交给你确认。',
        })
        rows = await readAgentEvents(conversation.id!)
      }
      if (active) {
        setEvents(rows)
        setLoading(false)
      }
    })().catch(error => {
      if (active) {
        console.error('[master-copilot] load failed', error)
        setLoading(false)
      }
    })
    return () => {
      active = false
      abortRef.current?.abort()
    }
  }, [project.id, scopeKey, worldGroupId])

  const pendingCandidates = useMemo(() => {
    const resolved = new Set<number>()
    events.filter(event => event.kind === 'confirmation').forEach(event => {
      const payload = parseAgentEventPayload<{ candidateEventId?: number }>(event, {})
      if (typeof payload.candidateEventId === 'number') resolved.add(payload.candidateEventId)
    })
    return events
      .filter(event => event.kind === 'candidate' && event.id != null && !resolved.has(event.id))
      .map(event => ({
        event,
        payload: parseAgentEventPayload<MasterCandidatePayload>(event, {
          version: 1,
          taskId: '',
          agentId: 'character',
          label: '候选',
          contextSources: [],
          baseSnapshot: {},
        }),
      }))
  }, [events])

  const runRequest = useCallback(async (request: string) => {
    if (!request || busy || conversationId == null) return
    if (pendingCandidates.length) return
    const requestScopeKey = scopeKey
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    setBusy(true)
    try {
      await appendAgentEvent({
        projectId: project.id!,
        conversationId,
        kind: 'message',
        role: 'user',
        content: request,
      })
      await reload(conversationId)
      const teamBudget = new AgentTeamBudgetTracker(
        useAIConfigStore.getState().agentTeamBudgetProfile,
      )
      const plan = await createMasterAgentPlan({
        projectId: project.id!,
        worldGroupId,
        request,
        budget: teamBudget,
        signal: controller.signal,
      })
      await appendAgentEvent({
        projectId: project.id!,
        conversationId,
        kind: 'plan',
        content: plan.summary,
        payload: plan,
      })
      await appendAgentEvent({
        projectId: project.id!,
        conversationId,
        kind: 'message',
        role: 'assistant',
        content: `${plan.summary} 我会在后台完成 ${plan.tasks.length} 个领域任务。`,
      })
      await reload(conversationId)

      let taskQueue = Promise.resolve()
      const candidates = await executeMasterAgentPlan({
        projectId: project.id!,
        worldGroupId,
        plan,
        budget: teamBudget,
        signal: controller.signal,
        onTask: (task, status, error) => {
          taskQueue = taskQueue.then(async () => {
            await appendAgentEvent({
              projectId: project.id!,
              conversationId,
              kind: 'task',
              content: error || task.instruction,
              payload: { taskId: task.id, agentId: task.agentId, status, error },
            })
          })
        },
      })
      await taskQueue
      for (const candidate of candidates) {
        const event = await appendAgentEvent({
          projectId: project.id!,
          conversationId,
          kind: 'candidate',
          content: candidate.draft,
          payload: candidate.payload,
        })
        runtimeCandidates.current.set(event.id!, candidate)
      }
      await appendAgentEvent({
        projectId: project.id!,
        conversationId,
        kind: 'message',
        role: 'assistant',
        content: [
          candidates.length === plan.tasks.length
            ? `后台领域 Agent 已完成，生成了 ${candidates.length} 份候选。请检查、编辑并决定是否采纳。`
            : `后台领域 Agent 部分完成，生成了 ${candidates.length} / ${plan.tasks.length} 份候选（失败任务见上方任务事件）。请检查、编辑并决定是否采纳。`,
          `本轮团队约使用 ${teamBudget.snapshot().usedTokens.toLocaleString()} / `
          + `${teamBudget.snapshot().maxTokens.toLocaleString()} tokens，`
          + `${teamBudget.snapshot().calls} 次调用，`
          + `Canon 受控打回 ${teamBudget.snapshot().canonRetries} 次。`,
        ].join(' '),
      })
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = errorMessage(error)
        await appendAgentEvent({
          projectId: project.id!,
          conversationId,
          kind: 'error',
          content: message,
        })
        await appendAgentEvent({
          projectId: project.id!,
          conversationId,
          kind: 'message',
          role: 'assistant',
          content: `本轮没有完成：${message}`,
        })
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setBusy(false)
      // 作用域已变（切项目/切世界组）时不再回写旧会话事件，避免跨项目污染当前面板。
      if (scopeKeyRef.current === requestScopeKey) {
        await reload(conversationId)
      }
    }
  }, [
    busy,
    conversationId,
    pendingCandidates.length,
    project.id,
    reload,
    scopeKey,
    worldGroupId,
  ])

  const submit = useCallback(async () => {
    const request = authorRequest.trim()
    if (!request || busy || conversationId == null) return
    if (pendingCandidates.length) return
    setAuthorRequest('')
    await runRequest(request)
  }, [authorRequest, busy, conversationId, pendingCandidates.length, runRequest])

  /** 新建对话：归档当前对话，打开一条空对话。 */
  const startNewConversation = useCallback(async () => {
    if (busy || loading || conversationId == null) return
    abortRef.current?.abort()
    runtimeCandidates.current.clear()
    setBusy(false)
    try {
      const conversation = await startNewAgentConversation({
        projectId: project.id!,
        worldGroupId,
        currentConversationId: conversationId,
      })
      setConversationId(conversation.id!)
      setAuthorRequest('')
      await appendAgentEvent({
        projectId: project.id!,
        conversationId: conversation.id!,
        kind: 'message',
        role: 'assistant',
        content: '已开始新对话。直接告诉我你想完成什么。我会理解目标、调用需要的领域 Agent，并把结果统一交给你确认。',
      })
      setEvents(await readAgentEvents(conversation.id!))
    } catch (error) {
      console.error('[master-copilot] start new conversation failed', error)
    }
  }, [busy, conversationId, loading, project.id, worldGroupId])

  /** 删除单条消息（仅对话消息，审计事件不开放删除；同时作用于当前对话与历史浏览）。 */
  const deleteMessage = useCallback(async (eventId: number) => {
    if (busy || eventId == null) return
    try {
      await deleteAgentEvent(eventId, project.id!)
      setEvents(current => current.filter(event => event.id !== eventId))
      setHistoryEvents(current => current.filter(event => event.id !== eventId))
    } catch (error) {
      console.error('[master-copilot] delete message failed', error)
    }
  }, [busy, project.id])

  /** 撤销：找到最后一条用户消息，删除它及其之后的全部事件。 */
  const undoLastRound = useCallback(async () => {
    if (busy || conversationId == null || pendingCandidates.length) return
    const lastUser = [...events].reverse()
      .find(event => event.kind === 'message' && event.role === 'user')
    if (!lastUser) return
    try {
      await deleteAgentEventsFromSequence({
        projectId: project.id!,
        conversationId,
        fromSequence: lastUser.sequence,
      })
      setEvents(await readAgentEvents(conversationId))
    } catch (error) {
      console.error('[master-copilot] undo failed', error)
    }
  }, [busy, conversationId, events, pendingCandidates.length, project.id])

  /** 重写：删除最后一轮（含用户消息），用同样的请求重新执行完整流程。 */
  const rewriteLast = useCallback(async () => {
    if (busy || conversationId == null || pendingCandidates.length) return
    const lastUser = [...events].reverse()
      .find(event => event.kind === 'message' && event.role === 'user')
    if (!lastUser) return
    try {
      await deleteAgentEventsFromSequence({
        projectId: project.id!,
        conversationId,
        fromSequence: lastUser.sequence,
      })
      setEvents(await readAgentEvents(conversationId))
      await runRequest(lastUser.content)
    } catch (error) {
      console.error('[master-copilot] rewrite failed', error)
    }
  }, [busy, conversationId, events, pendingCandidates.length, project.id, runRequest])

  /** 打开历史列表：拉取归档对话。 */
  const openHistory = useCallback(async () => {
    try {
      setHistoryConversations(await listArchivedAgentConversations({
        projectId: project.id!,
        worldGroupId,
      }))
    } catch (error) {
      console.error('[master-copilot] list history failed', error)
    }
  }, [project.id, worldGroupId])

  /** 只读浏览一条历史对话。 */
  const viewHistoryConversation = useCallback(async (targetId: number) => {
    if (busy || targetId == null) return
    try {
      setHistoryEvents(await readAgentEvents(targetId))
      setViewingHistoryId(targetId)
    } catch (error) {
      console.error('[master-copilot] view history failed', error)
    }
  }, [busy])

  /** 退出历史浏览，回到当前对话。 */
  const exitHistoryView = useCallback(() => {
    setViewingHistoryId(null)
    setHistoryEvents([])
  }, [])

  /** 删除一条历史对话及其全部事件；若正浏览该对话则同时退出浏览。 */
  const deleteHistoryConversation = useCallback(async (targetId: number) => {
    if (busy || targetId == null) return
    try {
      await deleteAgentConversation({ projectId: project.id!, conversationId: targetId })
      if (viewingHistoryId === targetId) {
        setViewingHistoryId(null)
        setHistoryEvents([])
      }
      await openHistory()
    } catch (error) {
      console.error('[master-copilot] delete history failed', error)
    }
  }, [busy, openHistory, project.id, viewingHistoryId])

  /** 恢复历史对话为当前对话（当前 active 对话自动归档）。 */
  const restoreHistoryConversation = useCallback(async (targetId: number) => {
    if (busy || targetId == null || loading) return
    try {
      const conversation = await reopenAgentConversation({
        projectId: project.id!,
        conversationId: targetId,
      })
      setConversationId(conversation.id!)
      setViewingHistoryId(null)
      setHistoryEvents([])
      setEvents(await readAgentEvents(conversation.id!))
      await openHistory()
    } catch (error) {
      console.error('[master-copilot] restore history failed', error)
    }
  }, [busy, loading, openHistory, project.id])

  const updateCandidate = useCallback(async (eventId: number, draft: string) => {
    await updateAgentEventCandidate(eventId, project.id!, draft)
    setEvents(current => current.map(event => event.id === eventId ? { ...event, content: draft } : event))
  }, [project.id])

  const resolveCandidate = useCallback(async (
    candidate: PendingMasterCandidate,
    decision: 'adopted' | 'rejected',
  ) => {
    if (busy || conversationId == null || candidate.event.id == null) return
    setBusy(true)
    try {
      let message = '候选已拒绝，没有写入项目。'
      if (decision === 'adopted') {
        message = await adoptMasterCandidate({
          projectId: project.id!,
          worldGroupId,
          event: candidate.event,
          payload: candidate.payload,
          draft: candidate.event.content,
          runtime: runtimeCandidates.current.get(candidate.event.id),
        })
      }
      await appendAgentEvent({
        projectId: project.id!,
        conversationId,
        kind: 'confirmation',
        content: message,
        payload: { candidateEventId: candidate.event.id, decision },
      })
      await appendAgentEvent({
        projectId: project.id!,
        conversationId,
        kind: 'message',
        role: 'assistant',
        content: message,
      })
      runtimeCandidates.current.delete(candidate.event.id)
    } catch (error) {
      await appendAgentEvent({
        projectId: project.id!,
        conversationId,
        kind: 'message',
        role: 'assistant',
        content: errorMessage(error),
      })
    } finally {
      setBusy(false)
      await reload(conversationId)
    }
  }, [busy, conversationId, project.id, reload, worldGroupId])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  return {
    authorRequest,
    setAuthorRequest,
    events,
    pendingCandidates,
    busy,
    loading,
    submit,
    stop,
    updateCandidate,
    adoptCandidate: (candidate: PendingMasterCandidate) => resolveCandidate(candidate, 'adopted'),
    rejectCandidate: (candidate: PendingMasterCandidate) => resolveCandidate(candidate, 'rejected'),
    startNewConversation,
    deleteMessage,
    undoLastRound,
    rewriteLast,
    historyConversations,
    openHistory,
    viewingHistoryId,
    historyEvents,
    viewHistoryConversation,
    exitHistoryView,
    restoreHistoryConversation,
    deleteHistoryConversation,
  }
}
