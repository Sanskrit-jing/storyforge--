/**
 * 全屏可编辑文本域（全项目统一）
 *
 * 替代原生 textarea 右下角的拉伸手柄：在手机竖屏 / HD 版（<1280px），
 * 右下角显示「全屏编辑」按钮，点击在 FullScreenViewer 中以大文本域查看和编辑；
 * PC（≥1280px）完全保留历史行为——按钮隐藏，原生 resize-y 拉伸手柄照旧。
 *
 * 与 CTextarea 一样内置 IME 组合输入保护，属性与原生 textarea 完全兼容，
 * 因此全项目的 <CTextarea /> / <textarea /> 可直接替换为本组件。
 * 布局说明：外层 wrapper 为 min-w-0 flex-1，无论父级是普通块容器还是
 * label+field 横向 flex 行，都能正确占满剩余宽度。
 */
import { forwardRef, useRef, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { CTextarea } from './CompositionInput'
import FullScreenViewer from './FullScreenViewer'

interface FullScreenTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** 全屏查看器标题；不传时依次取 aria-label / placeholder */
  fullscreenTitle?: string
}

const FullScreenTextarea = forwardRef<HTMLTextAreaElement, FullScreenTextareaProps>(function FullScreenTextarea({
  fullscreenTitle,
  className = '',
  disabled,
  onBlur,
  ...rest
}, forwardedRef) {
  const [open, setOpen] = useState(false)
  const viewerTextareaRef = useRef<HTMLTextAreaElement>(null)

  const title = fullTitleOf(fullscreenTitle, rest['aria-label'], rest.placeholder)

  const closeViewer = () => {
    // 先 blur，让依赖 onBlur 落库的父级（如维度字段防抖提交）在关闭瞬间完成提交
    viewerTextareaRef.current?.blur()
    setOpen(false)
  }

  return (
    <>
      <div className="relative min-w-0 flex-1">
        <CTextarea
          ref={forwardedRef}
          {...rest}
          disabled={disabled}
          onBlur={onBlur}
          className={`w-full resize-none xl:resize-y ${className}`}
        />
        {/* 仅手机竖屏 / HD 版出现；PC（≥1280px）隐藏并沿用原生拉伸手柄 */}
        {!disabled && (
          <button
            type="button"
            tabIndex={-1}
            onClick={event => {
              event.preventDefault()
              event.stopPropagation()
              setOpen(true)
            }}
            title="点击全屏查看并编辑"
            aria-label="点击全屏查看并编辑"
            className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded border border-border bg-bg-surface/90 text-text-muted shadow-sm hover:text-accent xl:hidden"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <FullScreenViewer
        open={open}
        title={title}
        subtitle="可直接全屏查看与编辑，点击「完成」返回"
        onClose={closeViewer}
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={closeViewer}
              className="rounded-md bg-accent px-4 py-2 text-xs text-white hover:bg-accent-hover"
            >
              完成
            </button>
          </div>
        }
      >
        <CTextarea
          ref={viewerTextareaRef}
          {...rest}
          autoFocus
          onBlur={onBlur}
          className="min-h-[60dvh] w-full resize-none rounded border border-accent/30 bg-bg-base p-3 text-sm leading-relaxed text-text-primary outline-none focus:border-accent"
        />
      </FullScreenViewer>
    </>
  )
})

FullScreenTextarea.displayName = 'FullScreenTextarea'

export default FullScreenTextarea

/** 全屏标题降级：显式标题 → aria-label → placeholder → 固定文案 */
function fullTitleOf(
  explicit: string | undefined,
  ariaLabel: string | undefined,
  placeholder: string | ReadonlyArray<string> | number | undefined,
): string {
  if (explicit) return explicit
  if (ariaLabel) return ariaLabel
  if (typeof placeholder === 'string' && placeholder.trim()) return placeholder.replace(/…+$/, '').trim()
  return '全屏编辑'
}
