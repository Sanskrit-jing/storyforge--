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
import EditableFieldRow from '../shared/EditableFieldRow'
import FullScreenViewer from '../shared/FullScreenViewer'
import { InlineInput } from '../shared/InlineEdit'

interface Props {
  result: ReverseResult
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

  const allAdopted = adoptedSections.has('worldview')
    && adoptedSections.has('storyCore')
    && adoptedSections.has('characters')

  // ── 各分区内容渲染（卡片内嵌与全屏共用同一份）──
  const renderWorldview = () => (
    <div className="space-y-2 text-sm">
      <EditableFieldRow label="世界来源" value={result.worldview.worldOrigin} placeholder="点击编辑…" onChange={v => onUpdateWorldview('worldOrigin', v)} />
      <EditableFieldRow label="力量体系" value={result.worldview.powerHierarchy} placeholder="点击编辑…" onChange={v => onUpdateWorldview('powerHierarchy', v)} />
      <EditableFieldRow label="地貌分布" value={result.worldview.continentLayout} placeholder="点击编辑…" onChange={v => onUpdateWorldview('continentLayout', v)} />
      <EditableFieldRow label="气候环境" value={result.worldview.climateByRegion} placeholder="点击编辑…" onChange={v => onUpdateWorldview('climateByRegion', v)} />
      <EditableFieldRow label="世界历史" value={result.worldview.historyLine} placeholder="点击编辑…" onChange={v => onUpdateWorldview('historyLine', v)} />
      <EditableFieldRow label="种族民族" value={result.worldview.races} placeholder="点击编辑…" onChange={v => onUpdateWorldview('races', v)} />
      <EditableFieldRow label="势力分布" value={result.worldview.factionLayout} placeholder="点击编辑…" onChange={v => onUpdateWorldview('factionLayout', v)} />
    </div>
  )

  const renderStoryCore = () => (
    <div className="space-y-2 text-sm">
      <EditableFieldRow label="一句话故事" value={result.storyCore.logline} highlight placeholder="点击编辑…" onChange={v => onUpdateStoryCore('logline', v)} />
      <EditableFieldRow label="主题" value={result.storyCore.theme} placeholder="点击编辑…" onChange={v => onUpdateStoryCore('theme', v)} />
      <EditableFieldRow label="核心冲突" value={result.storyCore.centralConflict} placeholder="点击编辑…" onChange={v => onUpdateStoryCore('centralConflict', v)} />
      <EditableFieldRow label="情节模式" value={result.storyCore.plotPattern} placeholder="点击编辑…" onChange={v => onUpdateStoryCore('plotPattern', v)} />
      <EditableFieldRow label="主线" value={result.storyCore.mainPlot} placeholder="点击编辑…" onChange={v => onUpdateStoryCore('mainPlot', v)} />
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
}: {
  char: ReverseCharacter
  selected: boolean
  onToggle: () => void
  adopted: boolean
  /** 单个角色字段的编辑入口（已绑定角色下标） */
  onUpdate: (field: ReverseCharacterTextField) => (value: string) => void
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
        <EditableFieldRow label="简介" compact displayClassName="!text-xs !text-accent" value={char.shortDescription} placeholder="点击编辑…" onChange={onUpdate('shortDescription')} />
        <EditableFieldRow label="性格" compact value={char.personality} placeholder="点击编辑…" onChange={onUpdate('personality')} />
        <EditableFieldRow label="动机" compact value={char.motivation} placeholder="点击编辑…" onChange={onUpdate('motivation')} />
        <EditableFieldRow label="背景" compact value={char.background} placeholder="点击编辑…" onChange={onUpdate('background')} />
        <EditableFieldRow label="弧光" compact value={char.arc} placeholder="点击编辑…" onChange={onUpdate('arc')} />
      </div>
    </div>
  )
}
