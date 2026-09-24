/**
 * 可编辑字段行 —— AI 生成结果（采纳前）的手动修正入口
 *
 * 展示态与原 FieldRow 一致（label：value），点击文字原地进入编辑；
 * 复用 InlineTextarea（IME 组合输入保护、Escape 取消、blur 提交、自动增高）。
 *
 * 可选 AI 重生成：传入 onRegenerate 后行尾显示 AI 重写按钮，点击行内
 * 展开补充要求弹层——默认以当前编辑后的字段内容为要求，可补充说明；
 * 生成中行尾显示旋转指示，错误在行下方展示并可关闭。
 */
import { useEffect, useRef, useState } from 'react'
import { Loader2, Sparkles, X } from 'lucide-react'
import { InlineTextarea } from './InlineEdit'
import { CTextarea } from './CompositionInput'

interface EditableFieldRowProps {
  label: string
  value: string
  onChange: (value: string) => void
  /** 强调显示（如「一句话故事」），与原 FieldRow 的 highlight 视觉一致 */
  highlight?: boolean
  /** 紧凑排版（角色卡内 text-xs 场景） */
  compact?: boolean
  /** 覆盖默认展示态样式（highlight/compact 之上），如角色简介的 accent 小字 */
  displayClassName?: string
  placeholder?: string
  /** 编辑态最大行数，超出后内部滚动 */
  maxRows?: number
  /** 附加到外层容器（用于栅格跨列等布局场景） */
  className?: string
  /** 提供后行尾显示「AI 按我的要求重写」按钮；userHint 为弹层中的补充要求（可为空） */
  onRegenerate?: (userHint?: string) => void
  /** 该字段重生成进行中（行尾旋转指示） */
  regenerating?: boolean
  /** 该字段重生成失败信息（行下方展示） */
  regenerateError?: string
  /** 关闭错误提示 */
  onClearRegenerateError?: () => void
}

export default function EditableFieldRow({
  label,
  value,
  onChange,
  highlight = false,
  compact = false,
  displayClassName: displayClassNameProp,
  placeholder,
  maxRows = 24,
  className,
  onRegenerate,
  regenerating = false,
  regenerateError,
  onClearRegenerateError,
}: EditableFieldRowProps) {
  const [hintOpen, setHintOpen] = useState(false)
  const [hint, setHint] = useState('')
  const hintRef = useRef<HTMLTextAreaElement>(null)

  // 弹层打开时聚焦补充要求输入框
  useEffect(() => {
    if (hintOpen) hintRef.current?.focus()
  }, [hintOpen])

  const closeHint = () => {
    setHintOpen(false)
    setHint('')
  }

  const startRegenerate = () => {
    const userHint = hint.trim() || undefined
    closeHint()
    onRegenerate?.(userHint)
  }

  const defaultDisplay = highlight
    ? 'font-medium !text-accent'
    : compact
      ? '!text-xs !text-text-muted'
      : undefined
  const displayClassName = displayClassNameProp ?? defaultDisplay
  return (
    <div className={className}>
      <div className="flex items-start gap-1">
        <span className="shrink-0 pt-[2px] text-xs text-text-muted">{label}：</span>
        <div className="min-w-0 flex-1">
          <InlineTextarea
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            displayClassName={displayClassName}
            className={`w-full rounded border border-accent/30 bg-bg-base px-2 py-1 text-text-primary outline-none resize-none ${compact ? 'text-xs' : 'text-sm'}`}
            maxRows={maxRows}
          />
        </div>
        {onRegenerate && (
          <button
            type="button"
            title={regenerating ? 'AI 正在重写此字段…' : 'AI 按我的要求重写此字段'}
            aria-label={regenerating ? 'AI 正在重写此字段' : 'AI 按我的要求重写此字段'}
            disabled={regenerating}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation()
              setHintOpen(open => !open)
            }}
            className="mt-[2px] shrink-0 rounded p-0.5 text-text-muted transition-colors hover:bg-accent/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          </button>
        )}
      </div>

      {/* 补充要求弹层：行内展开，避免被面板 overflow 裁剪 */}
      {hintOpen && onRegenerate && !regenerating && (
        <div
          className="mt-1 rounded border border-accent/30 bg-bg-elevated p-2"
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <p className="text-xs text-text-muted">
            AI 将按你当前修改后的内容重写「{label}」，其余字段保持不变。可补充要求：
          </p>
          <CTextarea
            ref={hintRef}
            value={hint}
            onChange={e => setHint(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                closeHint()
              }
            }}
            rows={2}
            placeholder="补充要求（可选），例如：更黑暗压抑、必须包含复仇线……"
            className="mt-1.5 w-full resize-none rounded border border-border bg-bg-base px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={closeHint}
              className="rounded px-2 py-1 text-xs text-text-secondary hover:bg-bg-hover"
            >
              取消
            </button>
            <button
              type="button"
              onClick={startRegenerate}
              className="flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-xs text-white hover:bg-accent-hover"
            >
              <Sparkles className="h-3 w-3" />
              开始生成
            </button>
          </div>
        </div>
      )}

      {/* 重生成错误提示 */}
      {regenerateError && (
        <div className="mt-1 flex items-start gap-1.5 rounded border border-error/30 bg-error/5 px-2 py-1.5 text-xs text-error">
          <span className="min-w-0 flex-1 break-all">{regenerateError}</span>
          <button
            type="button"
            title="关闭"
            aria-label="关闭错误提示"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation()
              onClearRegenerateError?.()
            }}
            className="shrink-0 text-error/70 hover:text-error"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}
