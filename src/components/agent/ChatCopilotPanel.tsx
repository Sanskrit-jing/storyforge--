import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArchiveRestore,
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  History,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import type { Project } from '../../lib/types'
import { parseAgentEventPayload } from '../../lib/types'
import { useDialog } from '../shared/Dialog'
import { useMasterCopilot } from './useMasterCopilot'

interface Props {
  project: Project
  worldGroupId: number | null
  worldName: string
  onClose: () => void
}

const CONTEXT_PROFILE_LABELS = {
  lean: '精简',
  balanced: '均衡',
  full: '完整',
} as const

export default function ChatCopilotPanel({
  project,
  worldGroupId,
  worldName,
  onClose,
}: Props) {
  const copilot = useMasterCopilot({ project, worldGroupId })
  const dialog = useDialog()
  const [showDetails, setShowDetails] = useState(false)
  const [showHistoryList, setShowHistoryList] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)
  const viewingHistory = copilot.viewingHistoryId != null
  const visibleEvents = viewingHistory ? copilot.historyEvents : copilot.events
  const messages = visibleEvents.filter(event => event.kind === 'message')
  const lastUserMessage = useMemo(
    () => [...messages].reverse().find(message => message.role === 'user') ?? null,
    [messages],
  )
  const taskEvents = copilot.events.filter(event => event.kind === 'task')
  const latestTasks = useMemo(() => {
    const result = new Map<string, {
      taskId: string
      agentId: string
      status: string
      error?: string
    }>()
    taskEvents.forEach(event => {
      const payload = parseAgentEventPayload<{
        taskId?: string
        agentId?: string
        status?: string
        error?: string
      }>(event, {})
      if (payload.taskId) result.set(payload.taskId, {
        taskId: payload.taskId,
        agentId: payload.agentId ?? 'domain',
        status: payload.status ?? 'unknown',
        error: payload.error,
      })
    })
    return [...result.values()]
  }, [taskEvents])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [copilot.events.length, copilot.historyEvents.length, copilot.pendingCandidates.length])

  return (
    <aside
      aria-label="主 Agent 创作副驾"
      className="fixed inset-y-0 right-0 safe-area-pad-y z-30 flex h-full w-[min(28rem,calc(100vw-2rem))] shrink-0 flex-col border-l border-border bg-bg-surface shadow-xl lg:static lg:z-auto lg:w-[28rem] lg:shadow-none"
    >
      <header className="border-b border-border/70 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Bot className="h-4 w-4 text-accent" />
              主 Agent
              <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                单一对话入口
              </span>
            </div>
            <p className="mt-1 truncate text-[11px] text-text-muted" title={`${project.name} · ${worldName}`}>
              {project.name} · {worldName}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="历史对话"
              title="查看历史对话"
              disabled={copilot.loading || copilot.busy}
              onClick={() => {
                const next = !showHistoryList
                setShowHistoryList(next)
                if (next) {
                  copilot.exitHistoryView()
                  void copilot.openHistory()
                }
              }}
              className={`rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 ${
                showHistoryList ? 'bg-bg-hover text-text-primary' : ''
              }`}
            >
              <History className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="新建对话"
              title="新建对话（当前对话归档保留在本地）"
              disabled={copilot.loading || copilot.busy}
              onClick={() => {
                void dialog.confirm({
                  title: '新建对话',
                  message: '当前对话将归档并从面板移除，记录仍保留在本地。确定新建吗？',
                  confirmText: '新建对话',
                }).then(confirmed => {
                  if (confirmed) void copilot.startNewConversation()
                })
              }}
              className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="关闭主 Agent"
              onClick={onClose}
              className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-md border border-accent/20 bg-accent/5 p-2 text-[11px] leading-4 text-text-secondary">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
          你只需要描述目标。主 Agent 会在幕后调度领域 Agent；任何正式写入仍必须由你确认。
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {copilot.loading && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在恢复对话与候选…
          </div>
        )}

        {viewingHistory && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/5 px-2.5 py-1.5 text-[11px] text-text-secondary">
            <span className="truncate">正在查看历史对话（只读）</span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={copilot.busy}
                onClick={() => {
                  const targetId = copilot.viewingHistoryId
                  if (targetId == null) return
                  void dialog.confirm({
                    title: '恢复历史对话',
                    message: '恢复后它将成为当前对话，现在的对话会自动归档。确定恢复吗？',
                    confirmText: '恢复',
                  }).then(confirmed => {
                    if (confirmed) {
                      setShowHistoryList(false)
                      void copilot.restoreHistoryConversation(targetId)
                    }
                  })
                }}
                className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
              >
                <ArchiveRestore className="h-3 w-3" />
                恢复为当前对话
              </button>
              <button
                type="button"
                onClick={() => copilot.exitHistoryView()}
                className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              >
                <ArrowLeft className="h-3 w-3" />
                返回当前对话
              </button>
            </div>
          </div>
        )}

        {!viewingHistory && showHistoryList && (
          <section className="space-y-2" aria-label="历史对话列表">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-primary">历史对话</span>
              <button
                type="button"
                onClick={() => setShowHistoryList(false)}
                className="rounded px-1.5 py-0.5 text-[10px] text-text-muted hover:bg-bg-hover hover:text-text-primary"
              >
                收起
              </button>
            </div>
            {copilot.historyConversations.length === 0 && (
              <p className="rounded-lg border border-border/70 bg-bg-base px-3 py-2 text-xs text-text-muted">
                还没有历史对话。点右上角「新建对话」后，旧对话会自动保存在这里。
              </p>
            )}
            {copilot.historyConversations.map(item => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-2 rounded-lg border border-border/70 bg-bg-base p-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs text-text-primary" title={item.title}>
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-[10px] text-text-muted">
                    {item.messageCount} 条消息 · {new Date(item.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={copilot.busy}
                    onClick={() => { void copilot.viewHistoryConversation(item.id!) }}
                    className="rounded border border-border px-2 py-1 text-[10px] text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
                  >
                    查看
                  </button>
                  <button
                    type="button"
                    disabled={copilot.busy}
                    onClick={() => {
                      const targetId = item.id
                      void dialog.confirm({
                        title: '恢复历史对话',
                        message: '恢复后它将成为当前对话，现在的对话会自动归档。确定恢复吗？',
                        confirmText: '恢复',
                      }).then(confirmed => {
                        if (confirmed) {
                          setShowHistoryList(false)
                          void copilot.restoreHistoryConversation(targetId!)
                        }
                      })
                    }}
                    className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
                  >
                    <ArchiveRestore className="h-3 w-3" />
                    恢复
                  </button>
                  <button
                    type="button"
                    aria-label="删除这条历史对话"
                    title="删除这条历史对话（不可恢复）"
                    disabled={copilot.busy}
                    onClick={() => {
                      const targetId = item.id
                      void dialog.confirm({
                        title: '删除历史对话',
                        message: `将删除「${item.title}」及其全部 ${item.messageCount} 条消息，不可恢复。确定删除吗？`,
                        confirmText: '删除',
                      }).then(confirmed => {
                        if (confirmed) void copilot.deleteHistoryConversation(targetId!)
                      })
                    }}
                    className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-text-secondary hover:border-error/60 hover:bg-error/10 hover:text-error disabled:opacity-40"
                  >
                    <Trash2 className="h-3 w-3" />
                    删除
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {messages.map(message => (
          <div
            key={message.id}
            className={`group relative max-w-[92%] rounded-lg px-3 py-2 text-xs leading-5 ${
              message.role === 'user'
                ? 'ml-auto bg-accent text-white'
                : 'border border-border/70 bg-bg-base text-text-secondary'
            }`}
          >
            {message.content}
            {message.id != null && (
              <button
                type="button"
                aria-label="删除这条消息"
                title="删除这条消息"
                disabled={copilot.busy}
                onClick={() => { void copilot.deleteMessage(message.id!) }}
                className={`absolute top-1 flex h-5 w-5 items-center justify-center rounded opacity-30 transition-opacity hover:opacity-100 group-hover:opacity-100 ${
                  message.role === 'user'
                    ? '-left-6 bg-bg-surface text-text-muted hover:text-error'
                    : '-right-6 bg-bg-surface text-text-muted hover:text-error'
                } disabled:opacity-40`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}

        {!viewingHistory && (latestTasks.length > 0 || copilot.busy) && (
          <section className="rounded-lg border border-border/70 bg-bg-base">
            <button
              type="button"
              aria-expanded={showDetails}
              onClick={() => setShowDetails(value => !value)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            >
              <span className="flex items-center gap-2 text-xs font-medium text-text-primary">
                {copilot.busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />}
                后台执行
              </span>
              <span className="flex items-center gap-1 text-[10px] text-text-muted">
                {latestTasks.filter(task => task.status === 'completed').length}/{latestTasks.length || '…'}
                {showDetails
                  ? <ChevronDown className="h-3.5 w-3.5" />
                  : <ChevronRight className="h-3.5 w-3.5" />}
              </span>
            </button>
            {showDetails && (
              <div className="space-y-1 border-t border-border/60 px-3 py-2">
                {latestTasks.length === 0 && (
                  <p className="text-[10px] text-text-muted">主 Agent 正在理解目标并安排任务。</p>
                )}
                {latestTasks.map(task => (
                  <div key={task.taskId} className="flex items-start justify-between gap-2 text-[10px]">
                    <span className="text-text-secondary">{task.agentId}</span>
                    <span className={
                      task.status === 'completed'
                        ? 'text-success'
                        : task.status === 'failed'
                          ? 'text-error'
                          : 'text-accent'
                    }>
                      {task.status === 'completed' ? '已完成' : task.status === 'failed' ? task.error || '失败' : '执行中'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {!viewingHistory && copilot.pendingCandidates.map(candidate => (
          <section
            key={candidate.event.id}
            className="rounded-lg border border-accent/30 bg-bg-base p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-text-primary">
                待确认 · {candidate.payload.label}
              </span>
              <span
                className="max-w-[45%] truncate text-[10px] text-text-muted"
                title={candidate.payload.contextSources.join('、')}
              >
                {candidate.payload.contextEvidence
                  ? `${CONTEXT_PROFILE_LABELS[candidate.payload.contextEvidence.profile]} · ≈${candidate.payload.contextEvidence.estimatedInputTokens.toLocaleString()} tokens`
                  : `${candidate.payload.contextSources.length} 个输入来源`}
              </span>
            </div>
            <textarea
              aria-label={`${candidate.payload.label}候选内容`}
              value={candidate.event.content}
              disabled={copilot.busy}
              onChange={event => {
                void copilot.updateCandidate(candidate.event.id!, event.target.value)
              }}
              className={`h-64 w-full resize-y rounded border border-border bg-bg-surface p-2 text-[11px] leading-5 text-text-primary outline-none focus:border-accent disabled:opacity-60 ${
                candidate.payload.agentId === 'world-origin' ? '' : 'font-mono'
              }`}
            />
            <p className="mt-1 text-[10px] text-text-muted">
              这是领域 Agent 的真实输出。刷新后仍会保留；只有采纳才会进入项目正式数据。
            </p>
            {candidate.payload.contextEvidence && (
              <details className="mt-2 rounded border border-border/60 bg-bg-surface px-2 py-1.5 text-[10px] text-text-muted">
                <summary className="cursor-pointer text-text-secondary">
                  查看本次实际输入证据 · {candidate.payload.contextEvidence.included.length} 个来源
                </summary>
                <div className="mt-2 space-y-1 break-words">
                  <p>
                    上下文估算 {candidate.payload.contextEvidence.estimatedInputTokens.toLocaleString()} /
                    {' '}{candidate.payload.contextEvidence.inputBudgetTokens.toLocaleString()} tokens
                  </p>
                  <p>已纳入：{candidate.payload.contextEvidence.included.join('、') || '无'}</p>
                  {candidate.payload.contextEvidence.trimmed.length > 0 && (
                    <p className="text-warning">整段裁剪：{candidate.payload.contextEvidence.trimmed.join('、')}</p>
                  )}
                  {candidate.payload.contextEvidence.omitted.length > 0 && (
                    <p>无数据/未启用：{candidate.payload.contextEvidence.omitted.join('、')}</p>
                  )}
                </div>
              </details>
            )}
            {candidate.payload.teamBudgetEvidence && (
              <p className="mt-2 rounded border border-border/60 bg-bg-surface px-2 py-1.5 text-[10px] text-text-muted">
                本轮团队预算约 {candidate.payload.teamBudgetEvidence.usedTokens.toLocaleString()} /
                {' '}{candidate.payload.teamBudgetEvidence.maxTokens.toLocaleString()} tokens
                {' · '}{candidate.payload.teamBudgetEvidence.calls}/{candidate.payload.teamBudgetEvidence.maxCalls} 次调用
                {' · '}Canon 打回 {candidate.payload.teamBudgetEvidence.canonRetries}/{candidate.payload.teamBudgetEvidence.maxCanonRetries}
              </p>
            )}
            {(candidate.payload.dependsOnTaskIds?.length ?? 0) > 0 && (
              <p className="mt-1 text-[10px] text-warning">
                采纳前需先采纳上游任务：{candidate.payload.dependsOnTaskIds!.join('、')}
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                disabled={copilot.busy}
                onClick={() => { void copilot.rejectCandidate(candidate) }}
                className="flex items-center gap-1 rounded px-2.5 py-1.5 text-xs text-text-muted hover:bg-bg-hover hover:text-text-primary disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                拒绝
              </button>
              <button
                type="button"
                disabled={copilot.busy}
                onClick={() => { void copilot.adoptCandidate(candidate) }}
                className="flex items-center gap-1 rounded bg-accent px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-50"
              >
                {copilot.busy
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Check className="h-3.5 w-3.5" />}
                采纳
              </button>
            </div>
          </section>
        ))}
        {!viewingHistory && lastUserMessage && (
          <div className="flex items-center justify-center gap-2 pt-1" aria-label="上一轮操作">
            <button
              type="button"
              disabled={copilot.loading || copilot.busy || copilot.pendingCandidates.length > 0}
              onClick={() => { void copilot.undoLastRound() }}
              title="删除最后一次请求及其全部输出（含计划、任务、候选）"
              className="flex items-center gap-1.5 rounded-full border border-border bg-bg-surface px-3 py-1.5 text-xs text-text-secondary hover:border-text-muted hover:text-text-primary disabled:opacity-40"
            >
              <Undo2 className="h-3.5 w-3.5" />
              撤销上一轮
            </button>
            <button
              type="button"
              disabled={copilot.loading || copilot.busy || copilot.pendingCandidates.length > 0}
              onClick={() => { void copilot.rewriteLast() }}
              title="删除最后一次请求及其输出，并用同样的请求重新执行"
              className="flex items-center gap-1.5 rounded-full border border-border bg-bg-surface px-3 py-1.5 text-xs text-text-secondary hover:border-text-muted hover:text-text-primary disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              重写上一轮
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-border/70 p-3"
        onSubmit={event => {
          event.preventDefault()
          void copilot.submit()
        }}
      >
        <textarea
          aria-label="告诉主 Agent 你的目标"
          value={copilot.authorRequest}
          disabled={copilot.loading || copilot.busy || copilot.pendingCandidates.length > 0 || viewingHistory}
          maxLength={2000}
          rows={4}
          onChange={event => copilot.setAuthorRequest(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void copilot.submit()
            }
          }}
          placeholder={viewingHistory
            ? '正在查看历史对话，返回当前对话后可继续输入'
            : copilot.pendingCandidates.length
              ? '请先处理当前候选，再继续对话'
              : '例如：建立宋风世界，设计守灯人主角，规划三卷大纲，再写第一章正文…'}
          className="w-full resize-none rounded-md border border-border bg-bg-base px-3 py-2 text-xs leading-5 text-text-primary outline-none focus:border-accent disabled:opacity-60"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[10px] text-text-muted">
            Enter 发送 · 记录自动保存在本地 · 撤销/重写按钮在对话末尾
          </span>
          {copilot.busy ? (
            <button
              type="button"
              onClick={copilot.stop}
              className="flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover"
            >
              <Square className="h-3.5 w-3.5" />
              停止
            </button>
          ) : (
            <button
              type="submit"
              disabled={
                copilot.loading
                || !copilot.authorRequest.trim()
                || copilot.pendingCandidates.length > 0
                || viewingHistory
              }
              className="flex items-center gap-1 rounded bg-accent px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
              交给主 Agent
            </button>
          )}
        </div>
      </form>
    </aside>
  )
}
