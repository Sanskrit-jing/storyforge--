import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Feather } from 'lucide-react'
import {
  isEmotionExternalizationEnabled,
  isImageryEnabled,
  isSensoryImmersionEnabled,
  setEmotionExternalizationEnabled,
  setImageryEnabled,
  setSensoryImmersionEnabled,
} from '../../lib/ai/writing-preferences'
import { parseCustomConstraints, serializeCustomConstraints } from '../../lib/ai/custom-constraints'
import { useProjectStore } from '../../stores/project'
import { useCreativeRulesStore } from '../../stores/project-singletons'

const PANEL_WIDTH = 288

/**
 * PROSE-CRAFT:写作区快捷开关——章节编辑器顶栏直达「真人感写作约束」三个开关，
 * 以及当前作品的自定义写法约束启停（CUSTOM-CONSTRAINT）。
 * 内置三开关与设置页共用 writing-preferences 同一 localStorage 状态源；
 * 自定义约束与创作规则页共用 useCreativeRulesStore 同一状态源——此处只做
 * 开关启停，增删改仍收敛在创作规则页，不建第二套管理 UI。
 * 弹层 Portal 到 body + fixed 定位锚定触发按钮（滚动/缩放跟随重算），
 * 不受 WorkspacePage overflow 祖先裁剪。
 */
export default function WritingPrefsQuickToggle() {
  const [open, setOpen] = useState(false)
  const [emotion, setEmotion] = useState(isEmotionExternalizationEnabled)
  const [imagery, setImagery] = useState(isImageryEnabled)
  const [immersion, setImmersion] = useState(isSensoryImmersionEnabled)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | undefined>(undefined)
  const projectId = useProjectStore(state => state.currentProjectId)
  const creativeRules = useCreativeRulesStore(state => state.creativeRules)
  const saveCreativeRules = useCreativeRulesStore(state => state.save)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const constraints = parseCustomConstraints(creativeRules?.customConstraints)

  function toggleOpen() {
    // 每次展开时重读状态源，吸收设置页等其它入口的修改
    if (!open) {
      setEmotion(isEmotionExternalizationEnabled())
      setImagery(isImageryEnabled())
      setImmersion(isSensoryImmersionEnabled())
      if (projectId != null) void useCreativeRulesStore.getState().loadAll(projectId)
    }
    setOpen(!open)
  }

  /** 弹层内启停自定义约束条目：走 store.save 写库，创作规则页同源可见 */
  function toggleConstraint(id: string, enabled: boolean) {
    if (projectId == null) return
    const next = parseCustomConstraints(creativeRules?.customConstraints)
      .map(item => (item.id === id ? { ...item, enabled } : item))
    void saveCreativeRules({ projectId, customConstraints: serializeCustomConstraints(next) })
  }

  // fixed 定位：锚定触发按钮，滚动 / 缩放跟随重算
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

  return (
    <>
      <button ref={buttonRef} onClick={toggleOpen}
        title="真人感写作约束（情绪外化 / 画面感 / 代入感）与自定义写法约束"
        aria-pressed={open}
        className={`flex w-full items-center justify-center gap-1 whitespace-nowrap px-2.5 py-1 text-xs rounded-md transition-colors md:px-3 md:py-1.5 xl:w-auto ${
          open
            ? 'bg-accent/10 text-accent'
            : 'bg-bg-elevated text-text-secondary hover:text-text-primary'
        }`}>
        <Feather className="w-3 h-3" />
        写作偏好
      </button>
      {open && createPortal(
        <div ref={panelRef} style={panelStyle}
          className="fixed z-50 overflow-y-auto rounded-lg border border-border bg-bg-elevated p-3 shadow-xl">
          <p className="mb-2 text-xs font-medium text-text-primary">真人感写作约束</p>
          <div className="space-y-2.5">
            <ToggleRow label="情绪外化" description="情绪写成动作/神态/语气，不直接贴「他很生气」式标签"
              checked={emotion}
              onChange={value => { setEmotion(value); setEmotionExternalizationEnabled(value) }} />
            <ToggleRow label="画面感" description="环境/打斗/天象用镜头取景式细节，不做形容词定性"
              checked={imagery}
              onChange={value => { setImagery(value); setImageryEnabled(value) }} />
            <ToggleRow label="代入感" description="用人物感官与留白展示处境，不做旁观者总结"
              checked={immersion}
              onChange={value => { setImmersion(value); setSensoryImmersionEnabled(value) }} />
          </div>
          <p className="mb-2 mt-3 border-t border-border/60 pt-2.5 text-xs font-medium text-text-primary">
            自定义写法约束
          </p>
          {constraints.length === 0 ? (
            <p className="text-[11px] text-text-muted">
              还没有自定义约束，在「创作规则」页可添加场景级写法规则（如追逐戏怎么写）。
            </p>
          ) : (
            <div className="space-y-2.5">
              {constraints.map(item => {
                const summary = item.content.replace(/\s+/g, ' ')
                return (
                  <ToggleRow key={item.id}
                    label={item.title.trim() || '未命名约束'}
                    description={summary.slice(0, 40) + (summary.length > 40 ? '…' : '')}
                    checked={item.enabled}
                    onChange={value => toggleConstraint(item.id, value)} />
                )
              })}
            </div>
          )}
          <p className="mt-2.5 border-t border-border/60 pt-2 text-[11px] text-text-muted">
            对正文生成与改写生效；对话与内心独白不受限。
          </p>
          <p className="mt-1 text-[11px] text-text-muted">
            角色声纹在角色编辑页 → 鲜活细节中设置。
          </p>
        </div>,
        document.body,
      )}
    </>
  )
}

function ToggleRow(props: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span>
        <span className="block text-xs text-text-secondary">{props.label}</span>
        <span className="block text-[11px] text-text-muted">{props.description}</span>
      </span>
      <input type="checkbox" checked={props.checked} onChange={event => props.onChange(event.target.checked)}
        className="mt-0.5 shrink-0 accent-accent" />
    </label>
  )
}
