import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { Copy, Loader2, Plus } from 'lucide-react'
import {
  filterPhrases,
  readAllPhrases,
} from '../../lib/phrases/common-phrases'
import type { CommonPhraseEntry } from '../../lib/types'
import { copyText } from '../../lib/utils/clipboard'
import { useToast } from './Toast'

interface Props {
  /**
   * 提供时点击条目把内容填入宿主输入框（要求面板 / AI 助手输入框）；
   * 不提供时点击条目直接复制（首页 / 侧边栏等无输入框场景）。
   */
  onInsert?: (content: string) => void
  onClose: () => void
  /**
   * 触发按钮元素：提供后弹层 Portal 到 body 并以按钮为锚做 fixed 定位
   * （优先在按钮上方弹出，空间不足自动翻到下方），不受 overflow 祖先裁剪。
   */
  anchor?: HTMLElement | null
  /** fixed 定位下弹层与按钮的水平对齐边；默认 'left' */
  align?: 'left' | 'right'
}

const PICKER_WIDTH = 288

/**
 * PHRASE-1 常用语查找弹层（共享组件）。
 * 查找框 + 计分排序列表；点击条目填入（无 onInsert 时复制），
 * 条目右侧复制按钮始终可复制。Esc / 点击外部关闭。
 * 注意：宿主的触发按钮需在 onMouseDown 中 stopPropagation，否则打开后立即被外点关闭。
 */
export default function CommonPhrasesPicker({ onInsert, onClose, anchor, align = 'left' }: Props) {
  const toast = useToast()
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  const [entries, setEntries] = useState<CommonPhraseEntry[] | null>(null)
  const [query, setQuery] = useState('')
  const [fixedStyle, setFixedStyle] = useState<React.CSSProperties | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    readAllPhrases()
      .then(list => { if (!cancelled) setEntries(list) })
      .catch(reason => {
        if (cancelled) return
        setEntries([])
        toast.error(reason instanceof Error ? reason.message : String(reason))
      })
    return () => { cancelled = true }
    // 仅挂载时读取一次；toast 引用稳定，不参与依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // fixed 定位：锚定触发按钮，滚动 / 缩放跟随重算，防被 overflow 祖先或视口裁剪
  useEffect(() => {
    if (!anchor) return
    const place = () => {
      const rect = anchor.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return
      const width = Math.min(PICKER_WIDTH, window.innerWidth - 16)
      const spaceAbove = rect.top - 8
      const spaceBelow = window.innerHeight - rect.bottom - 8
      // 优先在按钮上方弹出（与原 bottom-full 语义一致），上方放不下且下方更宽敞时翻转到下方
      const openBelow = spaceAbove < 240 && spaceBelow > spaceAbove
      const rawLeft = align === 'right' ? rect.right - width : rect.left
      const left = Math.min(Math.max(8, rawLeft), window.innerWidth - width - 8)
      setFixedStyle(openBelow
        ? { left, top: rect.bottom + 8, width }
        : { left, bottom: window.innerHeight - rect.top + 8, width })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor, align])

  // 点击外部 / Esc 关闭
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const filtered = useMemo(
    () => filterPhrases(entries ?? [], query),
    [entries, query],
  )

  const copy = async (entry: CommonPhraseEntry) => {
    const ok = await copyText(entry.content)
    if (ok) toast.success('常用语已复制')
    else toast.error('复制失败，请长按文本手动复制')
  }

  const pick = (entry: CommonPhraseEntry) => {
    if (onInsert) {
      onInsert(entry.content)
      onClose()
    } else {
      void copy(entry)
    }
  }

  const panel = (
    <div
      ref={rootRef}
      className={`z-50 w-72 rounded-lg border border-border bg-bg-elevated shadow-lg ${anchor ? 'fixed' : ''}`}
      style={fixedStyle}
    >
      <div className="border-b border-border p-2">
        <input
          autoFocus
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && filtered.length) {
              event.preventDefault()
              pick(filtered[0])
            }
          }}
          placeholder="查找常用语（按标题或内容）…"
          className="w-full rounded border border-border bg-bg-base px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
        />
      </div>

      <div className="max-h-56 overflow-y-auto">
        {entries === null ? (
          <p className="flex items-center justify-center gap-2 py-6 text-xs text-text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> 正在读取…
          </p>
        ) : !entries.length ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-text-muted">还没有常用语</p>
            <button
              type="button"
              onClick={() => { onClose(); navigate('/phrases') }}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
            >
              <Plus className="h-3 w-3" /> 去常用语页添加
            </button>
          </div>
        ) : !filtered.length ? (
          <p className="px-3 py-6 text-center text-xs text-text-muted">没有匹配的常用语</p>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map(entry => (
              <div key={entry.id} className="flex items-start gap-1 px-2 py-1.5 hover:bg-bg-hover">
                <button
                  type="button"
                  onClick={() => pick(entry)}
                  className="min-w-0 flex-1 text-left"
                  title={onInsert ? '点击填入' : '点击复制'}
                >
                  <span className="block truncate text-xs font-medium text-text-primary">
                    {entry.title}
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-text-muted">
                    {entry.content}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`复制 ${entry.title}`}
                  onClick={() => void copy(entry)}
                  className="shrink-0 rounded p-1 text-text-muted hover:bg-bg-base hover:text-accent"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border px-2 py-1.5 text-[10px] text-text-muted">
        {onInsert ? '点击条目填入，右侧按钮复制' : '点击条目复制'}
      </div>
    </div>
  )

  return anchor ? createPortal(panel, document.body) : panel
}
