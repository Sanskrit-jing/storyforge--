/**
 * 通用全屏查看器
 *
 * 覆盖整个视口的查看/编辑层：标题栏 + 可滚动正文 + 可选底部操作区。
 * Escape 或「退出全屏」关闭；正在输入框/文本域里编辑时 Escape 只作用于输入本身。
 *
 * z-index 与 DialogProvider（10000）一致：Dialog 在 Provider 树中后渲染，
 * 确认弹窗仍可盖在本组件之上。
 */
import { useEffect } from 'react'
import { Minimize2 } from 'lucide-react'
import type { ReactNode } from 'react'

interface FullScreenViewerProps {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  /** 底部固定操作区（可选） */
  footer?: ReactNode
  children: ReactNode
}

export default function FullScreenViewer({
  open,
  title,
  subtitle,
  onClose,
  footer,
  children,
}: FullScreenViewerProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      // 输入中（InlineTextarea/InlineInput 编辑态）时 Escape 交给输入组件自己处理
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) return
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    // safe-area-pad：全屏层是相对视口的 fixed 元素，不继承工作台外壳的安全区内边距，
    // 必须自己避让手机状态栏与底部手势条；PC 上 inset 变量为 0，不产生任何影响。
    <div className="safe-area-pad fixed inset-0 z-[10000] flex flex-col bg-bg-base" role="dialog" aria-modal="true" aria-label={title}>
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-bg-surface px-4 py-3">
        <h2 className="min-w-0 truncate text-sm font-semibold text-text-primary">{title}</h2>
        {subtitle && <span className="hidden min-w-0 truncate text-xs text-text-muted sm:inline">{subtitle}</span>}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
        >
          <Minimize2 className="h-3.5 w-3.5" />
          退出全屏
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-6">
        <div className="mx-auto max-w-4xl">{children}</div>
      </div>
      {footer && <div className="shrink-0 border-t border-border bg-bg-surface px-4 py-3">{footer}</div>}
    </div>
  )
}
