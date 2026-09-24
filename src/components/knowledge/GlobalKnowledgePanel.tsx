import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookMarked,
  ChevronDown,
  Download,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import { estimateTokens } from '../../lib/ai/context-budget'
import {
  deleteKnowledgeEntry,
  exportGlobalKnowledge,
  importGlobalKnowledge,
  readAllKnowledgeEntries,
  saveKnowledgeEntry,
  type GlobalKnowledgeImportResult,
} from '../../lib/knowledge/global-knowledge'
import {
  KNOWLEDGE_CATEGORIES,
  type GlobalKnowledgeEntry,
} from '../../lib/types'
import { saveText } from '../../lib/export/save-file'
import { useDialog } from '../shared/Dialog'
import { useToast } from '../shared/Toast'

interface DraftState {
  id?: number
  title: string
  content: string
  category: string
  triggersText: string
}

const EMPTY_DRAFT: DraftState = {
  title: '',
  content: '',
  category: KNOWLEDGE_CATEGORIES[0],
  triggersText: '',
}

/** 输入框用顿号/逗号/换行分隔触发词 */
function parseTriggersText(text: string): string[] {
  return text
    .split(/[、,，;；\n]/)
    .map(value => value.trim())
    .filter(Boolean)
}

function triggersToText(entry: GlobalKnowledgeEntry): string {
  return entry.triggers?.join('、') ?? ''
}

/** 条目可能带入列表之外的分类（如导入文件）；下拉需兜底展示真实值 */
function isKnownCategory(category: string): boolean {
  return (KNOWLEDGE_CATEGORIES as readonly string[]).includes(category)
}

function toDraft(entry: GlobalKnowledgeEntry): DraftState {
  return {
    id: entry.id,
    title: entry.title,
    content: entry.content,
    category: entry.category,
    triggersText: triggersToText(entry),
  }
}

export default function GlobalKnowledgePanel() {
  const toast = useToast()
  const dialog = useDialog()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [entries, setEntries] = useState<GlobalKnowledgeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterText, setFilterText] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      setEntries(await readAllKnowledgeEntries())
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // 知识库为全局数据，无项目/世界作用域依赖，仅需挂载时读取一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stats = useMemo(() => {
    const enabled = entries.filter(entry => entry.enabled)
    return {
      total: entries.length,
      enabled: enabled.length,
      enabledTokens: enabled.reduce((sum, entry) => sum + estimateTokens(entry.content), 0),
    }
  }, [entries])

  // 筛选选项 = 内置分类 ∪ 条目实际携带的分类（含导入带进来的）
  const categoryOptions = useMemo(() => {
    const known = new Set<string>(KNOWLEDGE_CATEGORIES)
    for (const entry of entries) known.add(entry.category)
    return [...known]
  }, [entries])

  const visibleEntries = useMemo(() => {
    const keyword = filterText.trim().toLowerCase()
    return entries.filter(entry => {
      if (filterCategory && entry.category !== filterCategory) return false
      if (!keyword) return true
      return entry.title.toLowerCase().includes(keyword)
        || entry.content.toLowerCase().includes(keyword)
        || (entry.triggers ?? []).some(trigger => trigger.toLowerCase().includes(keyword))
    })
  }, [entries, filterCategory, filterText])

  const startCreate = () => setDraft({ ...EMPTY_DRAFT })

  const startEdit = (entry: GlobalKnowledgeEntry) => setDraft(toDraft(entry))

  const cancelEdit = () => setDraft(null)

  const submitDraft = async () => {
    if (!draft) return
    setSaving(true)
    try {
      await saveKnowledgeEntry({
        id: draft.id,
        title: draft.title,
        content: draft.content,
        category: draft.category,
        enabled: draft.id == null
          ? true
          : (entries.find(entry => entry.id === draft.id)?.enabled ?? true),
        triggers: parseTriggersText(draft.triggersText),
      })
      setDraft(null)
      await load()
      toast.success(draft.id == null ? '知识条目已添加' : '知识条目已保存')
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async (entry: GlobalKnowledgeEntry, enabled: boolean) => {
    try {
      await saveKnowledgeEntry({ ...entry, enabled })
      await load()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const remove = async (entry: GlobalKnowledgeEntry) => {
    const confirmed = await dialog.confirm({
      title: `删除知识条目「${entry.title}」？`,
      message: '删除后不可恢复；不影响作品正文与项目数据。',
      confirmText: '删除',
      tone: 'danger',
    })
    if (!confirmed) return
    try {
      await deleteKnowledgeEntry(entry.id!)
      await load()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const handleExport = async () => {
    setBusy('export')
    try {
      const file = await exportGlobalKnowledge()
      const date = new Date().toISOString().slice(0, 10)
      await saveText(
        JSON.stringify(file, null, 2),
        `storyforge-global-knowledge-${date}.json`,
        'application/json',
      )
      toast.success(`已导出 ${file.entries.length} 条知识条目`)
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(null)
    }
  }

  const handleImportFile = async (file: File) => {
    setBusy('import')
    try {
      let parsed: unknown
      try {
        parsed = JSON.parse(await file.text())
      } catch {
        throw new Error('文件不是有效的 JSON')
      }
      const result: GlobalKnowledgeImportResult = await importGlobalKnowledge(parsed)
      await load()
      if (!result.imported) {
        toast.error('未导入任何条目：文件格式不符或条目缺少标题/正文')
      } else {
        toast.success(
          `已导入 ${result.imported} 条`
          + (result.skipped ? `，跳过 ${result.skipped} 条无效条目` : ''),
        )
      }
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <section className="mx-auto max-w-2xl rounded-xl border border-border bg-bg-surface">
      {/* 手机竖屏 / HD：标题描述占满整行，操作按钮换行右对齐，避免描述被挤成窄列；PC 保持单行 */}
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-border p-4">
        <BookMarked className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text-primary">全局知识库</h3>
          <p className="mt-0.5 text-xs text-text-secondary">
            作者手写的查阅式参考手册：每个条目写一个主题（如「喜欢」）和对应的描写范例。
            AI 写到相关情节时会按主题主动查询这里取参考，而不是把整库塞进上下文。
          </p>
        </div>
        <div className="flex w-full items-center justify-end gap-1.5 sm:w-auto sm:shrink-0">
          <button
            type="button"
            disabled={busy === 'export' || !entries.length}
            onClick={() => void handleExport()}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {busy === 'export' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            导出
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {busy === 'import' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            导入
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0]
              if (file) void handleImportFile(file)
            }}
          />
          <button
            type="button"
            onClick={startCreate}
            disabled={!!draft}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            添加条目
          </button>
        </div>
      </header>

      {/* 编辑表单 */}
      {draft && (
        <div className="space-y-2.5 border-b border-border bg-bg-base/50 p-4">
          <div className="flex flex-wrap gap-2.5">
            <label className="min-w-0 flex-1 text-[10px] text-text-muted">
              主题（必填，AI 查询的匹配词）
              <input
                value={draft.title}
                onChange={event => setDraft({ ...draft, title: event.target.value })}
                placeholder="例如：喜欢"
                className="mt-1 w-full rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
              />
            </label>
            <label className="text-[10px] text-text-muted">
              分类
              <select
                value={draft.category}
                onChange={event => setDraft({ ...draft, category: event.target.value })}
                className="mt-1 block w-28 rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
              >
                {/* 条目可能携带列表之外的分类（导入等），保留真实值避免所见非所得 */}
                {(isKnownCategory(draft.category)
                  ? KNOWLEDGE_CATEGORIES
                  : [...KNOWLEDGE_CATEGORIES, draft.category] as readonly string[]
                ).map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-[10px] text-text-muted">
            触发词（可选，用顿号或逗号分隔；AI 查到任一词即返回本条）
            <input
              value={draft.triggersText}
              onChange={event => setDraft({ ...draft, triggersText: event.target.value })}
              placeholder="例如：心动、告白、初恋"
              className="mt-1 w-full rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
            />
          </label>
          <label className="block text-[10px] text-text-muted">
            描写范例 / 约定正文（必填）
            <textarea
              value={draft.content}
              onChange={event => setDraft({ ...draft, content: event.target.value })}
              rows={6}
              placeholder="例如：写「喜欢」时避免直接说出这个词——用视线躲闪、话到嘴边改口、下意识记住对方的小习惯来承载；节奏上先抑后扬。"
              className="mt-1 w-full resize-y rounded border border-border bg-bg-surface px-2 py-1.5 text-xs leading-5 text-text-primary outline-none focus:border-accent"
            />
          </label>
          <div className="flex items-center justify-between text-[10px] text-text-muted">
            <p>约 {estimateTokens(draft.content)} tokens</p>
            <p>AI 写到相关情节时通过查询工具取回本条参考。</p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover"
            >
              取消
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void submitDraft()}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : draft.id == null ? '添加' : '保存'}
            </button>
          </div>
        </div>
      )}

      {/* 列表筛选 */}
      {entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <select
            value={filterCategory}
            onChange={event => setFilterCategory(event.target.value)}
            aria-label="按分类筛选"
            className="rounded border border-border bg-bg-surface px-2 py-1 text-[10px] text-text-primary outline-none focus:border-accent"
          >
            <option value="">全部分类</option>
            {categoryOptions.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <input
            value={filterText}
            onChange={event => setFilterText(event.target.value)}
            placeholder="按主题、正文或触发词过滤…"
            className="min-w-0 flex-1 rounded border border-border bg-bg-surface px-2 py-1 text-[10px] text-text-primary outline-none focus:border-accent"
          />
        </div>
      )}

      {/* 列表 */}
      {loading && !entries.length ? (
        <p className="flex items-center justify-center gap-2 py-10 text-xs text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> 正在读取知识库…
        </p>
      ) : !entries.length ? (
        <div className="px-4 py-10 text-center">
          <p className="text-xs text-text-muted">还没有知识条目。</p>
          <p className="mt-1 text-[10px] leading-5 text-text-muted">
            把「希望 AI 写好某个主题」的描写范例写在这里：一个条目一个主题（如「喜欢」、
            「打斗」、「文风」），正文放范例写法，可选加几个触发词（心动/告白）方便命中。
          </p>
        </div>
      ) : !visibleEntries.length ? (
        <p className="px-4 py-8 text-center text-xs text-text-muted">
          没有符合筛选条件的条目。
        </p>
      ) : (
        <div className="divide-y divide-border">
          {visibleEntries.map(entry => (
            <KnowledgeEntryRow
              key={entry.id}
              entry={entry}
              editing={draft?.id === entry.id}
              onToggle={enabled => void toggleEnabled(entry, enabled)}
              onEdit={() => startEdit(entry)}
              onDelete={() => void remove(entry)}
            />
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <footer className="border-t border-border px-4 py-2.5 text-[10px] text-text-muted">
          共 {stats.total} 条
          {(filterCategory || filterText.trim())
            ? ` · 筛选显示 ${visibleEntries.length} 条`
            : ` · 可查询 ${stats.enabled} 条`}
          {' '}· 合计约 {stats.enabledTokens.toLocaleString()} tokens
          （不常驻注入，AI 按主题按需查询）
        </footer>
      )}
    </section>
  )
}

function KnowledgeEntryRow({
  entry,
  editing,
  onToggle,
  onEdit,
  onDelete,
}: {
  entry: GlobalKnowledgeEntry
  editing: boolean
  onToggle: (enabled: boolean) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={editing ? 'opacity-50' : undefined}>
      <div className="flex items-center gap-2.5 px-4 py-2.5">
        <input
          type="checkbox"
          aria-label={`启用 ${entry.title}`}
          checked={entry.enabled}
          onChange={event => onToggle(event.target.checked)}
          className="accent-[var(--color-accent)]"
        />
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium text-text-primary">{entry.title}</span>
            <span className="mt-0.5 block truncate text-[10px] text-text-muted">
              {entry.category} · 约 {estimateTokens(entry.content)} tokens · 更新 {new Date(entry.updatedAt).toLocaleDateString()}
            </span>
            {!!entry.triggers?.length && (
              <span className="mt-1 flex flex-wrap gap-1">
                {entry.triggers.map(trigger => (
                  <span key={trigger} className="rounded bg-bg-base px-1.5 py-0.5 text-[9px] text-text-muted">
                    {trigger}
                  </span>
                ))}
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          aria-label={`编辑 ${entry.title}`}
          onClick={onEdit}
          className="rounded p-1.5 text-text-muted hover:bg-bg-hover hover:text-accent"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label={`删除 ${entry.title}`}
          onClick={onDelete}
          className="rounded p-1.5 text-text-muted hover:bg-error/10 hover:text-error"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded && (
        <pre className="mx-4 mb-2.5 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-bg-base p-2.5 text-[10px] leading-4 text-text-muted">
          {entry.content}
        </pre>
      )}
    </div>
  )
}
