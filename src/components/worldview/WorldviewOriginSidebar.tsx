export type WorldviewOriginFieldKey = 'origin' | 'power' | 'divine'

export const WORLDVIEW_ORIGIN_FIELDS: Array<{
  key: WorldviewOriginFieldKey
  label: string
  icon: string
  desc: string
}> = [
  { key: 'origin', label: '世界来源', icon: '🌌', desc: '创世神话 / 历史时期 / 文明起源……世界从何而来？' },
  { key: 'power', label: '力量体系', icon: '⚡', desc: '修真等级 / 社会等级 / 科技层级……力量如何分层、怎么晋升？' },
  { key: 'divine', label: '神明与信仰', icon: '🌟', desc: '是否存在神明或宗教？神明 / 信仰的层级、名号、规则与限制。' },
]

interface Props {
  active: WorldviewOriginFieldKey
  streamingKeys: ReadonlySet<string>
  onSelect: (key: WorldviewOriginFieldKey) => void
}

export default function WorldviewOriginSidebar({ active, streamingKeys, onSelect }: Props) {
  return (
    <div className="flex w-full shrink-0 gap-1 overflow-x-auto pb-1 md:w-fit md:min-w-32 md:max-w-44 md:flex-col md:gap-0 md:overflow-x-visible md:space-y-0.5 md:pt-1 md:pb-0">
      {WORLDVIEW_ORIGIN_FIELDS.map(field => {
        const isActive = active === field.key
        const isFieldStreaming = streamingKeys.has(field.key)
        return (
          <button
            key={field.key}
            onClick={() => onSelect(field.key)}
            aria-label={field.label}
            aria-pressed={isActive}
            className={`shrink-0 whitespace-nowrap flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all md:w-full md:px-2 md:py-2.5 md:border-l-2 ${
              isActive
                ? 'bg-accent/8 border-accent'
                : 'hover:bg-bg-hover border-transparent'
            }`}>
            <span className="text-base shrink-0">{field.icon}</span>
            <span className={`text-sm font-medium truncate flex-1 ${isActive ? 'text-accent' : 'text-text-primary'}`}>{field.label}</span>
            {isFieldStreaming && !isActive && (
              <span aria-label={`${field.label}生成中`} className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
            )}
          </button>
        )
      })}
    </div>
  )
}
