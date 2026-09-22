import { useRef, useState, useEffect, useCallback, type TextareaHTMLAttributes } from 'react'
import { Maximize2 } from 'lucide-react'
import { containTextareaWheel, parseCssPixels } from './textarea-scroll'
import FullScreenViewer from './FullScreenViewer'

interface Props extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> {
  /** 最小行数 */
  minRows?: number
  /** 最大行数（超过后显示滚动条） */
  maxRows?: number
  /** 全屏查看器标题；不传时取 aria-label / placeholder */
  fullscreenTitle?: string
}

/**
 * 自适应高度的 textarea（组合输入安全）
 *
 * 随内容自动增长/收缩高度，到 maxRows 后显示滚动条。
 * 内置 IME 组合输入保护，中文/日文/韩文输入不会闪烁。
 */
export default function AutoResizeTextarea({
  minRows = 2,
  maxRows = 20,
  fullscreenTitle,
  value: externalValue,
  onChange,
  onWheel,
  onBlur,
  disabled,
  className = '',
  ...rest
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const viewerRef = useRef<HTMLTextAreaElement>(null)
  const composingRef = useRef(false)
  const [localValue, setLocalValue] = useState(String(externalValue ?? ''))
  const [fullscreen, setFullscreen] = useState(false)

  // 外部值变化时同步（仅非组合状态）
  useEffect(() => {
    if (!composingRef.current) {
      setLocalValue(String(externalValue ?? ''))
    }
  }, [externalValue])

  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const computed = getComputedStyle(el)
    const lineHeight = parseCssPixels(computed.lineHeight) || 20
    const paddingY = parseCssPixels(computed.paddingTop) + parseCssPixels(computed.paddingBottom)
    const minH = lineHeight * minRows + paddingY
    const maxH = lineHeight * maxRows + paddingY
    const targetH = Math.min(maxH, Math.max(minH, el.scrollHeight))
    el.style.height = `${targetH}px`
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden'
  }, [minRows, maxRows])

  useEffect(() => { resize() }, [localValue, resize])
  useEffect(() => { resize() }, [resize])

  const compositionProps = {
    value: localValue,
    disabled,
    onCompositionStart: () => { composingRef.current = true },
    onCompositionEnd: (e: React.CompositionEvent<HTMLTextAreaElement>) => {
      composingRef.current = false
      const val = (e.target as HTMLTextAreaElement).value
      setLocalValue(val)
      onChange?.({ ...e, target: { ...e.target, value: val } } as unknown as React.ChangeEvent<HTMLTextAreaElement>)
    },
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setLocalValue(e.target.value)
      if (!composingRef.current) {
        onChange?.(e)
      }
    },
    onWheel: (e: React.WheelEvent<HTMLTextAreaElement>) => {
      onWheel?.(e)
      if (!e.defaultPrevented) containTextareaWheel(e)
    },
  }

  const title = fullscreenTitle
    || (typeof rest['aria-label'] === 'string' ? rest['aria-label'] : undefined)
    || (typeof rest.placeholder === 'string' ? rest.placeholder.replace(/…+$/, '').trim() : '')
    || '全屏编辑'

  const closeFullscreen = () => {
    viewerRef.current?.blur()
    setFullscreen(false)
  }

  return (
    <>
      <div className="relative min-w-0 flex-1">
        <textarea
          ref={ref}
          {...rest}
          {...compositionProps}
          onBlur={onBlur}
          className={`w-full resize-none ${className}`}
        />
        {/* 同 FullScreenTextarea：全端统一右下角内嵌全屏入口，底色与框内一致、无边框 */}
        {!disabled && (
          <button
            type="button"
            tabIndex={-1}
            onClick={event => {
              event.preventDefault()
              event.stopPropagation()
              setFullscreen(true)
            }}
            title="点击全屏查看并编辑"
            aria-label="点击全屏查看并编辑"
            className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-md bg-bg-base/85 text-text-muted/70 backdrop-blur-[2px] transition-colors hover:bg-bg-hover hover:text-accent"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <FullScreenViewer
        open={fullscreen}
        title={title}
        subtitle="可直接全屏查看与编辑，点击「完成」返回"
        onClose={closeFullscreen}
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={closeFullscreen}
              className="rounded-md bg-accent px-4 py-2 text-xs text-white hover:bg-accent-hover"
            >
              完成
            </button>
          </div>
        }
      >
        <textarea
          ref={viewerRef}
          {...rest}
          {...compositionProps}
          onBlur={onBlur}
          autoFocus
          className="min-h-[60dvh] w-full resize-none rounded border border-accent/30 bg-bg-base p-3 text-sm leading-relaxed text-text-primary outline-none focus:border-accent"
        />
      </FullScreenViewer>
    </>
  )
}
