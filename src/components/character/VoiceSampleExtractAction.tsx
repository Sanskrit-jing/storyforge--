import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AudioLines, Loader2, X } from 'lucide-react'
import { useAIConfigStore } from '../../stores/ai-config'
import { useProjectStore } from '../../stores/project'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { assembleContext } from '../../lib/registry/assemble-context'
import { adopt } from '../../lib/registry/adopt'
import {
  buildVoiceSampleExtractionPrompt,
  parseVoiceSampleCandidates,
  verifyVoiceSampleCandidates,
  mergeVoiceSamples,
  type VoiceSampleCandidate,
} from '../../lib/ai/adapters/voice-sample-adapter'
import type { Character } from '../../lib/types'

interface Props {
  character: Character
  /** 写回完成后同步父组件表单 */
  onApplied?: (patch: Partial<Character>) => void
}

/**
 * VOICE-SAMPLE「AI 提取声纹」——从该角色已写正文中摘录代表性台词候选。
 * 读 = assembleContext(characterPassages)（正文证据）；写 = 作者勾选后经 adopt() 合并进 voiceSamples。
 * 候选经逐字校验（引文必须原样出现在证据里），未确认的候选不会写库。
 * 弹层 Portal 到 body + fixed 定位锚定触发按钮（滚动/缩放跟随重算），
 * 不受 WorkspacePage overflow 祖先裁剪。
 */
const PANEL_WIDTH = 420

export default function VoiceSampleExtractAction({ character, onApplied }: Props) {
  const currentProjectId = useProjectStore(s => s.currentProjectId)
  const { config: aiConfig } = useAIConfigStore()
  const ai = useAIStream(createAISessionKey(currentProjectId ?? 0, 'character.voice-sample', String(character.id)))
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [candidates, setCandidates] = useState<VoiceSampleCandidate[]>([])
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | undefined>(undefined)

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
    setError(null); setDone(null); setCandidates([]); setChecked(new Set())
    setRunning(true)
    try {
      // 读：该角色在正文中的真实表现（C2 反哺通道，作者已确认的正文召回）
      const passages = await assembleContext({
        projectId: currentProjectId,
        provider: aiConfig.provider,
        model: aiConfig.model,
        subjectCharacterName: character.name,
        sourceKeys: ['characterPassages'],
      })
      const passagesText = passages.text.trim()
      if (!passagesText) {
        setError('该角色还没有正文出场记录；先写几章出现该角色台词的正文，再来提取声纹。')
        return
      }
      const messages = buildVoiceSampleExtractionPrompt({ character, passagesContext: passagesText })
      const text = await ai.start(messages, undefined, { category: 'character.voice-sample', projectId: currentProjectId })
      if (!text) return
      const parsed = parseVoiceSampleCandidates(text)
      if (!parsed.length) {
        setError('AI 没有摘到合适的台词候选，可重试或手动在下方样本框补充。')
        return
      }
      // 逐字校验：引文必须原样出现在证据里，AI 编造的直接过滤
      const verified = verifyVoiceSampleCandidates(parsed, passagesText)
      if (!verified.length) {
        setError('候选台词都未通过逐字校验（可能为 AI 改写而非原话），已全部丢弃；可重试。')
        return
      }
      setCandidates(verified)
      setChecked(new Set(verified.map((_, i) => i)))
      if (verified.length < parsed.length) {
        setDone(`已过滤 ${parsed.length - verified.length} 条非逐字引文。`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  const apply = async () => {
    const picked = candidates.filter((_, i) => checked.has(i))
    if (!picked.length) return
    setError(null)
    try {
      const merged = mergeVoiceSamples(character.voiceSamples, picked)
      await adopt({
        projectId: currentProjectId,
        target: 'characters',
        recordId: character.id!,
        mode: 'merge-diffs',
        data: { voiceSamples: merged },
      })
      onApplied?.({ voiceSamples: merged })
      setDone(`已写入 ${picked.length} 条声纹样本。`)
      setCandidates([])
      setChecked(new Set())
    } catch (e) {
      setError(`写入失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-accent transition-colors"
        title="从已写正文中 AI 摘录该角色的代表性台词（逐字引文），勾选确认后并入声纹样本"
      >
        <AudioLines className="h-3 w-3 shrink-0" /> AI 提取
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          className="fixed z-50 bg-bg-surface border border-border rounded-lg shadow-lg p-3 overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-text-primary">
              AI 提取声纹 · <span className="text-text-secondary">{character.name || '未命名'}</span>
            </div>
            <button onClick={() => setOpen(false)} className="p-0.5 text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-[11px] text-text-muted mb-2">
            AI 从该角色已写正文中逐字摘录代表性台词作为候选；你勾选确认后才会并入上方「声纹样本」，AI 摘录不会被直接采用。
          </p>

          <button
            onClick={() => { void run() }}
            disabled={running || ai.isStreaming}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-accent text-white text-xs rounded disabled:opacity-40 hover:bg-accent-hover"
          >
            {running || ai.isStreaming
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 摘录中…</>
              : <><AudioLines className="w-3.5 h-3.5" /> 从正文提取候选</>}
          </button>

          {error && <div className="mt-2 text-xs text-error">{error}</div>}
          {ai.error && <div className="mt-2 text-xs text-error">{ai.error}</div>}
          {done && <div className="mt-2 text-xs text-success">{done}</div>}

          {candidates.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {candidates.map((c, i) => (
                <label key={i} className="flex items-start gap-2 rounded border border-border bg-bg-base p-2 cursor-pointer hover:border-accent/50">
                  <input
                    type="checkbox"
                    checked={checked.has(i)}
                    onChange={e => {
                      setChecked(prev => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(i); else next.delete(i)
                        return next
                      })
                    }}
                    className="mt-0.5 accent-accent"
                  />
                  <span className="min-w-0 text-[11px] leading-snug">
                    <span className="block text-text-primary">「{c.quote}」</span>
                    {c.chapterTitle && <span className="text-text-muted">——{c.chapterTitle}</span>}
                    {c.reason && <span className="block text-text-muted">{c.reason}</span>}
                  </span>
                </label>
              ))}
              <button
                onClick={() => { void apply() }}
                disabled={checked.size === 0}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-accent/50 text-accent text-xs rounded disabled:opacity-40 hover:bg-accent/10"
              >
                并入声纹样本（已选 {checked.size} 条）
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
