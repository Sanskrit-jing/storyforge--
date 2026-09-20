import { useState } from 'react'
import { Check, Maximize2, X } from 'lucide-react'
import FullScreenViewer from '../shared/FullScreenViewer'
import { InlineInput, InlineTextarea } from '../shared/InlineEdit'

interface PreviewItem {
  title: string
  summary: string
}

/** 采纳前手动编辑：修改第 index 项的标题/简介 */
type UpdateItem = (index: number, field: 'title' | 'summary', value: string) => void

export default function OutlinePreviewPanel({
  label,
  items,
  onConfirm,
  onCancel,
  onUpdateItem,
}: {
  label: string
  items: PreviewItem[]
  onConfirm: () => void
  onCancel: () => void
  onUpdateItem?: UpdateItem
}) {
  const [fullscreen, setFullscreen] = useState(false)
  const editable = Boolean(onUpdateItem)

  const renderItem = (item: PreviewItem, index: number, full: boolean) => (
    <div key={`${item.title}:${index}`} className={full ? 'rounded-lg border border-border bg-bg-surface p-3 space-y-1' : 'px-3 py-2 bg-bg-surface'}>
      <InlineInput
        value={item.title}
        onChange={v => onUpdateItem?.(index, 'title', v)}
        placeholder="标题"
        className="min-w-0 text-sm font-medium text-text-primary"
      />
      {(item.summary || editable) && (
        <InlineTextarea
          value={item.summary}
          onChange={v => onUpdateItem?.(index, 'summary', v)}
          placeholder="简介（点击编辑…）"
          className="w-full rounded border border-accent/30 bg-bg-base px-2 py-1 text-xs text-text-muted outline-none resize-none"
          displayClassName={full
            ? '!text-xs !text-text-muted mt-1 whitespace-pre-wrap'
            : '!text-xs !text-text-muted mt-1 line-clamp-2'}
          maxRows={full ? 24 : 4}
        />
      )}
    </div>
  )

  const renderStaticItem = (item: PreviewItem, index: number) => (
    <div key={`${item.title}:${index}`} className="px-3 py-2 bg-bg-surface">
      <div className="text-sm font-medium text-text-primary">{item.title}</div>
      {item.summary && (
        <div className="text-xs text-text-muted mt-1 line-clamp-2">{item.summary}</div>
      )}
    </div>
  )

  return (
    <div className="border border-accent/50 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-accent/10">
        <span className="text-sm font-medium text-accent">{label}</span>
        <div className="flex gap-2">
          {editable && (
            <button onClick={() => setFullscreen(true)}
              title="全屏查看"
              className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-text-primary rounded transition-colors">
              <Maximize2 className="w-3 h-3" /> 全屏
            </button>
          )}
          <button onClick={onCancel}
            className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-text-primary rounded transition-colors">
            <X className="w-3 h-3" /> 取消
          </button>
          <button onClick={onConfirm}
            className="flex items-center gap-1 px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent-hover transition-colors">
            <Check className="w-3 h-3" /> 确认写入
          </button>
        </div>
      </div>
      <div className="divide-y divide-border max-h-60 overflow-y-auto">
        {items.map((item, index) => (editable ? renderItem(item, index, false) : renderStaticItem(item, index)))}
      </div>

      <FullScreenViewer
        open={fullscreen}
        title={label}
        subtitle="大纲预览 · 点击文字可直接编辑，确认写入时生效"
        onClose={() => setFullscreen(false)}
      >
        <div className="space-y-3">
          {items.map((item, index) => (editable ? renderItem(item, index, true) : renderStaticItem(item, index)))}
        </div>
      </FullScreenViewer>
    </div>
  )
}
