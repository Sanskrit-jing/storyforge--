import { useState } from 'react'
import { Check, Loader2, Maximize2, Sparkles, X } from 'lucide-react'
import FullScreenViewer from './FullScreenViewer'

interface Props<T> {
  title: string
  items: T[]
  selected: Set<number>
  loading?: boolean
  error?: string | null
  renderItem: (item: T, index: number) => React.ReactNode
  /** 全屏查看时的渲染（缺省复用 renderItem） */
  renderItemFull?: (item: T, index: number) => React.ReactNode
  onToggle: (index: number) => void
  onConfirm: () => void
  onClose: () => void
}

export default function ExtractionReviewPanel<T>({
  title, items, selected, loading, error, renderItem, renderItemFull, onToggle, onConfirm, onClose,
}: Props<T>) {
  const [fullscreen, setFullscreen] = useState(false)
  return (
    <div className="mt-3 rounded-xl border border-accent/30 bg-bg-surface p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" /> {title}
        </h3>
        <div className="flex items-center gap-1">
          {items.length > 0 && !loading && (
            <button onClick={() => setFullscreen(true)} className="p-1 text-text-muted hover:text-accent" title="全屏查看">
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary" title="关闭">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {loading && (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Loader2 className="w-4 h-4 animate-spin" /> AI 正在分析并整理候选项…
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="text-xs text-text-muted">没有发现可写入的新内容。</p>
      )}
      {items.length > 0 && (
        <>
          <div className="max-h-72 overflow-y-auto space-y-2">
            {items.map((item, index) => (
              <div
                key={index}
                className={`flex items-start gap-2 rounded-lg border p-2.5 ${
                  selected.has(index) ? 'border-accent/40 bg-accent/5' : 'border-border'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(index)}
                  onChange={() => onToggle(index)}
                  className="mt-0.5 accent-accent cursor-pointer shrink-0"
                />
                <div className="min-w-0 flex-1">{renderItem(item, index)}</div>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              onClick={onConfirm}
              disabled={selected.size === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs disabled:opacity-40"
            >
              <Check className="w-3.5 h-3.5" /> 确认写入（{selected.size}）
            </button>
          </div>
        </>
      )}
      {fullscreen && (
        <FullScreenViewer open title={title} subtitle="AI 候选 · 点击文字可直接编辑" onClose={() => setFullscreen(false)}>
          <div className="space-y-2">
            {items.map((item, index) => (
              <div
                key={index}
                className={`flex items-start gap-2 rounded-lg border p-3 ${
                  selected.has(index) ? 'border-accent/40 bg-accent/5' : 'border-border'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(index)}
                  onChange={() => onToggle(index)}
                  className="mt-1 accent-accent cursor-pointer shrink-0"
                />
                <div className="min-w-0 flex-1">{(renderItemFull ?? renderItem)(item, index)}</div>
              </div>
            ))}
          </div>
        </FullScreenViewer>
      )}
    </div>
  )
}
