import { Columns2, Eye, Loader2, Save, Volume2 } from 'lucide-react'
import type { ChapterStatus } from '../../lib/types'

const STATUS_OPTIONS: { value: ChapterStatus; label: string }[] = [
  { value: 'outline', label: '仅大纲' },
  { value: 'draft', label: '初稿' },
  { value: 'revised', label: '已修改' },
  { value: 'polished', label: '已润色' },
  { value: 'final', label: '定稿' },
]

const STATUS_STYLE: Record<ChapterStatus, string> = {
  outline: 'bg-bg-elevated text-text-muted',
  draft: 'bg-warning/10 text-warning',
  revised: 'bg-info/10 text-info',
  polished: 'bg-accent/10 text-accent',
  final: 'bg-success/10 text-success',
}

interface Props {
  title: string
  wordCount: number
  status: ChapterStatus
  showContext: boolean
  canCompare: boolean
  saveDisabled: boolean
  saving: boolean
  saveError: string
  isSaved: boolean
  /** 是否支持/允许语音朗读（浏览器支持且当前不是对照润色模式） */
  canRead: boolean
  /** 朗读会话是否进行中（按钮高亮） */
  reading: boolean
  onStatusChange: (status: ChapterStatus) => void
  onToggleContext: () => void
  onToggleReader: () => void
  onOpenCompare: () => void
  onSave: () => void
}

export default function ChapterEditorHeader({
  title,
  wordCount,
  status,
  showContext,
  canCompare,
  saveDisabled,
  saving,
  saveError,
  isSaved,
  canRead,
  reading,
  onStatusChange,
  onToggleContext,
  onToggleReader,
  onOpenCompare,
  onSave,
}: Props) {
  // 窄屏（手机竖屏）允许换行压缩高度，md 及以上保持原单行布局
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 md:justify-between md:px-6 md:py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 md:flex-nowrap md:gap-3">
        <div className="min-w-0">
          <p className="hidden text-[11px] uppercase tracking-[0.18em] text-text-muted md:block">
            创作区 · 正文
          </p>
          <h2 className="truncate font-serif text-lg font-semibold text-text-primary md:text-xl">{title}</h2>
        </div>
        <span className="whitespace-nowrap rounded-full border border-border bg-bg-elevated px-2.5 py-1 text-xs text-text-muted">
          {wordCount.toLocaleString()} 字
        </span>
        <select
          aria-label="章节状态"
          value={status}
          onChange={event => onStatusChange(event.target.value as ChapterStatus)}
          title="章节状态会决定该章是否可用于文风学习"
          className={`text-xs px-2 py-1 rounded border border-transparent focus:outline-none focus:border-accent cursor-pointer ${STATUS_STYLE[status]}`}
        >
          {STATUS_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1 md:gap-2">
        {canRead && (
          <button
            type="button"
            onClick={onToggleReader}
            aria-pressed={reading}
            title={reading ? '显示/隐藏朗读控制条（停止请用控制条 ×）' : '语音朗读本章正文'}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs hover:bg-bg-hover ${
              reading ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Volume2 className="h-3.5 w-3.5" /> 朗读
          </button>
        )}
        <button
          type="button"
          onClick={onToggleContext}
          aria-pressed={showContext}
          className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-text-muted hover:bg-bg-hover hover:text-text-primary"
        >
          <Eye className="w-3.5 h-3.5" /> 上下文
        </button>
        <button
          type="button"
          onClick={onOpenCompare}
          disabled={!canCompare}
          className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-text-muted hover:bg-bg-hover hover:text-accent disabled:opacity-40"
        >
          <Columns2 className="h-3.5 w-3.5" /> 对照润色
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saveDisabled || saving}
          title={saveError ? `保存失败：${saveError}` : undefined}
          className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-40 ${
            saveError ? 'text-error' : isSaved ? 'text-success' : 'text-text-muted hover:text-accent'
          }`}
        >
          {saving
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Save className="w-3.5 h-3.5" />}
          {saving ? '保存中...' : saveError ? '保存失败' : isSaved ? '已保存' : '保存'}
        </button>
      </div>
    </div>
  )
}
