import {
  ArrowDownToLine,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Globe,
  Loader2,
  Maximize2,
  UserCircle,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type {
  ReverseCharacter,
  ReverseCharacterTextField,
  ReverseResult,
  ReverseStoryCore,
  ReverseWorldview,
} from '../../lib/ai/inspiration-reverse'
import { characterAxesLabel } from '../../lib/character/character-axes'
import { useAIConfigStore } from '../../stores/ai-config'
import { useFieldRegenerate } from '../../hooks/useFieldRegenerate'
import EditableFieldRow from '../shared/EditableFieldRow'
import FullScreenViewer from '../shared/FullScreenViewer'
import { InlineInput } from '../shared/InlineEdit'

/** 行级重生成 props（由 useFieldRegenerate().rowProps 产出） */
interface RegenRowProps {
  onRegenerate: (userHint?: string) => void
  regenerating: boolean
  regenerateError?: string
  onClearRegenerateError: () => void
}

interface Props {
  result: ReverseResult
  projectId?: number | null
  expandedSections: ReadonlySet<string>
  adoptedSections: ReadonlySet<string>
  selectedChars: ReadonlySet<number>
  adopting: boolean
  adoptionLocked?: boolean
  onToggleSection: (key: string) => void
  onToggleCharacter: (index: number) => void
  /** 采纳前手动编辑：修改世界观草稿字段（随 draft 持久化，写入时生效） */
  onUpdateWorldview: (field: keyof ReverseWorldview, value: string) => void
  /** 采纳前手动编辑：修改故事核心字段 */
  onUpdateStoryCore: (field: keyof ReverseStoryCore, value: string) => void
  /** 采纳前手动编辑：修改第 index 个角色的文本字段 */
  onUpdateCharacter: (index: number, field: ReverseCharacterTextField, value: string) => void
  onAdoptWorldview: () => void
  onAdoptStoryCore: () => void
  onAdoptCharacters: () => void
  onAdoptAll: () => void
}

type FullscreenSection = 'worldview' | 'storyCore' | 'characters'

export default function InspirationSingleResult({
  result,
  projectId,
  expandedSections,
  adoptedSections,
  selectedChars,
  adopting,
  adoptionLocked = false,
  onToggleSection,
  onToggleCharacter,
  onUpdateWorldview,
  onUpdateStoryCore,
  onUpdateCharacter,
  onAdoptWorldview,
  onAdoptStoryCore,
  onAdoptCharacters,
  onAdoptAll,
}: Props) {
  const [fullscreen, setFullscreen] = useState<FullscreenSection | null>(null)
  const aiConfig = useAIConfigStore(s => s.config)
  const fieldRegen = useFieldRegenerate({ aiConfig, projectId, category: 'inspiration.reverse' })

  const allAdopted = adoptedSections.has('worldview')
    && adoptedSections.has('storyCore')
    && adoptedSections.has('characters')

  // ── 行级重生成的上下文摘要（保持与整体设定一致）──
  const worldviewContext = `一句话故事：${result.storyCore.logline}\n主题：${result.storyCore.theme}`
  const storyCoreContext = `世界来源：${result.worldview.worldOrigin}`
  const charContext = (char: ReverseCharacter) =>
    `世界来源：${result.worldview.worldOrigin}\n一句话故事：${result.storyCore.logline}\n角色名：${char.name}（简介：${char.shortDescription}）`

  // ── 各分区内容渲染（卡片内嵌与全屏共用同一份）──
  const renderWorldview = () => (
    <div className="space-y-2 text-sm">
      <EditableFieldRow label="世界来源" value={result.worldview.worldOrigin} placeholder="点击编辑…" onChange={v => onUpdateWorldview('worldOrigin', v)}
        {...fieldRegen.rowProps('worldview-worldOrigin', '世界来源', result.worldview.worldOrigin, v => onUpdateWorldview('worldOrigin', v), worldviewContext)} />
      <EditableFieldRow label="力量体系" value={result.worldview.powerHierarchy} placeholder="点击编辑…" onChange={v => onUpdateWorldview('powerHierarchy', v)}
        {...fieldRegen.rowProps('worldview-powerHierarchy', '力量体系', result.worldview.powerHierarchy, v => onUpdateWorldview('powerHierarchy', v), worldviewContext)} />
      <EditableFieldRow label="地貌分布" value={result.worldview.continentLayout} placeholder="点击编辑…" onChange={v => onUpdateWorldview('continentLayout', v)}
        {...fieldRegen.rowProps('worldview-continentLayout', '地貌分布', result.worldview.continentLayout, v => onUpdateWorldview('continentLayout', v), worldviewContext)} />
      <EditableFieldRow label="气候环境" value={result.worldview.climateByRegion} placeholder="点击编辑…" onChange={v => onUpdateWorldview('climateByRegion', v)}
        {...fieldRegen.rowProps('worldview-climateByRegion', '气候环境', result.worldview.climateByRegion, v => onUpdateWorldview('climateByRegion', v), worldviewContext)} />
      <EditableFieldRow label="世界历史" value={result.worldview.historyLine} placeholder="点击编辑…" onChange={v => onUpdateWorldview('historyLine', v)}
        {...fieldRegen.rowProps('worldview-historyLine', '世界历史', result.worldview.historyLine, v => onUpdateWorldview('historyLine', v), worldviewContext)} />
      <EditableFieldRow label="种族民族" value={result.worldview.races} placeholder="点击编辑…" onChange={v => onUpdateWorldview('races', v)}
        {...fieldRegen.rowProps('worldview-races', '种族民族', result.worldview.races, v => onUpdateWorldview('races', v), worldviewContext)} />
      <EditableFieldRow label="势力分布" value={result.worldview.factionLayout} placeholder="点击编辑…" onChange={v => onUpdateWorldview('factionLayout', v)}
        {...fieldRegen.rowProps('worldview-factionLayout', '势力分布', result.worldview.factionLayout, v => onUpdateWorldview('factionLayout', v), worldviewContext)} />
    </div>
  )

  const renderStoryCore = () => (
    <div className="space-y-2 text-sm">
      <EditableFieldRow label="一句话故事" value={result.storyCore.logline} highlight placeholder="点击编辑…" onChange={v => onUpdateStoryCore('logline', v)}
        {...fieldRegen.rowProps('storyCore-logline', '一句话故事', result.storyCore.logline, v => onUpdateStoryCore('logline', v), storyCoreContext)} />
      <EditableFieldRow label="主题" value={result.storyCore.theme} placeholder="点击编辑…" onChange={v => onUpdateStoryCore('theme', v)}
        {...fieldRegen.rowProps('storyCore-theme', '主题', result.storyCore.theme, v => onUpdateStoryCore('theme', v), storyCoreContext)} />
      <EditableFieldRow label="核心冲突" value={result.storyCore.centralConflict} placeholder="点击编辑…" onChange={v => onUpdateStoryCore('centralConflict', v)}
        {...fieldRegen.rowProps('storyCore-centralConflict', '核心冲突', result.storyCore.centralConflict, v => onUpdateStoryCore('centralConflict', v), storyCoreContext)} />
      <EditableFieldRow label="情节模式" value={result.storyCore.plotPattern} placeholder="点击编辑…" onChange={v => onUpdateStoryCore('plotPattern', v)}
        {...fieldRegen.rowProps('storyCore-plotPattern', '情节模式', result.storyCore.plotPattern, v => onUpdateStoryCore('plotPattern', v), storyCoreContext)} />
      <EditableFieldRow label="主线" value={result.storyCore.mainPlot} placeholder="点击编辑…" onChange={v => onUpdateStoryCore('mainPlot', v)}
        {...fieldRegen.rowProps('storyCore-mainPlot', '主线', result.storyCore.mainPlot, v => onUpdateStoryCore('mainPlot', v), storyCoreContext)} />
    </div>
  )

  const renderCharacters = () => (
    <div className="space-y-3">
      {result.characters.map((character, index) => (
        <CharacterCard
          key={index}
          char={character}
          selected={selectedChars.has(index)}
          onToggle={() => onToggleCharacter(index)}
          adopted={adoptedSections.has('characters')}
          onUpdate={field => value => onUpdateCharacter(index, field, value)}
          regen={(field, label, value) =>
            fieldRegen.rowProps(
              `char-${index}-${field}`,
              label,
              value,
              v => onUpdateCharacter(index, field, v),
              charContext(character),
            )}
        />
      ))}
    </div>
  )

  const fullscreenTitle = fullscreen === 'worldview'
    ? '世界观草稿'
    : fullscreen === 'storyCore'
      ? '故事核心'
      : `初始角色（${result.characters.length} 个）`

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">反推结果</h3>
        {!allAdopted && (
          <button
            onClick={onAdoptAll}
            disabled={adopting || adoptionLocked}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-40 transition-colors"
          >
            {adopting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowDownToLine className="w-3 h-3" />}
            {adoptionLocked ? '先确认融合版本' : '一键全部采纳'}
          </button>
        )}
      </div>

      <ResultCard
        title="世界观草稿"
        icon={<Globe className="w-4 h-4 text-blue-500" />}
        expanded={expandedSections.has('worldview')}
        onToggle={() => onToggleSection('worldview')}
        adopted={adoptedSections.has('worldview')}
        onAdopt={onAdoptWorldview}
        adopting={adopting}
        adoptionLocked={adoptionLocked}
        adoptLabel="写入世界观"
        onFullscreen={() => setFullscreen('worldview')}
      >
        {renderWorldview()}
      </ResultCard>

      <ResultCard
        title="故事核心"
        icon={<BookOpen className="w-4 h-4 text-purple-500" />}
        expanded={expandedSections.has('storyCore')}
        onToggle={() => onToggleSection('storyCore')}
        adopted={adoptedSections.has('storyCore')}
        onAdopt={onAdoptStoryCore}
        adopting={adopting}
        adoptionLocked={adoptionLocked}
        adoptLabel="写入故事设计"
        onFullscreen={() => setFullscreen('storyCore')}
      >
        {renderStoryCore()}
      </ResultCard>

      <ResultCard
        title={`初始角色（${result.characters.length} 个）`}
        icon={<UserCircle className="w-4 h-4 text-orange-500" />}
        expanded={expandedSections.has('characters')}
        onToggle={() => onToggleSection('characters')}
        adopted={adoptedSections.has('characters')}
        onAdopt={onAdoptCharacters}
        adopting={adopting}
        adoptionLocked={adoptionLocked}
        adoptLabel={`写入角色库（${selectedChars.size} 个）`}
        onFullscreen={() => setFullscreen('characters')}
      >
        {renderCharacters()}
      </ResultCard>

      <FullScreenViewer
        open={fullscreen !== null}
        title={fullscreenTitle}
        subtitle="反推结果 · 点击文字可直接编辑"
        onClose={() => setFullscreen(null)}
      >
        {fullscreen === 'worldview' && renderWorldview()}
        {fullscreen === 'storyCore' && renderStoryCore()}
        {fullscreen === 'characters' && renderCharacters()}
      </FullScreenViewer>
    </section>
  )
}

function ResultCard({
  title,
  icon,
  expanded,
  onToggle,
  adopted,
  onAdopt,
  adopting,
  adoptionLocked,
  adoptLabel,
  onFullscreen,
  children,
}: {
  title: string
  icon: ReactNode
  expanded: boolean
  onToggle: () => void
  adopted: boolean
  onAdopt: () => void
  adopting: boolean
  adoptionLocked: boolean
  adoptLabel: string
  onFullscreen?: () => void
  children: ReactNode
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-2.5 bg-bg-surface cursor-pointer hover:bg-bg-hover transition-colors"
        onClick={onToggle}
      >
        <div className="flex min-w-0 items-center gap-2">
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-text-muted" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />}
          {icon}
          <span className="truncate text-sm font-medium text-text-primary">{title}</span>
          {onFullscreen && (
            <button
              type="button"
              title="全屏查看"
              aria-label={`全屏查看${title}`}
              onClick={event => {
                event.stopPropagation()
                onFullscreen()
              }}
              className="shrink-0 rounded p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {adopted ? (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Check className="w-3.5 h-3.5" /> 已采纳
          </span>
        ) : (
          <button
            onClick={event => {
              event.stopPropagation()
              onAdopt()
            }}
            disabled={adopting || adoptionLocked}
            className="ml-2 flex shrink-0 items-center gap-1 px-2.5 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-40 transition-colors"
          >
            {adopting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowDownToLine className="w-3 h-3" />}
            {adoptionLocked ? '先确认融合版本' : adoptLabel}
          </button>
        )}
      </div>
      {expanded && <div className="px-4 py-3 border-t border-border">{children}</div>}
    </div>
  )
}

function CharacterCard({
  char,
  selected,
  onToggle,
  adopted,
  onUpdate,
  regen,
}: {
  char: ReverseCharacter
  selected: boolean
  onToggle: () => void
  adopted: boolean
  /** 单个角色字段的编辑入口（已绑定角色下标） */
  onUpdate: (field: ReverseCharacterTextField) => (value: string) => void
  /** 单个角色字段的行级 AI 重生成 props 工厂（已绑定角色下标与上下文） */
  regen?: (field: ReverseCharacterTextField, label: string, value: string) => RegenRowProps
}) {
  return (
    <div className={`border rounded-lg p-3 transition-colors ${selected ? 'border-accent bg-accent/10' : 'border-border'}`}>
      <div className="flex items-center gap-2 mb-2">
        {!adopted && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="accent-accent"
          />
        )}
        <InlineInput
          value={char.name}
          onChange={onUpdate('name')}
          placeholder="角色名"
          className="min-w-0 flex-1 text-sm font-medium text-text-primary"
        />
        <span className="shrink-0 text-xs px-1.5 py-0.5 bg-bg-hover rounded text-text-muted">
          {characterAxesLabel(char)}
        </span>
      </div>
      <div className="space-y-1">
        <EditableFieldRow label="简介" compact displayClassName="!text-xs !text-accent" value={char.shortDescription} placeholder="点击编辑…" onChange={onUpdate('shortDescription')}
          {...regen?.('shortDescription', '简介', char.shortDescription)} />
        <EditableFieldRow label="性格" compact value={char.personality} placeholder="点击编辑…" onChange={onUpdate('personality')}
          {...regen?.('personality', '性格', char.personality)} />
        <EditableFieldRow label="动机" compact value={char.motivation} placeholder="点击编辑…" onChange={onUpdate('motivation')}
          {...regen?.('motivation', '动机', char.motivation)} />
        <EditableFieldRow label="背景" compact value={char.background} placeholder="点击编辑…" onChange={onUpdate('background')}
          {...regen?.('background', '背景', char.background)} />
        <EditableFieldRow label="弧光" compact value={char.arc} placeholder="点击编辑…" onChange={onUpdate('arc')}
          {...regen?.('arc', '弧光', char.arc)} />
      </div>
    </div>
  )
}
