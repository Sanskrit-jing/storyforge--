/**
 * 选中文本浮动工具栏 — Phase 24.3
 *
 * 用户选中编辑器中的文字后，弹出浮动工具栏：
 * 润色 / 扩写 / 缩写 / 改写 / 查漏
 *
 * 点击动作后先展开「自定义写作要求」小面板，作者可手动填写本次要求，
 * 也可点「AI 填写要求」让 AI 根据选中文本先拟一条要求，再带要求生成；
 * 留空点「直接生成」则按默认方式处理（保留无要求的快速路径）。
 * 面板内支持 Ctrl/Cmd+Enter 快捷生成。
 */
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Wand2, Expand, Minimize2, RefreshCw, Search, X, Loader2, Check, Sparkles, ChevronLeft, MessageSquareQuote } from 'lucide-react'
import { useAIStream } from '../../hooks/useAIStream'
import { buildPolishPrompt, buildExpandPrompt } from '../../lib/ai/adapters/chapter-adapter'
import { joinPhrase } from '../../lib/phrases/common-phrases'
import { CTextarea } from '../shared/CompositionInput'
import CommonPhrasesPicker from '../shared/CommonPhrasesPicker'
import type { ChatMessage } from '../../lib/types'

interface Props {
  /** 获取当前选中文本 */
  getSelectedText: () => string
  /** 获取选中文本的位置（用于定位工具栏） */
  getSelectionRect: () => DOMRect | null
  /** 替换选中文本 */
  replaceSelectedText: (text: string) => void
  /** STYLE-SHORT-PATH:异步读取作者文风画像（空串=未启用），润色/扩写生成前注入 */
  getStyleContext?: () => Promise<string>
  /** CUSTOM-CONSTRAINT:异步读取作者自定义写法约束段（空串=未配置），润色/扩写生成前注入 */
  getCustomConstraints?: () => Promise<string>
  /** 是否禁用（如正在 AI 生成时） */
  disabled?: boolean
}

type ActionType = 'polish' | 'expand' | 'condense' | 'rewrite' | 'check'

const ACTIONS: { type: ActionType; icon: typeof Wand2; label: string; desc: string }[] = [
  { type: 'polish',   icon: Wand2,      label: '润色', desc: '优化文笔' },
  { type: 'expand',   icon: Expand,     label: '扩写', desc: '丰富细节' },
  { type: 'condense', icon: Minimize2,  label: '缩写', desc: '精简内容' },
  { type: 'rewrite',  icon: RefreshCw, label: '改写', desc: '换种写法' },
  { type: 'check',    icon: Search,     label: '查漏', desc: '检查问题' },
]

export default function FloatingToolbar({
  getSelectedText, getSelectionRect, replaceSelectedText, getStyleContext, getCustomConstraints, disabled,
}: Props) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ top: 8, left: 0 })
  // 视口边缘夹取后的实际 left（初始给 null，首次测量前不渲染位移，避免闪动）
  const [clampedLeft, setClampedLeft] = useState<number | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [selectedText, setSelectedText] = useState('')
  // 手机/HD：动作 -> 自定义要求 两阶段
  const [requirementOpen, setRequirementOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<ActionType | null>(null)
  const [requirement, setRequirement] = useState('')
  // 要求面板打开期间锁定工具条（聚焦输入框会令编辑器选区折叠，不能因此自动隐藏）
  const [pinned, setPinned] = useState(false)
  // 常用语弹层（要求面板内查找填入）
  const [phrasesOpen, setPhrasesOpen] = useState(false)
  const [phrasesBtn, setPhrasesBtn] = useState<HTMLButtonElement | null>(null)
  const ai = useAIStream()
  // 「AI 填写要求」独立一路流，避免与正文生成流的状态互相干扰
  const suggestAI = useAIStream()
  const toolbarRef = useRef<HTMLDivElement>(null)
  // 指针手势状态：拖拽选字进行中不弹工具条（中途弹出会吃掉 pointerup、打断选区）
  const pointerDownRef = useRef(false)
  // pointerdown 落在工具条内时跳过本轮手势评估，保证按钮点击可达
  const toolbarPointerRef = useRef(false)
  // 延迟隐藏计时器：新选区出现时可取消，避免旧计时器误杀刚弹出的工具条
  const hideTimerRef = useRef<number | null>(null)

  // props/状态镜像 ref：document 级监听器只在挂载时绑定一次，回调经 ref 读最新值，
  // 避免内联 props / 状态每次渲染都重挂四个监听器，也避免计时器闭包捕获过时的 pinned/isStreaming
  const getSelectedTextRef = useRef(getSelectedText)
  const getSelectionRectRef = useRef(getSelectionRect)
  const disabledRef = useRef(disabled)
  const isStreamingRef = useRef(ai.isStreaming)
  const pinnedRef = useRef(pinned)
  const resultRef = useRef<string | null>(null)
  getSelectedTextRef.current = getSelectedText
  getSelectionRectRef.current = getSelectionRect
  disabledRef.current = disabled
  isStreamingRef.current = ai.isStreaming
  pinnedRef.current = pinned
  resultRef.current = result

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  useEffect(() => () => clearHideTimer(), [clearHideTimer])

  // 延迟隐藏：触发时复查实时选区，防止双击选词等场景下"塌陷→新选区"的旧计时器把新工具条误杀
  const scheduleHide = useCallback(() => {
    clearHideTimer()
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null
      if (!isStreamingRef.current && !pinnedRef.current && !getSelectedTextRef.current()) setVisible(false)
    }, 200)
  }, [clearHideTimer])

  // 按当前选区评估工具条显隐：有效选区立即弹出，选区塌陷则延迟隐藏
  const evaluateSelection = useCallback(() => {
    if (disabledRef.current || isStreamingRef.current || pinnedRef.current) return
    const text = getSelectedTextRef.current()
    const rect = text && text.length > 1 && text.length < 5000 ? getSelectionRectRef.current() : null
    if (rect) {
      clearHideTimer()
      // 上方空间不足时改在选区下方弹出
      const top = rect.top > 120 ? rect.top - 52 : rect.bottom + 10
      setPosition({
        top: Math.max(8, Math.min(top, window.innerHeight - 120)),
        left: rect.left + rect.width / 2,
      })
      setSelectedText(text)
      setVisible(true)
      setResult(null)
      setRequirementOpen(false)
      setPendingAction(null)
    } else {
      scheduleHide()
    }
  }, [clearHideTimer, scheduleHide])

  useEffect(() => {
    const handleSelectionChange = () => {
      // 指针按下期间（拖拽/滑动手柄选字中）不评估，等松手再弹出
      if (pointerDownRef.current) return
      evaluateSelection()
    }
    const handlePointerDown = (event: Event) => {
      const insideToolbar = !!toolbarRef.current?.contains(event.target as Node)
      toolbarPointerRef.current = insideToolbar
      if (insideToolbar) return
      pointerDownRef.current = true
      // 新手势开始：先收起旧工具条（生成中/已锁定除外），避免挡住新一轮拖拽
      clearHideTimer()
      if (!isStreamingRef.current && !pinnedRef.current) setVisible(false)
    }
    const handlePointerUp = () => {
      if (toolbarPointerRef.current) {
        toolbarPointerRef.current = false
        return
      }
      if (!pointerDownRef.current) return
      pointerDownRef.current = false
      evaluateSelection()
    }
    // 触屏长按选字时系统会接管手势并发 pointercancel：只复位手势状态并走延迟隐藏，
    // 不立即评估——中断后选区可能仍在变化，立即弹出会打断操作（随后 selectionchange 正常评估）
    const handlePointerCancel = () => {
      toolbarPointerRef.current = false
      if (!pointerDownRef.current) return
      pointerDownRef.current = false
      scheduleHide()
    }
    // 滚动 / 视口变化：自由态工具条为 fixed 定位，会与选区错位，直接隐藏；
    // 要求面板（pinned）/ 生成中 / 结果态保留面板，由用户显式关闭
    const handleScrollOrResize = () => {
      if (pointerDownRef.current || pinnedRef.current || isStreamingRef.current) return
      if (resultRef.current != null) return
      setVisible(false)
    }
    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('pointerup', handlePointerUp, true)
    document.addEventListener('pointercancel', handlePointerCancel, true)
    document.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('pointerup', handlePointerUp, true)
      document.removeEventListener('pointercancel', handlePointerCancel, true)
      document.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [evaluateSelection, scheduleHide, clearHideTimer])

  // 视口边缘夹取：工具条按选区中心定位，但不能超出屏幕左右边缘
  useLayoutEffect(() => {
    const el = toolbarRef.current
    if (!el || (!visible && !ai.isStreaming)) return
    const half = el.offsetWidth / 2
    setClampedLeft(Math.min(Math.max(position.left, half + 8), window.innerWidth - half - 8))
  }, [visible, ai.isStreaming, position, requirementOpen, result])

  const buildMessages = (action: ActionType, text: string, customRequirement: string, styleContext?: string, customConstraints?: string): ChatMessage[] => {
    const req = customRequirement.trim()
    switch (action) {
      case 'polish':
        // 复用既有模板；自定义要求拼进 instruction，不改函数签名
        return buildPolishPrompt(
          text,
          req
            ? `优化文笔，使表达更生动优美。作者本次要求：${req}`
            : '优化文笔，使表达更生动优美',
          { styleContext, customConstraints },
        )
      case 'expand':
        // buildExpandPrompt 第二参本就是 userHint，直接承载自定义要求
        return buildExpandPrompt(text, req || undefined, { styleContext, customConstraints })
      case 'condense':
        return [
          { role: 'system', content: `你是一位精炼文字的编辑。请在保留核心意思的前提下，将以下文字压缩到原来的 60-70% 长度。直接输出结果。${req ? `\n作者本次要求：${req}` : ''}` },
          { role: 'user', content: text },
        ]
      case 'rewrite':
        return [
          { role: 'system', content: `你是一位创意写作者。请用完全不同的表达方式改写以下文字，保留核心意思但换种写法。直接输出结果。${req ? `\n作者本次要求：${req}` : ''}` },
          { role: 'user', content: text },
        ]
      case 'check':
        return [
          { role: 'system', content: `你是一位严谨的审稿编辑。请检查以下文字中的问题（逻辑矛盾、用词不当、语法错误、前后不一致等）。用简短的列表指出问题，如果没有问题就说"未发现问题"。${req ? `\n作者本次重点关注：${req}` : ''}` },
          { role: 'user', content: text },
        ]
    }
    // 兜底（类型上 ActionType 已穷尽，正常不可达）
    return []
  }

  const executeAction = async (action: ActionType, customRequirement: string) => {
    if (disabledRef.current || isStreamingRef.current) return
    // pinned 期间选区可能已被用户更换：以实时选区为准生成，避免对旧文本生成
    const liveText = getSelectedTextRef.current()
    const target = liveText || selectedText
    if (!target) return
    if (liveText && liveText !== selectedText) setSelectedText(liveText)
    setRequirementOpen(false)
    setPinned(true)
    // STYLE-SHORT-PATH:生成前读取作者文风画像（未配置/未启用时为空串，不注入）
    const styleContext = getStyleContext ? await getStyleContext() : undefined
    // CUSTOM-CONSTRAINT:生成前读取作者自定义写法约束段（未配置/无启用条目时为空串，不注入）
    const customConstraints = getCustomConstraints ? await getCustomConstraints() : undefined
    const messages = buildMessages(action, target, customRequirement, styleContext, customConstraints)
    const output = await ai.start(messages, undefined, { category: 'chapter.toolbar' })
    if (output) {
      setResult(output)
    } else {
      // 生成失败/被中断：解锁并退回动作行，避免留下一个空白浮层
      setPinned(false)
      setPendingAction(null)
    }
  }

  const handleActionClick = (action: ActionType) => {
    if (disabledRef.current || isStreamingRef.current) return
    setPendingAction(action)
    setRequirement('')
    setPhrasesOpen(false)
    setRequirementOpen(true)
    setPinned(true)
  }

  // 「AI 填写要求」：让 AI 根据选中文本和动作先拟一条具体可执行的写作要求
  const handleAutoFillRequirement = async () => {
    if (!pendingAction || suggestAI.isStreaming) return
    const meta = ACTIONS.find(item => item.type === pendingAction)
    if (!meta) return
    const messages: ChatMessage[] = [
      { role: 'system', content: '你是资深小说编辑。请根据作者选中的文本与准备执行的操作，输出一条具体、可执行的写作要求。只输出要求本身（30-60字，一句话），不要解释、不要引号、不要换行。' },
      { role: 'user', content: `准备执行：${meta.label}（${meta.desc}）\n选中文本：\n${selectedText.slice(0, 1500)}` },
    ]
    const output = await suggestAI.start(messages, undefined, { category: 'chapter.toolbar' })
    if (output) setRequirement(output.trim().replace(/^[「“"']|[」”"']$/g, ''))
  }

  const handleAccept = () => {
    if (!result) return
    // 替换前校验：结果按 selectedText 生成，若当前选区已变（pinned 期间用户重新选区/选区丢失），
    // replaceSelection 会覆盖错误目标或退化为插入，此时保持面板打开、由用户重选后重新生成
    const liveText = getSelectedTextRef.current()
    if (liveText !== selectedText) return
    replaceSelectedText(result)
    setResult(null)
    setVisible(false)
    setPinned(false)
    ai.reset()
  }

  const handleDismiss = () => {
    setResult(null)
    setVisible(false)
    setRequirementOpen(false)
    setPhrasesOpen(false)
    setPendingAction(null)
    setPinned(false)
    ai.reset()
  }

  const backToActions = () => {
    setRequirementOpen(false)
    setPhrasesOpen(false)
    setPendingAction(null)
    setPinned(false)
  }

  // 面板内 Ctrl/Cmd+Enter 快捷生成（聚焦在要求输入框时免去移动鼠标）
  const handleRequirementKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && activeMeta && !ai.isStreaming && !suggestAI.isStreaming) {
      event.preventDefault()
      void executeAction(activeMeta.type, requirement)
    }
  }

  if (!visible && !ai.isStreaming) return null

  const activeMeta = pendingAction ? ACTIONS.find(item => item.type === pendingAction) : null

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 transform -translate-x-1/2"
      style={{
        top: `${position.top}px`,
        left: clampedLeft == null ? '-9999px' : `${clampedLeft}px`,
      }}
    >
      {/* 工具栏按钮行：窄屏允许换行且不被压扁，并做视口边缘夹取 */}
      {!result && !ai.isStreaming && !requirementOpen && (
        <div className="flex max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-0.5 rounded-lg border border-border bg-bg-elevated px-1 py-0.5 shadow-lg">
          {ACTIONS.map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              onClick={() => handleActionClick(type)}
              className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-2 py-1.5 text-xs text-text-secondary transition-colors hover:bg-accent/10 hover:text-accent"
              title={label}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
          <button
            onClick={handleDismiss}
            className="shrink-0 rounded p-1.5 text-text-muted hover:text-text-primary"
            aria-label="关闭"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 自定义写作要求面板（手机竖屏 / HD） */}
      {!result && !ai.isStreaming && requirementOpen && activeMeta && (
        <div className="relative max-h-[70vh] w-[min(92vw,22rem)] overflow-y-auto rounded-lg border border-accent/30 bg-bg-elevated p-2.5 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-text-primary">
              <activeMeta.icon className="h-3.5 w-3.5 shrink-0 text-accent" />
              <span className="truncate">{activeMeta.label} · 本次写作要求</span>
            </div>
            <button
              onClick={backToActions}
              className="flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-text-muted hover:text-text-primary"
              aria-label="返回动作列表"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> 返回
            </button>
          </div>
          <CTextarea
            value={requirement}
            onChange={event => setRequirement(event.target.value)}
            onKeyDown={handleRequirementKeyDown}
            placeholder={`手动填写要求（如：要用打哑谜的感觉，使用古人的说话口吻）；留空则按默认${activeMeta.label}方式生成`}
            rows={3}
            autoFocus
            className="w-full resize-none rounded-md border border-border bg-bg-base px-2 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
          />
          {suggestAI.error && (
            <p className="mt-1 text-[11px] text-error">AI 拟要求失败，可直接手动填写</p>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => void handleAutoFillRequirement()}
                disabled={suggestAI.isStreaming}
                className="flex items-center gap-1 whitespace-nowrap rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
              >
                {suggestAI.isStreaming
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Sparkles className="h-3 w-3" />}
                AI 填写要求
              </button>
              <button
                type="button"
                ref={setPhrasesBtn}
                onMouseDown={event => event.stopPropagation()}
                onClick={() => setPhrasesOpen(open => !open)}
                title="常用语：查找并填入"
                aria-label="插入常用语"
                className={`rounded-md border p-1.5 transition-colors ${
                  phrasesOpen
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-border text-text-muted hover:border-accent/40 hover:text-accent'
                }`}
              >
                <MessageSquareQuote className="h-3 w-3" />
              </button>
            </div>
            <button
              onClick={() => void executeAction(activeMeta.type, requirement)}
              className="flex items-center gap-1 whitespace-nowrap rounded-md bg-accent px-2.5 py-1 text-[11px] text-white hover:bg-accent-hover"
            >
              <Check className="h-3 w-3" />
              {requirement.trim() ? '按要求生成' : '直接生成'}
            </button>
          </div>
          {phrasesOpen && (
            <CommonPhrasesPicker
              anchor={phrasesBtn}
              onInsert={content => setRequirement(prev => joinPhrase(prev, content))}
              onClose={() => setPhrasesOpen(false)}
            />
          )}
        </div>
      )}

      {/* AI 生成中 */}
      {ai.isStreaming && (
        <div className="w-[min(92vw,22rem)] rounded-lg border border-accent/30 bg-bg-elevated px-3 py-2 shadow-lg">
          <div className="flex items-center gap-2 text-xs text-accent">
            <Loader2 className="w-3 h-3 animate-spin" />
            AI 处理中...
          </div>
          {ai.output && (
            <p className="mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap text-xs text-text-secondary">
              {ai.output.slice(0, 200)}{ai.output.length > 200 ? '...' : ''}
            </p>
          )}
        </div>
      )}

      {/* 结果展示 */}
      {result && !ai.isStreaming && (
        <div className="w-[min(92vw,28rem)] rounded-lg border border-border bg-bg-elevated p-3 shadow-lg">
          <p className="mb-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-text-primary">
            {result}
          </p>
          {ai.tokenUsage && (
            <p className="mb-2 text-[10px] text-text-muted">
              Token: ↑{ai.tokenUsage.inputTokens.toLocaleString()} ↓{ai.tokenUsage.outputTokens.toLocaleString()}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button onClick={handleAccept}
              className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-xs text-white hover:bg-accent-hover">
              <Check className="w-3 h-3" /> 替换
            </button>
            <button onClick={handleDismiss}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted hover:bg-bg-hover hover:text-text-primary">
              <X className="w-3 h-3" /> 取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
