import { useEffect, useRef, useState } from 'react'
import { Download, Loader2, MessageSquareQuote, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import {
  deletePhrase,
  exportCommonPhrases,
  importCommonPhrases,
  readAllPhrases,
  savePhrase,
} from '../../lib/phrases/common-phrases'
import type { CommonPhrasesImportResult } from '../../lib/phrases/common-phrases'
import type { CommonPhraseEntry } from '../../lib/types'
import { saveText } from '../../lib/export/save-file'
import { useDialog } from '../shared/Dialog'
import { useToast } from '../shared/Toast'

interface DraftState {
  id?: number
  title: string
  content: string
}

const EMPTY_DRAFT: DraftState = { title: '', content: '' }

/**
 * PHRASE-1 全局常用语管理页（独立路由 /phrases，跨项目共享）。
 * 作者手写的快捷文案片段：标题用于查找，内容用于点击填入/复制。
 * 不注入 AI 上下文；备份走本页独立的 JSON 导出/导入（不随项目导出）。
 */
export default function CommonPhrasesPage() {
  const toast = useToast()
  const dialog = useDialog()
  const [entries, setEntries] = useState<CommonPhraseEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      setEntries(await readAllPhrases())
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // 常用语为全局数据，无项目/世界作用域依赖，仅需挂载时读取一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startCreate = () => setDraft({ ...EMPTY_DRAFT })

  const startEdit = (entry: CommonPhraseEntry) =>
    setDraft({ id: entry.id, title: entry.title, content: entry.content })

  const cancelEdit = () => setDraft(null)

  const submitDraft = async () => {
    if (!draft) return
    setSaving(true)
    try {
      await savePhrase({ id: draft.id, title: draft.title, content: draft.content })
      setDraft(null)
      await load()
      toast.success(draft.id == null ? '常用语已添加' : '常用语已保存')
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  const handleExport = async () => {
    setBusy('export')
    try {
      const file = await exportCommonPhrases()
      const date = new Date().toISOString().slice(0, 10)
      await saveText(
        JSON.stringify(file, null, 2),
        `storyforge-common-phrases-${date}.json`,
        'application/json',
      )
      toast.success(`已导出 ${file.entries.length} 条常用语`)
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
      const result: CommonPhrasesImportResult = await importCommonPhrases(parsed)
      await load()
      if (!result.imported) {
        toast.error('未导入任何条目：格式不符、条目无效或与现有常用语重复')
      } else {
        toast.success(
          `已导入 ${result.imported} 条`
          + (result.skipped ? `，跳过 ${result.skipped} 条无效/重复条目` : ''),
        )
      }
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const remove = async (entry: CommonPhraseEntry) => {
    const confirmed = await dialog.confirm({
      title: `删除常用语「${entry.title}」？`,
      message: '删除后不可恢复；不影响作品正文与项目数据。',
      confirmText: '删除',
      tone: 'danger',
    })
    if (!confirmed) return
    try {
      await deletePhrase(entry.id!)
      await load()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      {/* 说明 + 添加：手机竖屏 / HD 下按钮换行右对齐，避免说明被挤成窄列；PC 保持单行 */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 text-xs leading-5 text-text-secondary">
          <MessageSquareQuote className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-accent" />
          把常重复输入的提示与片段存起来（如「这段内容缺乏情感，要怎么写」），
          创作时点常用语图标查找，点击即可填入或复制。
        </p>
        {/* 手机竖屏 / HD：说明占满整行，操作按钮换行右对齐；PC 保持单行 */}
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
            添加常用语
          </button>
        </div>
      </div>

      {/* 编辑表单 */}
      {draft && (
        <div className="mb-4 space-y-2.5 rounded-xl border border-border bg-bg-surface p-4">
          <label className="block text-[10px] text-text-muted">
            标题（必填，查找时的匹配词）
            <input
              value={draft.title}
              onChange={event => setDraft({ ...draft, title: event.target.value })}
              placeholder="例如：情感不足"
              className="mt-1 w-full rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
            />
          </label>
          <label className="block text-[10px] text-text-muted">
            内容（必填，点击填入/复制的正文）
            <textarea
              value={draft.content}
              onChange={event => setDraft({ ...draft, content: event.target.value })}
              rows={5}
              placeholder="例如：这段内容缺乏情感，要怎么写"
              className="mt-1 w-full resize-y rounded border border-border bg-bg-surface px-2 py-1.5 text-xs leading-5 text-text-primary outline-none focus:border-accent"
            />
          </label>
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

      {/* 列表 */}
      {loading && !entries.length ? (
        <div className="rounded-xl border border-border bg-bg-surface">
          <p className="flex items-center justify-center gap-2 py-10 text-xs text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> 正在读取常用语…
          </p>
        </div>
      ) : !entries.length ? (
        <div className="rounded-xl border border-border bg-bg-surface px-4 py-10 text-center">
          <p className="text-xs text-text-muted">还没有常用语。</p>
          <p className="mt-1 text-[10px] leading-5 text-text-muted">
            添加后，在浮动工具栏、AI 助手输入框、首页等位置的常用语入口即可查找、填入或复制。
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-bg-surface">
          {entries.map(entry => (
            <PhraseRow
              key={entry.id}
              entry={entry}
              editing={draft?.id === entry.id}
              expanded={expandedId === entry.id}
              onToggleExpand={() =>
                setExpandedId(current => (current === entry.id ? null : entry.id!))}
              onEdit={() => startEdit(entry)}
              onDelete={() => void remove(entry)}
            />
          ))}
          <footer className="px-4 py-2.5 text-[10px] text-text-muted">
            共 {entries.length} 条 · 全局共享 · 可用导出/导入备份或迁移到其他设备
          </footer>
        </div>
      )}
    </main>
  )
}

function PhraseRow({
  entry,
  editing,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
}: {
  entry: CommonPhraseEntry
  editing: boolean
  expanded: boolean
  onToggleExpand: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className={editing ? 'opacity-50' : undefined}>
      <div className="flex items-center gap-2.5 px-4 py-2.5">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium text-text-primary">{entry.title}</span>
            <span className="mt-0.5 block truncate text-[10px] text-text-muted">
              更新 {new Date(entry.updatedAt).toLocaleDateString()} · {entry.content}
            </span>
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
