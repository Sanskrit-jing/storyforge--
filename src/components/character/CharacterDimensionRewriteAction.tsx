import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, RefreshCw, Sparkles, X } from 'lucide-react'
import { useAIConfigStore } from '../../stores/ai-config'
import { useProjectStore } from '../../stores/project'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { assembleContext } from '../../lib/registry/assemble-context'
import { adopt } from '../../lib/registry/adopt'
import {
  buildCharacterRewritePrompt,
  parseCharacterRewrite,
} from '../../lib/ai/adapters/character-rewrite-adapter'
import { CHARACTER_DIMENSIONS, type CharacterDimensionKey } from '../../lib/character/character-dimensions'
import type { Character } from '../../lib/types'

const PANEL_WIDTH = 420

interface Props {
  character: Character
  dimensionKey: CharacterDimensionKey
  /** 替换成功后同步父组件表单 */
  onApplied?: (patch: Partial<Character>) => void
}

/**
 * CHARACTER-REWRITE「AI 重写」——作者对某维度已有内容不满意（如金手指不喜欢），
 * 输入自己的要求让 AI 重新生成该维度内容。
 * 读 = assembleContext(世界观/力量体系等) + 角色其它已有设定；
 * 写 = 作者预览（可改）并点击替换后,经 adopt({ target:'characters', recordId }) 定点写回该维度,
 * AI 生成内容不会被直接采用。当前内容不满足要求时原有内容保持不变。
 * 弹层 Portal 到 body + fixed 定位锚定触发按钮，不受 WorkspacePage overflow 祖先裁剪。
 */
export default function CharacterDimensionRewriteAction({ character, dimensionKey, onApplied }: Props) {
  const currentProjectId = useProjectStore(s => s.currentProjectId)
  const { config: aiConfig } = useAIConfigStore()
  const ai = useAIStream(createAISessionKey(currentProjectId ?? 0, 'character.rewrite', `${character.id ?? 'draft'}:${dimensionKey}`))
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [hint, setHint] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | undefined>(undefined)

  const label = CHARACTER_DIMENSIONS.find(d => d.key === dimensionKey)?.label ?? dimensionKey

  // fixed 定位：锚定触发按钮，滚动 / 缩放跟随重算（早退分支之前调用，遵守 hooks 顺序）
  useEffect(() => {
    if (!open) return
    const place = () => {
      const button = buttonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      const width = Math.min(PANEL_WIDTH, window.innerWidth - 16)
      const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8)
      setPanelStyle({ left, top: rect.bottom + 6, width, maxHeight: window.innerHeight - rect.bottom - 16 })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  // 点击外部 / Esc 关闭
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (panelRef.current && !panelRef.current.contains(target)
        && buttonRef.current && !buttonRef.current.contains(target)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (currentProjectId == null || character.id == null) return null

  const run = async () => {
    if (running || ai.isStreaming) return
    setError(null); setPreview(null)
    setRunning(true)
    try {
      // 读：世界观/力量体系等上下文（角色其它设定由 prompt 直接带，不重复注入 characters 源）
      const assembled = await assembleContext({
        projectId: currentProjectId,
        worldGroupId: character.homeWorldGroupId ?? null,
        provider: aiConfig.provider,
        model: aiConfig.model,
        sourceKeys: ['canonAssertions', 'worldview', 'storyCore', 'powerSystem'],
      })
      const messages = buildCharacterRewritePrompt({
        character,
        dimensionKey,
        worldContext: assembled.text,
        userHint: hint,
      })
      const text = await ai.start(messages, undefined, { category: 'character.rewrite', projectId: currentProjectId })
      if (!text) return
      const parsed = parseCharacterRewrite(text)
      if (!parsed) {
        setError('AI 没有返回有效内容，可重试。')
        return
      }
      setPreview(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  const apply = async () => {
    const next = preview?.trim()
    if (!next || character.id == null) return
    setError(null)
    try {
      await adopt({
        projectId: currentProjectId,
        worldGroupId: character.homeWorldGroupId ?? null,
        target: 'characters',
        recordId: character.id,
        mode: 'merge-diffs',
        data: { [dimensionKey]: next },
      })
      onApplied?.({ [dimensionKey]: next } as Partial<Character>)
      setPreview(null)
      setHint('')
      setOpen(false)
    } catch (e) {
      setError(`写入失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-0.5 text-[10px] text-text-muted/70 hover:text-accent transition-colors"
        title={`AI 按你的要求重写「${label}」——不喜欢 AI 生成的内容时，写明要求让它重新生成`}
      >
        <Sparkles className="h-3 w-3 shrink-0" /> AI 重写
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          className="fixed z-50 bg-bg-surface border border-border rounded-lg shadow-lg p-3 overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-text-primary">
              AI 重写「{label}」 · <span className="text-text-secondary">{character.name || '未命名'}</span>
            </div>
            <button onClick={() => setOpen(false)} className="p-0.5 text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-[11px] text-text-muted mb-2">
            写下你的要求（怎么改、哪里不满意），AI 会参考角色其它设定与世界观重新生成；结果先预览、可再改，点「替换」后才会写入，不满意可反复重试。
          </p>

          <textarea
            value={hint}
            onChange={e => setHint(e.target.value)}
            rows={2}
            placeholder={`你的要求，如：金手指不要太逆天，前期只能被动触发、有明确代价；留空则让 AI 换个思路重新生成…`}
            className="w-full px-2 py-1.5 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent resize-y"
          />

          <button
            onClick={() => { void run() }}
            disabled={running || ai.isStreaming}
            className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-accent text-white text-xs rounded disabled:opacity-40 hover:bg-accent-hover"
          >
            {running || ai.isStreaming
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 生成中…</>
              : <><Sparkles className="w-3.5 h-3.5" /> {preview != null ? '按要求重新生成' : '生成新内容'}</>}
          </button>

          {(ai.isStreaming || (running && preview == null)) && (
            <div className="mt-2 max-h-32 overflow-y-auto text-[11px] text-text-muted whitespace-pre-wrap bg-bg-base border border-border rounded p-2">
              {ai.output || '正在生成…'}
            </div>
          )}

          {preview != null && (
            <div className="mt-2">
              <div className="mb-1 text-[11px] text-text-muted">生成结果（可直接修改后再替换）：</div>
              <textarea
                value={preview}
                onChange={e => setPreview(e.target.value)}
                rows={5}
                className="w-full px-2 py-1.5 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent resize-y"
              />
              <div className="mt-1.5 flex gap-2">
                <button
                  onClick={() => { void apply() }}
                  disabled={!preview.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 border border-accent/50 text-accent text-xs rounded disabled:opacity-40 hover:bg-accent/10"
                >
                  替换「{label}」
                </button>
                <button
                  onClick={() => { void run() }}
                  disabled={running || ai.isStreaming}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-text-secondary hover:text-accent disabled:opacity-40"
                  title="对结果不满意？可补充/修改要求后重新生成"
                >
                  <RefreshCw className="w-3 h-3" /> 重新生成
                </button>
              </div>
            </div>
          )}

          {error && <div className="mt-2 text-xs text-error">{error}</div>}
          {ai.error && <div className="mt-2 text-xs text-error">{ai.error}</div>}
        </div>,
        document.body,
      )}
    </>
  )
}
