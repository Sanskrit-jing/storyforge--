import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronUp, EyeOff, GripVertical, Minus, Pause, Play, SkipBack, SkipForward, Volume2, X } from 'lucide-react'
import type { ReaderSnapshot } from '../../lib/speech/speech-reader'
import { groupVoicesByNaturalness, hasNaturalVoice } from '../../lib/speech/speech-reader'
import { clampReaderBarPosition, type ReaderBarMode, type ReaderBarPosition } from '../../lib/speech/reader-bar'
import { READER_RATES } from '../../lib/speech/reader-settings'

interface Props {
  snapshot: ReaderSnapshot
  /** 系统可用语音（已由调用方过滤为中文语音；0/1 个时不显示选择器） */
  voices: SpeechSynthesisVoice[]
  /** 展示模式：完整条 / 最小化悬浮球 / 隐藏（隐藏由调用方不渲染，此处不出现） */
  mode: ReaderBarMode
  /** 控制条左上角视口坐标；null = 默认底部居中 */
  position: ReaderBarPosition | null
  onModeChange: (mode: ReaderBarMode) => void
  onPositionChange: (position: ReaderBarPosition) => void
  onTogglePause: () => void
  onPrev: () => void
  onNext: () => void
  onStop: () => void
  onRateChange: (rate: number) => void
  onVoiceChange: (voiceURI: string) => void
  /** 试听当前选中语音（样例句）；朗读进行中由调用方忽略 */
  onPreviewVoice: (voiceURI: string) => void
}

/** 拖动期临时状态：抓取点偏移、起点、尺寸、是否超过点击阈值 */
interface BarDragState {
  offsetX: number
  offsetY: number
  startX: number
  startY: number
  width: number
  height: number
  moved: boolean
}

/** 位移超过该阈值（px）才算拖动，否则视为误触点击 */
const DRAG_THRESHOLD = 4

const iconButton = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-primary transition-colors hover:bg-bg-hover disabled:opacity-40'
const utilityButton = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bg-hover'

/**
 * 章节正文朗读控制条：底部居中悬浮胶囊，可拖动到屏幕任意位置（位置记忆）。
 * 三种模式：完整条 / 最小化悬浮球（可暂停、展开、停止）/ 隐藏（由调用方卸载，朗读继续）。
 * 默认位置抬高于 PanelLayout 的「章节」底部胶囊（约 3.75rem + 安全区），两者不重叠；
 * PC（≥1280px）无底部胶囊，朗读条保持同一高度，视觉一致。
 */
export default function ChapterReaderBar({
  snapshot,
  voices,
  mode,
  position,
  onModeChange,
  onPositionChange,
  onTogglePause,
  onPrev,
  onNext,
  onStop,
  onRateChange,
  onVoiceChange,
  onPreviewVoice,
}: Props) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<BarDragState | null>(null)
  const [dragPos, setDragPos] = useState<ReaderBarPosition | null>(null)
  // 语音按自然度分组展示：自然语音（真人感）置顶，其余归「其他语音」组
  const groupedVoices = useMemo(() => groupVoicesByNaturalness(voices), [voices])

  const cycleRate = () => {
    const idx = READER_RATES.indexOf(snapshot.rate as (typeof READER_RATES)[number])
    const nextRate = READER_RATES[(idx + 1) % READER_RATES.length]
    onRateChange(nextRate)
  }

  // 拖动：按住空白处（按钮/下拉除外）；从默认底部居中起拖时先换算为绝对坐标
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('button, select')) return
    const el = shellRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: rect.left,
      startY: rect.top,
      width: rect.width,
      height: rect.height,
      moved: false,
    }
    setDragPos({ x: rect.left, y: rect.top })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const x = event.clientX - drag.offsetX
    const y = event.clientY - drag.offsetY
    if (!drag.moved && Math.abs(x - drag.startX) < DRAG_THRESHOLD && Math.abs(y - drag.startY) < DRAG_THRESHOLD) return
    drag.moved = true
    setDragPos(clampReaderBarPosition({ x, y }, drag.width, drag.height, window.innerWidth, window.innerHeight))
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (!drag.moved) {
      // 未产生位移：还原为默认定位类（视觉坐标不变），不提交位置
      setDragPos(null)
      return
    }
    const el = shellRef.current
    const rect = el?.getBoundingClientRect()
    if (!rect) return
    const final = clampReaderBarPosition({ x: rect.left, y: rect.top }, rect.width, rect.height, window.innerWidth, window.innerHeight)
    onPositionChange(final)
    // 保留 dragPos 至父组件 position 提交（effect 清空），避免闪回默认位置
    setDragPos(final)
  }

  // 父组件提交位置后清空拖动期临时坐标，交给受控 position
  useEffect(() => { setDragPos(null) }, [position])

  // 挂载/窗口尺寸变化时把已定位的控制条钳制回可视区（默认底部居中由 CSS 自适应，无需处理）
  useEffect(() => {
    const clampNow = () => {
      if (!position || dragRef.current) return
      const el = shellRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const clamped = clampReaderBarPosition({ x: rect.left, y: rect.top }, rect.width, rect.height, window.innerWidth, window.innerHeight)
      if (clamped.x !== rect.left || clamped.y !== rect.top) onPositionChange(clamped)
    }
    clampNow()
    window.addEventListener('resize', clampNow)
    return () => window.removeEventListener('resize', clampNow)
  }, [position, onPositionChange])

  if (mode === 'hidden') return null

  const effectivePos = dragPos ?? position
  const positionedStyle = effectivePos ? { left: effectivePos.x, top: effectivePos.y } : undefined
  const shellClass = effectivePos
    ? 'fixed z-30 touch-none select-none'
    : 'fixed bottom-[max(4.75rem,calc(3.875rem+var(--safe-area-inset-bottom,0px)))] left-1/2 z-30 -translate-x-1/2 touch-none select-none'
  const shellProps = {
    ref: shellRef,
    role: 'region' as const,
    'aria-label': '正文朗读控制',
    style: positionedStyle,
    className: shellClass,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
  }

  // 最小化：悬浮小球，保留暂停/展开/停止，可拖动
  if (mode === 'minimized') {
    return (
      <div {...shellProps} className={`${shellClass} cursor-grab rounded-full border border-border bg-bg-elevated/95 shadow-theme-lg backdrop-blur active:cursor-grabbing`}>
        <div className="flex items-center gap-0.5 px-1.5 py-1">
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-transform hover:scale-105"
            onClick={onTogglePause}
            aria-label={snapshot.playing ? '暂停朗读' : '继续朗读'}
          >
            {snapshot.playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>
          <span
            className="min-w-[2.75rem] px-0.5 text-center text-xs text-text-muted"
            title={snapshot.blockTotal > 0 ? `第 ${snapshot.blockIndex + 1} / ${snapshot.blockTotal} 段` : undefined}
          >
            {snapshot.blockTotal > 0 ? `${snapshot.blockIndex + 1}/${snapshot.blockTotal}` : '—'}
          </span>
          <button type="button" className={utilityButton} onClick={() => onModeChange('expanded')} aria-label="展开控制条" title="展开控制条">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button type="button" className={utilityButton} onClick={onStop} aria-label="停止朗读并关闭" title="停止朗读">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  // 完整条：新增拖动把手、最小化与隐藏入口
  return (
    <div
      {...shellProps}
      className={`${shellClass} rounded-2xl border border-border bg-bg-elevated/95 px-2.5 py-2 shadow-theme-lg backdrop-blur sm:px-3`}
    >
      <div className="flex items-center gap-0.5 sm:gap-1.5">
        <span
          className="mr-0.5 flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-full bg-accent/10 text-accent active:cursor-grabbing"
          title="按住拖动移动控制条"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <button type="button" className={iconButton} onClick={onPrev} disabled={snapshot.blockIndex <= 0} aria-label="上一段">
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-transform hover:scale-105"
          onClick={onTogglePause}
          aria-label={snapshot.playing ? '暂停朗读' : '继续朗读'}
        >
          {snapshot.playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>
        <button
          type="button"
          className={iconButton}
          onClick={onNext}
          disabled={snapshot.blockIndex >= snapshot.blockTotal - 1}
          aria-label="下一段"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        <span
          className="mx-1 shrink-0 whitespace-nowrap text-center text-xs text-text-muted"
          title={snapshot.blockTotal > 0 ? `第 ${snapshot.blockIndex + 1} / ${snapshot.blockTotal} 段` : undefined}
        >
          {snapshot.blockTotal > 0 ? `第${snapshot.blockIndex + 1}/${snapshot.blockTotal}段` : '暂无可朗读内容'}
        </span>
        <button
          type="button"
          onClick={cycleRate}
          title="切换语速"
          aria-label={`语速 ${snapshot.rate.toFixed(1)} 倍，点击切换`}
          className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-text-secondary hover:bg-bg-hover"
        >
          {snapshot.rate.toFixed(1)}x
        </button>
        <button type="button" className={utilityButton} onClick={() => onModeChange('minimized')} aria-label="最小化为悬浮球" title="最小化">
          <Minus className="h-4 w-4" />
        </button>
        <button type="button" className={utilityButton} onClick={() => onModeChange('hidden')} aria-label="隐藏控制条，朗读继续，点顶部朗读按钮唤回" title="隐藏（朗读继续，点顶部「朗读」唤回）">
          <EyeOff className="h-4 w-4" />
        </button>
        <button type="button" className={iconButton} onClick={onStop} aria-label="停止朗读并关闭">
          <X className="h-4 w-4" />
        </button>
      </div>
      {voices.length > 1 && (
        <div className="mt-1.5 flex items-center gap-1.5 border-t border-border/60 pt-1.5 sm:gap-2">
          <label htmlFor="sf-reader-voice" className="shrink-0 text-[11px] text-text-muted">语音</label>
          <select
            id="sf-reader-voice"
            value={snapshot.voiceURI}
            onChange={event => onVoiceChange(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-bg-surface px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent"
          >
            <option value="">自动（优先自然语音）</option>
            {groupedVoices.natural.length > 0 && (
              <optgroup label={`自然语音 · 真人感（${groupedVoices.natural.length}）`}>
                {groupedVoices.natural.map(voice => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name}（{voice.lang}）
                  </option>
                ))}
              </optgroup>
            )}
            {groupedVoices.classic.length > 0 && (
              <optgroup label={`其他语音（${groupedVoices.classic.length}）`}>
                {groupedVoices.classic.map(voice => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name}（{voice.lang}）
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            type="button"
            className={utilityButton}
            onClick={() => onPreviewVoice(snapshot.voiceURI)}
            disabled={snapshot.playing}
            aria-label="试听当前选中语音"
            title={snapshot.playing ? '暂停朗读后可试听' : '试听当前选中语音'}
          >
            <Volume2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {voices.length > 0 && !hasNaturalVoice(voices) && (
        <p className="mt-1.5 border-t border-border/60 pt-1.5 text-[11px] leading-4 text-text-muted">
          当前系统语音偏机械。用 Edge 浏览器打开（自带「自然」神经网络人声），或在系统设置中安装「自然」中文语音，听感会更接近真人。
        </p>
      )}
    </div>
  )
}
