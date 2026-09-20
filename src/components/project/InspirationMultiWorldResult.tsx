import { ArrowDownToLine, BookOpen, Check, Globe, Loader2, Maximize2, UserCircle } from 'lucide-react'
import { useState } from 'react'
import type {
  ReverseCharacterMW,
  ReverseCharacterTextField,
  ReverseMultiWorldResult,
  ReverseStoryCore,
  ReverseWorldTextField,
} from '../../lib/ai/inspiration-reverse'
import { characterAxesLabel } from '../../lib/character/character-axes'
import EditableFieldRow from '../shared/EditableFieldRow'
import FullScreenViewer from '../shared/FullScreenViewer'
import { InlineInput } from '../shared/InlineEdit'

interface Props {
  result: ReverseMultiWorldResult
  adopted: boolean
  adopting: boolean
  adoptionLocked?: boolean
  onAdopt: () => void
  /** 采纳前手动编辑：修改故事主线字段（随 draft 持久化，写入时生效） */
  onUpdateStoryCore: (field: keyof ReverseStoryCore, value: string) => void
  /** 采纳前手动编辑：修改第 index 个世界的文本字段（含名称，排除枚举 type） */
  onUpdateWorld: (index: number, field: ReverseWorldTextField, value: string) => void
  /** 采纳前手动编辑：修改第 index 个角色的文本字段 */
  onUpdateCharacter: (index: number, field: ReverseCharacterTextField, value: string) => void
}

type FullscreenSection = 'storyCore' | 'characters' | number

const WORLD_COMPACT_FIELDS: Array<{ field: ReverseWorldTextField; label: string }> = [
  { field: 'worldOrigin', label: '世界来源' },
  { field: 'powerHierarchy', label: '力量体系' },
  { field: 'factionLayout', label: '势力分布' },
  { field: 'entryCondition', label: '进入条件' },
  { field: 'powerRestriction', label: '能力限制' },
]

const WORLD_FULL_FIELDS: Array<{ field: ReverseWorldTextField; label: string }> = [
  { field: 'worldOrigin', label: '世界来源' },
  { field: 'powerHierarchy', label: '力量体系' },
  { field: 'continentLayout', label: '地貌分布' },
  { field: 'climateByRegion', label: '气候环境' },
  { field: 'historyLine', label: '世界历史' },
  { field: 'races', label: '种族民族' },
  { field: 'factionLayout', label: '势力分布' },
  { field: 'entryCondition', label: '进入条件' },
  { field: 'powerRestriction', label: '能力限制' },
]

const CHARACTER_FULL_FIELDS: Array<{ field: ReverseCharacterTextField; label: string }> = [
  { field: 'shortDescription', label: '简介' },
  { field: 'personality', label: '性格' },
  { field: 'motivation', label: '动机' },
  { field: 'background', label: '背景' },
  { field: 'arc', label: '弧光' },
  { field: 'homeWorld', label: '所属世界' },
]

export default function InspirationMultiWorldResult({
  result,
  adopted,
  adopting,
  adoptionLocked = false,
  onAdopt,
  onUpdateStoryCore,
  onUpdateWorld,
  onUpdateCharacter,
}: Props) {
  const [fullscreen, setFullscreen] = useState<FullscreenSection | null>(null)

  const fullscreenTitle = fullscreen === 'storyCore'
    ? '故事主线'
    : fullscreen === 'characters'
      ? `初始角色（${result.characters.length} 个）`
      : typeof fullscreen === 'number' && result.worlds[fullscreen]
        ? (result.worlds[fullscreen].name || `世界 ${fullscreen + 1}`)
        : ''

  const fullscreenSubtitle = typeof fullscreen === 'number'
    ? '世界草稿 · 点击文字可直接编辑'
    : '反推结果 · 点击文字可直接编辑'

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">多世界反推结果（{result.worlds.length} 个世界）</h3>
        <button
          onClick={onAdopt}
          disabled={adopting || adopted || adoptionLocked}
          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-40 transition-colors"
        >
          {adopting ? <Loader2 className="w-3 h-3 animate-spin" /> : adopted ? <Check className="w-3 h-3" /> : <ArrowDownToLine className="w-3 h-3" />}
          {adopted ? '已采纳' : adoptionLocked ? '先确认融合版本' : '一键创建多世界'}
        </button>
      </div>

      <div className="bg-bg-surface border border-border rounded-lg p-3 space-y-1 text-sm">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
            <BookOpen className="w-3.5 h-3.5" /> 故事主线
          </div>
          <FullscreenButton title="全屏查看故事主线" onClick={() => setFullscreen('storyCore')} />
        </div>
        <EditableFieldRow label="一句话" value={result.storyCore.logline} highlight placeholder="点击编辑…" onChange={v => onUpdateStoryCore('logline', v)} />
        <EditableFieldRow label="主线" value={result.storyCore.mainPlot} placeholder="点击编辑…" onChange={v => onUpdateStoryCore('mainPlot', v)} />
        <EditableFieldRow label="核心冲突" value={result.storyCore.centralConflict} placeholder="点击编辑…" onChange={v => onUpdateStoryCore('centralConflict', v)} />
      </div>

      {result.worlds.map((world, index) => (
        <div key={index} className="bg-bg-surface border border-border rounded-lg p-3 space-y-1 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-3.5 h-3.5 shrink-0 text-text-secondary" />
            <InlineInput
              value={world.name}
              onChange={v => onUpdateWorld(index, 'name', v)}
              placeholder="世界名称"
              className="min-w-0 flex-1 text-sm font-medium text-text-primary"
            />
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-bg-elevated text-text-muted">{world.type}</span>
            <FullscreenButton title="全屏查看该世界" onClick={() => setFullscreen(index)} />
          </div>
          {WORLD_COMPACT_FIELDS.map(({ field, label }) => (
            <EditableFieldRow
              key={field}
              label={label}
              value={world[field]}
              placeholder="点击编辑…"
              onChange={v => onUpdateWorld(index, field, v)}
            />
          ))}
        </div>
      ))}

      {result.characters.length > 0 && (
        <div className="bg-bg-surface border border-border rounded-lg p-3 space-y-1.5 text-sm">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
              <UserCircle className="w-3.5 h-3.5" /> 初始角色（{result.characters.length}）
            </div>
            <FullscreenButton title="全屏查看初始角色" onClick={() => setFullscreen('characters')} />
          </div>
          {result.characters.map((character, index) => (
            <CharacterRow
              key={index}
              character={character}
              onUpdate={field => value => onUpdateCharacter(index, field, value)}
            />
          ))}
        </div>
      )}

      {adopted && (
        <p className="text-xs text-green-400">
          ✓ 已创建 {result.worlds.length} 个世界。前往「世界总览」查看，或在世界观面板切换世界编辑。
        </p>
      )}

      <FullScreenViewer
        open={fullscreen !== null}
        title={fullscreenTitle}
        subtitle={fullscreenSubtitle}
        onClose={() => setFullscreen(null)}
      >
        {fullscreen === 'storyCore' && (
          <div className="space-y-2 text-sm">
            <EditableFieldRow label="一句话故事" value={result.storyCore.logline} highlight placeholder="点击编辑…" onChange={v => onUpdateStoryCore('logline', v)} />
            <EditableFieldRow label="主题" value={result.storyCore.theme} placeholder="点击编辑…" onChange={v => onUpdateStoryCore('theme', v)} />
            <EditableFieldRow label="核心冲突" value={result.storyCore.centralConflict} placeholder="点击编辑…" onChange={v => onUpdateStoryCore('centralConflict', v)} />
            <EditableFieldRow label="情节模式" value={result.storyCore.plotPattern} placeholder="点击编辑…" onChange={v => onUpdateStoryCore('plotPattern', v)} />
            <EditableFieldRow label="主线" value={result.storyCore.mainPlot} placeholder="点击编辑…" onChange={v => onUpdateStoryCore('mainPlot', v)} />
          </div>
        )}
        {typeof fullscreen === 'number' && result.worlds[fullscreen] !== undefined && (
          <div className="space-y-2 text-sm">
            {WORLD_FULL_FIELDS.map(({ field, label }) => (
              <EditableFieldRow
                key={field}
                label={label}
                value={result.worlds[fullscreen][field]}
                placeholder="点击编辑…"
                onChange={v => onUpdateWorld(fullscreen, field, v)}
              />
            ))}
          </div>
        )}
        {fullscreen === 'characters' && (
          <div className="space-y-2">
            {result.characters.map((character, index) => (
              <CharacterRow
                key={index}
                character={character}
                full
                onUpdate={field => value => onUpdateCharacter(index, field, value)}
              />
            ))}
          </div>
        )}
      </FullScreenViewer>
    </section>
  )
}

function FullscreenButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="shrink-0 rounded p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
    >
      <Maximize2 className="h-3.5 w-3.5" />
    </button>
  )
}

function CharacterRow({
  character,
  onUpdate,
  full = false,
}: {
  character: ReverseCharacterMW
  /** 单个角色字段的编辑入口（已绑定角色下标） */
  onUpdate: (field: ReverseCharacterTextField) => (value: string) => void
  /** 完整模式（全屏）：展示全部可编辑字段；默认紧凑模式仅简介 */
  full?: boolean
}) {
  const fields = full
    ? CHARACTER_FULL_FIELDS
    : CHARACTER_FULL_FIELDS.filter(({ field }) => field === 'shortDescription')
  return (
    <div className="border border-border rounded-lg p-2.5">
      <div className="flex items-center gap-2 mb-1">
        <InlineInput
          value={character.name}
          onChange={onUpdate('name')}
          placeholder="角色名"
          className="min-w-0 flex-1 text-sm font-medium text-text-primary"
        />
        <span className="shrink-0 text-xs px-1.5 py-0.5 bg-bg-hover rounded text-text-muted">
          {characterAxesLabel(character)}
        </span>
        {character.isCrossWorld
          ? <span className="shrink-0 text-xs text-accent">🌐 跨世界</span>
          : <span className="shrink-0 text-xs text-text-muted">@{character.homeWorld || '未分配'}</span>}
      </div>
      <div className="space-y-1">
        {fields.map(({ field, label }) => (
          <EditableFieldRow
            key={field}
            label={label}
            compact
            displayClassName={field === 'shortDescription' ? '!text-xs !text-accent' : undefined}
            value={character[field]}
            placeholder="点击编辑…"
            onChange={onUpdate(field)}
          />
        ))}
      </div>
    </div>
  )
}
