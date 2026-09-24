import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, ListChecks, RotateCcw, Search, ShieldCheck, Sparkles, SquareDashed,
} from 'lucide-react'
import { useAIConfigStore } from '../../stores/ai-config'
import { useBackupStore } from '../../stores/backup'
import { useChapterStore } from '../../stores/chapter'
import { useCharacterStore } from '../../stores/character'
import { useCharacterRelationStore } from '../../stores/character-relation'
import { useCodexStore } from '../../stores/codex'
import { useCultivationStore } from '../../stores/cultivation'
import { useDetailedOutlineStore } from '../../stores/detailed-outline'
import { useEmotionBeatStore } from '../../stores/emotion-beat'
import { useForeshadowStore } from '../../stores/foreshadow'
import { useLocationStore } from '../../stores/location'
import { useNoteStore } from '../../stores/note'
import { useOutlineStore } from '../../stores/outline'
import { useStoryArcStore } from '../../stores/story-arc'
import { useStorylineProgressStore } from '../../stores/storyline-progress'
import { useStateCardStore } from '../../stores/state-card'
import { useUserStyleStore } from '../../stores/user-style'
import { useWorldNodeStore } from '../../stores/world-node'
import { useWorldviewStore } from '../../stores/worldview'
import { useCreativeRulesStore } from '../../stores/project-singletons'
import {
  buildGlobalReplacePreview,
  executeGlobalReplace,
  undoGlobalReplace,
  type GlobalReplaceOptions,
  type GlobalReplacePreview,
  type GlobalReplaceSelection,
  type GlobalReplaceUndoPatch,
} from '../../lib/editor/global-find-replace'
import {
  executeSemanticSyncSuggestions,
  runSemanticSync,
  type SemanticSyncSuggestion,
} from '../../lib/editor/semantic-sync'
import { useDialog } from '../shared/Dialog'
import { useToast } from '../shared/Toast'

interface Props {
  projectId: number
  /** 点击章节类命中时跳转到章节列表（可选） */
  onOpenChapter?: (outlineNodeId: number) => void
  /** 从改名联动等入口预填的查找词 */
  initialQuery?: string
  /** 从改名联动等入口预填的替换词 */
  initialReplacement?: string
}

interface ReplaceResult {
  changedRecords: number
  totalReplacements: number
  snapshotId: number
}

function formatTime(ts: number): string {
  const date = new Date(ts)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function recordKeyOf(target: string, id: number): string {
  return `${target}#${id}`
}

export default function GlobalReplacePanel({ projectId, onOpenChapter, initialQuery, initialReplacement }: Props) {
  const dialog = useDialog()
  const toast = useToast()
  const createSnapshot = useBackupStore(state => state.createSnapshot)
  const aiConfig = useAIConfigStore(state => state.config)

  const [activeTab, setActiveTab] = useState<'exact' | 'ai'>('exact')
  const [query, setQuery] = useState(initialQuery ?? '')
  const [replacement, setReplacement] = useState(initialReplacement ?? '')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [protectLongerTerms, setProtectLongerTerms] = useState(true)
  const [preview, setPreview] = useState<GlobalReplacePreview | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<ReplaceResult | null>(null)
  const [undoPatch, setUndoPatch] = useState<GlobalReplaceUndoPatch | null>(null)
  const [busy, setBusy] = useState(false)

  // AI 语义同步
  const [changeSummary, setChangeSummary] = useState('')
  const [focusKeyword, setFocusKeyword] = useState('')
  const [aiSuggestions, setAiSuggestions] = useState<SemanticSyncSuggestion[]>([])
  const [aiSelectedKeys, setAiSelectedKeys] = useState<Set<string>>(new Set())
  const [aiRunStats, setAiRunStats] = useState<{ scannedFields: number; truncated: boolean } | null>(null)
  const [aiUndoPatch, setAiUndoPatch] = useState<GlobalReplaceUndoPatch | null>(null)
  const [aiBusy, setAiBusy] = useState(false)

  // 入口预填变化时（如改名联动跳转）同步查找/替换词
  useEffect(() => {
    if (initialQuery != null) {
      setQuery(initialQuery)
      setPreview(null)
      setSelectedKeys(new Set())
    }
  }, [initialQuery])
  useEffect(() => {
    if (initialReplacement != null) setReplacement(initialReplacement)
  }, [initialReplacement])

  const options: GlobalReplaceOptions = useMemo(() => ({
    query,
    replacement,
    caseSensitive,
    wholeWord,
    useRegex,
    protectLongerTerms,
  }), [query, replacement, caseSensitive, wholeWord, useRegex, protectLongerTerms])

  const selected: GlobalReplaceSelection[] = useMemo(() => {
    if (!preview) return []
    const keys = selectedKeys
    const picks: GlobalReplaceSelection[] = []
    for (const group of preview.groups) {
      for (const record of group.records) {
        if (keys.has(recordKeyOf(group.target, record.id))) {
          picks.push({ target: group.target, id: record.id })
        }
      }
    }
    return picks
  }, [preview, selectedKeys])

  const selectedCount = selected.length
  const selectedMatches = useMemo(() => {
    if (!preview) return 0
    return selected.reduce((sum, pick) => {
      const group = preview.groups.find(item => item.target === pick.target)
      const record = group?.records.find(item => item.id === pick.id)
      return sum + (record?.count ?? 0)
    }, 0)
  }, [preview, selected])

  /** 执行/撤销后刷新所有受影响模块的 store，保证打开过的面板立刻反映新文本 */
  const refreshStores = async () => {
    const jobs: Promise<unknown>[] = [
      useWorldviewStore.getState().loadAll(projectId),
      useCharacterStore.getState().loadAll(projectId),
      useCharacterRelationStore.getState().loadAll(projectId),
      useOutlineStore.getState().loadAll(projectId),
      useChapterStore.getState().loadAll(projectId),
      useDetailedOutlineStore.getState().loadAll(projectId),
      useForeshadowStore.getState().loadAll(projectId),
      useStoryArcStore.getState().loadAll(projectId),
      useStorylineProgressStore.getState().loadAll(projectId),
      useCodexStore.getState().loadExisting(projectId),
      useLocationStore.getState().loadAll(projectId),
      useCultivationStore.getState().loadAll(projectId),
      useStateCardStore.getState().loadAll(projectId),
      useEmotionBeatStore.getState().loadAll(projectId),
      useCreativeRulesStore.getState().loadAll(projectId),
      useWorldNodeStore.getState().loadNodes(projectId),
      useNoteStore.getState().loadAll(projectId),
      useUserStyleStore.getState().loadProfile(projectId),
    ]
    const results = await Promise.allSettled(jobs)
    results.forEach((entry, index) => {
      if (entry.status === 'rejected') {
        console.error(`[GlobalReplace] store 刷新失败 (#${index}):`, entry.reason)
      }
    })
  }

  const runSearch = async () => {
    if (!query.trim()) {
      toast.error('请先输入查找内容')
      return
    }
    setBusy(true)
    try {
      const next = await buildGlobalReplacePreview(projectId, options)
      setPreview(next)
      setSelectedKeys(new Set(
        next.groups.flatMap(group => group.records.map(record => recordKeyOf(group.target, record.id))),
      ))
      setResult(null)
      setUndoPatch(null)
      if (!next.blockers.length && !next.totalRecords) {
        toast.info('没有命中')
      }
    } catch (error) {
      toast.error(`搜索失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const toggleRecord = (key: string) => {
    setSelectedKeys(previous => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAll = (checked: boolean) => {
    if (!preview) return
    setSelectedKeys(checked
      ? new Set(preview.groups.flatMap(group => group.records.map(record => recordKeyOf(group.target, record.id))))
      : new Set())
  }

  const applyReplace = async () => {
    if (!preview || preview.blockers.length) return
    if (!selectedCount) {
      toast.error('请先勾选要替换的记录')
      return
    }
    const ok = await dialog.confirm({
      title: '确认全局替换？',
      message: [
        `将在 ${selectedCount} 条记录中替换 ${selectedMatches} 处「${query}」→「${replacement || '（删除）'}」。`,
        '覆盖世界观、角色、大纲、章节正文等全部登记模块。',
        '执行前会创建项目快照；本次会话内可一键原子撤销。',
      ].join('\n'),
      confirmText: '创建快照并替换',
      cancelText: '取消',
      tone: 'danger',
    })
    if (!ok) return

    setBusy(true)
    try {
      const executed = await executeGlobalReplace({
        projectId,
        expectedBaseline: preview.baseline,
        selected,
        createSnapshot,
        label: `全局替换「${query}」前快照 ${formatTime(Date.now())}`,
      })
      setResult({
        changedRecords: executed.changedRecords,
        totalReplacements: executed.totalReplacements,
        snapshotId: executed.snapshotId,
      })
      setUndoPatch(executed.undoPatch)
      await refreshStores()
      const next = await buildGlobalReplacePreview(projectId, options)
      setPreview(next)
      setSelectedKeys(new Set(
        next.groups.flatMap(group => group.records.map(record => recordKeyOf(group.target, record.id))),
      ))
      toast.success(`已替换 ${executed.totalReplacements} 处，涉及 ${executed.changedRecords} 条记录，并创建快照`)
    } catch (error) {
      toast.error(`替换失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const handleUndo = async () => {
    if (!undoPatch) return
    const ok = await dialog.confirm({
      title: '撤销上次全局替换？',
      message: [
        `将把 ${undoPatch.changes.length} 条记录恢复到替换前内容（${undoPatch.query} ↔ ${undoPatch.replacement || '（删除）'}）。`,
        '只有相关记录都未被再次修改时才会执行；否则请使用版本历史中的快照。',
      ].join('\n'),
      confirmText: '原子撤销',
      cancelText: '取消',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    try {
      await undoGlobalReplace(undoPatch)
      setUndoPatch(null)
      setResult(null)
      await refreshStores()
      if (preview) {
        const next = await buildGlobalReplacePreview(projectId, options)
        setPreview(next)
        setSelectedKeys(new Set(
          next.groups.flatMap(group => group.records.map(record => recordKeyOf(group.target, record.id))),
        ))
      }
      toast.success('已撤销上次全局替换')
    } catch (error) {
      toast.error(`撤销失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  // ─────────────────────────────────────────────────────────────
  // AI 语义同步
  // ─────────────────────────────────────────────────────────────

  const aiSelectedCount = aiSelectedKeys.size

  const toggleAiRecord = (key: string) => {
    setAiSelectedKeys(previous => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAiAll = (checked: boolean) => {
    setAiSelectedKeys(checked ? new Set(aiSuggestions.map(s => s.key)) : new Set())
  }

  const runSync = async () => {
    if (!changeSummary.trim()) {
      toast.error('请先描述变更内容')
      return
    }
    setAiBusy(true)
    try {
      const run = await runSemanticSync({
        projectId,
        request: { changeSummary, focusKeyword },
        aiConfig,
      })
      setAiSuggestions(run.suggestions)
      setAiSelectedKeys(new Set(run.suggestions.map(s => s.key)))
      setAiRunStats({ scannedFields: run.scannedFields, truncated: run.truncated })
      setAiUndoPatch(null)
      if (!run.suggestions.length) {
        toast.info('AI 没有发现需要联动改写的内容')
      }
    } catch (error) {
      toast.error(`语义同步失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setAiBusy(false)
    }
  }

  const applySuggestions = async () => {
    const picked = aiSuggestions.filter(s => aiSelectedKeys.has(s.key))
    if (!picked.length) {
      toast.error('请先勾选要应用的同步建议')
      return
    }
    const ok = await dialog.confirm({
      title: '应用 AI 语义同步建议？',
      message: [
        `将按 AI 建议改写 ${picked.length} 条字段文本。`,
        '建议由 AI 生成，请在右侧确认预览内容符合预期。',
        '执行前会创建项目快照；本次会话内可一键原子撤销。',
      ].join('\n'),
      confirmText: '创建快照并应用',
      cancelText: '取消',
      tone: 'danger',
    })
    if (!ok) return
    setAiBusy(true)
    try {
      const executed = await executeSemanticSyncSuggestions({
        projectId,
        suggestions: picked,
        createSnapshot,
        label: `AI 语义同步前快照 ${formatTime(Date.now())}`,
      })
      setAiUndoPatch(executed.undoPatch)
      setAiSuggestions(previous => previous.filter(s => !aiSelectedKeys.has(s.key)))
      setAiSelectedKeys(new Set())
      await refreshStores()
      toast.success(`已更新 ${executed.changedRecords} 条记录，并创建快照`)
    } catch (error) {
      toast.error(`应用建议失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setAiBusy(false)
    }
  }

  const handleAiUndo = async () => {
    if (!aiUndoPatch) return
    const ok = await dialog.confirm({
      title: '撤销 AI 语义同步？',
      message: [
        `将把 ${aiUndoPatch.changes.length} 条字段文本恢复到同步前内容。`,
        '只有相关记录未被再次修改时才会执行；否则请使用版本历史中的快照。',
      ].join('\n'),
      confirmText: '原子撤销',
      cancelText: '取消',
      tone: 'danger',
    })
    if (!ok) return
    setAiBusy(true)
    try {
      await undoGlobalReplace(aiUndoPatch)
      setAiUndoPatch(null)
      await refreshStores()
      toast.success('已撤销 AI 语义同步')
    } catch (error) {
      toast.error(`撤销失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setAiBusy(false)
    }
  }

  const allSelected = !!preview && preview.groups.length > 0
    && preview.groups.every(group => group.records.every(record => selectedKeys.has(recordKeyOf(group.target, record.id))))

  return (
    <div className="space-y-3 p-4">
      <div className="inline-flex rounded-md border border-border bg-bg-base p-0.5 text-xs">
        <button
          onClick={() => setActiveTab('exact')}
          className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 ${activeTab === 'exact' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'}`}
        >
          <Search className="h-3.5 w-3.5" /> 精确替换
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 ${activeTab === 'ai' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'}`}
        >
          <Sparkles className="h-3.5 w-3.5" /> AI 语义同步
        </button>
      </div>

      {activeTab === 'exact' && (
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-3">
        <div className="grid gap-2 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[11px] text-text-muted">查找（跨全部模块）</span>
            <input
              value={query}
              onChange={event => { setQuery(event.target.value); setPreview(null); setSelectedKeys(new Set()) }}
              placeholder="旧角色名、旧地名、旧设定词…"
              className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-text-muted">替换为</span>
            <input
              value={replacement}
              onChange={event => { setReplacement(event.target.value); setPreview(null) }}
              placeholder="留空表示删除命中文字"
              className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-base px-2 py-1 text-text-secondary">
            <input type="checkbox" checked={wholeWord} onChange={event => { setWholeWord(event.target.checked); setPreview(null) }} />
            全字匹配
          </label>
          <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-base px-2 py-1 text-text-secondary">
            <input type="checkbox" checked={caseSensitive} onChange={event => { setCaseSensitive(event.target.checked); setPreview(null) }} />
            大小写敏感
          </label>
          <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-base px-2 py-1 text-text-secondary">
            <input type="checkbox" checked={useRegex} onChange={event => { setUseRegex(event.target.checked); setPreview(null) }} />
            正则
          </label>
          <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-base px-2 py-1 text-text-secondary">
            <input type="checkbox" checked={protectLongerTerms} onChange={event => { setProtectLongerTerms(event.target.checked); setPreview(null) }} />
            保护更长的实体名
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void runSearch()}
            disabled={busy || !query.trim()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            <Search className="h-3.5 w-3.5" /> 搜索全部模块
          </button>
          {preview && !preview.blockers.length && preview.totalRecords > 0 && (
            <button
              onClick={() => void applyReplace()}
              disabled={busy || !selectedCount}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> 替换选中（{selectedCount} 条 / {selectedMatches} 处）
            </button>
          )}
          {undoPatch && (
            <button
              onClick={() => void handleUndo()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-warning hover:bg-warning/20 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> 撤销上次替换
            </button>
          )}
        </div>

        {preview && (
          <div className="space-y-2">
            {preview.blockers.map(blocker => (
              <div key={blocker} className="flex gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{blocker}</span>
              </div>
            ))}
            {preview.warnings.map(warning => (
              <div key={warning} className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
            {!preview.blockers.length && preview.totalRecords > 0 && (
              <div className="flex gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  共 {preview.totalMatches} 处命中，分布在 {preview.totalRecords} 条记录、{preview.groups.length} 个模块。
                  可按记录勾选后执行。
                </span>
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-border bg-bg-base p-3 text-[11px] leading-5 text-text-muted">
            <p className="font-medium text-text-secondary">上次执行结果</p>
            <p>
              替换 {result.totalReplacements} 处 · 更新 {result.changedRecords} 条记录 · 快照 #{result.snapshotId}
              （可在「版本历史」整体恢复）
            </p>
          </div>
        )}
      </div>

      <aside className="rounded-lg border border-border bg-bg-base p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary">
            <ListChecks className="h-3.5 w-3.5" /> 命中明细
          </span>
          {preview && !preview.blockers.length && preview.totalRecords > 0 && (
            <button
              onClick={() => toggleAll(!allSelected)}
              className="inline-flex items-center gap-1 rounded border border-border bg-bg-surface px-2 py-0.5 text-[11px] text-text-muted hover:text-text-primary"
            >
              <SquareDashed className="h-3 w-3" /> {allSelected ? '全不选' : '全选'}
            </button>
          )}
        </div>
        <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1 text-[11px]">
          {!preview && <p className="py-8 text-center text-xs text-text-muted">输入查找内容并点击「搜索全部模块」。</p>}
          {preview && !preview.blockers.length && !preview.totalRecords && (
            <p className="py-8 text-center text-xs text-text-muted">没有命中。</p>
          )}
          {preview?.groups.map(group => (
            <section key={group.target}>
              <p className="font-medium text-text-secondary">{group.label} · {group.count} 处 / {group.records.length} 条</p>
              {group.records.map(record => {
                const key = recordKeyOf(group.target, record.id)
                const checked = selectedKeys.has(key)
                return (
                  <div key={key} className={`mt-1 rounded border px-2 py-1.5 ${checked ? 'border-accent/40 bg-accent/5' : 'border-border bg-bg-surface'}`}>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={checked} onChange={() => toggleRecord(key)} />
                      <span className="truncate font-medium text-text-primary">
                        {group.target === 'chapters' && onOpenChapter ? (
                          <button
                            onClick={() => onOpenChapter(record.id)}
                            className="max-w-[16rem] truncate text-accent hover:underline"
                            title="跳转到该章节"
                          >
                            {record.recordLabel}
                          </button>
                        ) : record.recordLabel}
                        {' '}· {record.count} 处
                      </span>
                    </label>
                    {record.fields.map(field => (
                      <p key={field.field} className="mt-0.5 pl-5 text-text-muted">
                        {field.label} ×{field.count}
                        {field.snippets[0] ? `：${field.snippets[0]}` : ''}
                      </p>
                    ))}
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      </aside>
      </div>
      )}

      {activeTab === 'ai' && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[11px] text-text-muted">变更说明（发生了什么变更，期望其他模块如何联动）</span>
              <textarea
                value={changeSummary}
                onChange={event => setChangeSummary(event.target.value)}
                rows={4}
                placeholder={'例：主角改名，林尘 → 陆沉，请同步各模块中的相关描述。\n例：核心设定变更，灵气 → 真元，修炼体系与故事核心的表述需联动。'}
                className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-text-muted">关注词（可选，用于预筛候选记录，降低 AI 分析量）</span>
              <input
                value={focusKeyword}
                onChange={event => setFocusKeyword(event.target.value)}
                placeholder="例：林尘"
                className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            <p className="rounded-lg border border-border bg-bg-base p-3 text-[11px] leading-5 text-text-muted">
              AI 语义同步用于精确替换覆盖不到的场景：其他模块用不同措辞引用被变更的内容时，由 AI 判断并给出整段改写建议。
              建议需人工确认后才会写入；章节正文不参与语义同步，请改用「精确替换」。
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void runSync()}
                disabled={aiBusy || !changeSummary.trim()}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" /> {aiBusy ? 'AI 分析中…' : '生成同步建议'}
              </button>
              {aiSuggestions.length > 0 && (
                <button
                  onClick={() => void applySuggestions()}
                  disabled={aiBusy || !aiSelectedCount}
                  className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  <ShieldCheck className="h-3.5 w-3.5" /> 应用选中建议（{aiSelectedCount}）
                </button>
              )}
              {aiUndoPatch && (
                <button
                  onClick={() => void handleAiUndo()}
                  disabled={aiBusy}
                  className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-warning hover:bg-warning/20 disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> 撤销上次同步
                </button>
              )}
            </div>
            {aiRunStats && (
              <div className="rounded-lg border border-border bg-bg-base p-3 text-[11px] leading-5 text-text-muted">
                已扫描 {aiRunStats.scannedFields} 个登记文本字段
                {aiRunStats.truncated ? '；候选文本超出预算，部分字段未送入 AI（可填写关注词缩小范围）' : ''}
              </div>
            )}
          </div>

          <aside className="rounded-lg border border-border bg-bg-base p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary">
                <ListChecks className="h-3.5 w-3.5" /> 同步建议
              </span>
              {aiSuggestions.length > 0 && (
                <button
                  onClick={() => toggleAiAll(aiSelectedCount !== aiSuggestions.length)}
                  className="inline-flex items-center gap-1 rounded border border-border bg-bg-surface px-2 py-0.5 text-[11px] text-text-muted hover:text-text-primary"
                >
                  <SquareDashed className="h-3 w-3" /> {aiSelectedCount === aiSuggestions.length ? '全不选' : '全选'}
                </button>
              )}
            </div>
            <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1 text-[11px]">
              {!aiSuggestions.length && (
                <p className="py-8 text-center text-xs text-text-muted">描述变更并点击「生成同步建议」。</p>
              )}
              {aiSuggestions.map(suggestion => {
                const checked = aiSelectedKeys.has(suggestion.key)
                return (
                  <div
                    key={suggestion.key}
                    className={`rounded border p-2 ${checked ? 'border-accent/40 bg-accent/5' : 'border-border bg-bg-surface'}`}
                  >
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={checked} onChange={() => toggleAiRecord(suggestion.key)} />
                      <span className="truncate font-medium text-text-primary">
                        {suggestion.targetLabel}「{suggestion.recordLabel}」· {suggestion.fieldLabel}
                      </span>
                    </label>
                    <p className="mt-0.5 pl-5 text-text-muted">{suggestion.reason}</p>
                    <p className="mt-1 line-clamp-3 pl-5 text-text-secondary" title={suggestion.currentText}>
                      原文：{suggestion.currentText}
                    </p>
                    <p className="mt-1 line-clamp-3 pl-5 text-success" title={suggestion.suggestedText}>
                      建议：{suggestion.suggestedText}
                    </p>
                  </div>
                )
              })}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
