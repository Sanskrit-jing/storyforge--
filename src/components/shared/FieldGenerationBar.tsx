/**
 * 字段级 AI 生成操作行（世界观/故事核心等面板统一复用）
 *
 * 布局策略（一套断点，结构性变化只发生在 <1280px 的手机竖屏与 HD 版）：
 * - 手机竖屏 / HD：第一行放「扩写/重写/润色」标签页与「AI 生成」按钮，
 *   第二行整行放「给 AI 的补充说明」输入框（右侧带全屏编辑入口），
 *   避免多个固定宽度控件被压成一字一行的竖排文字。
 * - PC（≥1280px，xl）：保持历史的单行结构——标签页 | 补充说明(flex-1) | 生成按钮。
 */
import { useState } from 'react'
import { Sparkles, Maximize2 } from 'lucide-react'
import type { FieldGenerationMode } from '../../lib/ai/field-generation-context'
import AIFieldModeTabs from './AIFieldModeTabs'
import FullScreenViewer from './FullScreenViewer'
import { CInput, CTextarea } from './CompositionInput'

interface Props {
  mode: FieldGenerationMode
  onModeChange: (mode: FieldGenerationMode) => void
  /** 补充说明文本 */
  hint: string
  onHintChange: (hint: string) => void
  /** 点击 AI 生成 */
  onGenerate: () => void
  generating?: boolean
  /** 生成按钮文案（如「AI 生成信仰体系」），默认「AI 生成」 */
  generateLabel?: string
  /** 补充说明占位文案 */
  hintPlaceholder?: string
  /** 生成按钮视觉：soft=淡棕强调（默认），outline=描边次级按钮（故事核心面板沿用历史样式） */
  variant?: 'soft' | 'outline'
}

export default function FieldGenerationBar({
  mode,
  onModeChange,
  hint,
  onHintChange,
  onGenerate,
  generating = false,
  generateLabel = 'AI 生成',
  hintPlaceholder = '给 AI 的补充说明（可选）',
  variant = 'soft',
}: Props) {
  const [hintFullscreen, setHintFullscreen] = useState(false)

  const buttonClass = variant === 'outline'
    ? 'flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm rounded-md bg-bg-elevated text-text-secondary border border-border hover:text-accent hover:border-accent/50 transition-colors disabled:opacity-50'
    : 'flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-xs rounded bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50'

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* 模式切换：手机/HD 第二行让位给补充说明；PC 回到行内 */}
        <div className="order-1">
          <AIFieldModeTabs value={mode} onChange={onModeChange} />
        </div>
        {/* 生成按钮：手机/HD 与标签页同一行并靠右；PC 回到行尾 */}
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className={`order-2 ml-auto whitespace-nowrap xl:ml-0 xl:order-none ${buttonClass}`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {generateLabel}
        </button>
        {/* 补充说明：手机/HD 独占整行；PC 行内自适应 */}
        <div className="relative order-3 w-full min-w-0 xl:order-none xl:w-auto xl:flex-1">
          <CInput
            value={hint}
            onChange={e => onHintChange(e.target.value)}
            placeholder={hintPlaceholder}
            aria-label="给 AI 的补充说明"
            className="w-full min-w-0 rounded border border-border bg-bg-base px-2 py-1.5 pr-8 text-xs text-text-primary focus:border-accent focus:outline-none xl:pr-2"
          />
          {/* 手机/HD：展开为全屏长文本输入；PC 不需要，保持隐藏 */}
          <button
            type="button"
            onClick={() => setHintFullscreen(true)}
            title="全屏输入补充说明"
            aria-label="全屏输入补充说明"
            className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-text-muted hover:bg-bg-hover hover:text-accent xl:hidden"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <FullScreenViewer
        open={hintFullscreen}
        title="给 AI 的补充说明"
        subtitle="这里写给 AI 的额外要求，仅影响本次生成"
        onClose={() => setHintFullscreen(false)}
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setHintFullscreen(false)}
              className="rounded-md bg-accent px-4 py-2 text-xs text-white hover:bg-accent-hover"
            >
              完成
            </button>
          </div>
        }
      >
        <CTextarea
          value={hint}
          onChange={e => onHintChange(e.target.value)}
          placeholder="输入你对本次 AI 生成的补充要求，例如：风格、要避开的桥段、必须包含的设定点……"
          className="min-h-[60dvh] w-full resize-none rounded border border-accent/30 bg-bg-base p-3 text-sm leading-relaxed text-text-primary outline-none focus:border-accent"
        />
      </FullScreenViewer>
    </>
  )
}
