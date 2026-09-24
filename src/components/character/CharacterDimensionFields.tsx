import FullScreenTextarea from '../shared/FullScreenTextarea'
import type { Character } from '../../lib/types'
import { dimensionsByGroup, type CharacterDimensionKey, type CharacterDimensionSpec } from '../../lib/character/character-dimensions'
import { useCallback, useEffect, useRef, useState } from 'react'
import VoiceSampleExtractAction from './VoiceSampleExtractAction'
import CharacterDimensionRewriteAction from './CharacterDimensionRewriteAction'

interface Props {
  character: Character
  onChange: (patch: Partial<Character>) => void
  /** 行内已显示、此处不重复的维度（如 NPC 行已有 简介/地点） */
  exclude?: CharacterDimensionKey[]
}

interface DimensionFieldProps {
  dimension: CharacterDimensionSpec
  value: string
  onCommit: (value: string) => void
}

function CharacterDimensionField({ dimension, value, onCommit }: DimensionFieldProps) {
  const [draft, setDraft] = useState(value)
  const draftRef = useRef(value)
  const dirtyRef = useRef(false)
  const lastSentRef = useRef(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onCommitRef = useRef(onCommit)

  useEffect(() => {
    onCommitRef.current = onCommit
  }, [onCommit])

  const flushDraft = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const next = draftRef.current
    if (!dirtyRef.current || next === lastSentRef.current) return
    lastSentRef.current = next
    onCommitRef.current(next)
  }, [])

  useEffect(() => {
    const external = String(value ?? '')
    if (dirtyRef.current && external !== draftRef.current) return
    dirtyRef.current = false
    lastSentRef.current = external
    draftRef.current = external
    setDraft(external)
  }, [value])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const next = draftRef.current
    if (dirtyRef.current && next !== lastSentRef.current) {
      onCommitRef.current(next)
    }
  }, [])

  return (
    <FullScreenTextarea
      value={draft}
      onChange={e => {
        const next = e.target.value
        draftRef.current = next
        dirtyRef.current = true
        setDraft(next)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(flushDraft, 400)
      }}
      onBlur={flushDraft}
      placeholder={`${dimension.label}…`}
      rows={dimension.rows}
      className="flex-1 px-2 py-1 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
    />
  )
}

/**
 * 角色完整维度的展示/编辑区(共享)——按 CHARACTER_DIMENSIONS 分组渲染。
 * NPC / 次要 / 路人 / 主要面板复用,让 AI 生成的完整内容在各自页面都能看到、能改。
 * 每个维度挂「AI 重写」入口(CHARACTER-REWRITE):不满意 AI 生成的内容时,按作者要求重新生成。
 * 加一个维度只改 CHARACTER_DIMENSIONS + FIELD_REGISTRY,这里自动出现。
 */
export default function CharacterDimensionFields({ character, onChange, exclude = [] }: Props) {
  const skip = new Set<CharacterDimensionKey>(exclude)

  return (
    <div className="space-y-3">
      {dimensionsByGroup().map(({ group, dims }) => {
        const shown = dims.filter(d => !skip.has(d.key))
        if (!shown.length) return null
        return (
          <div key={group}>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-text-muted/70">{group}</div>
            <div className="space-y-1.5">
              {shown.map(d => (
                <div key={d.key} className="flex gap-2">
                  <div className="w-20 flex-shrink-0 pt-1.5">
                    <div className="text-xs text-text-muted">{d.label}</div>
                    {/* CHARACTER-REWRITE:每维度挂「AI 重写」,替换成功后经 onApplied 同步父表单 */}
                    <CharacterDimensionRewriteAction
                      character={character}
                      dimensionKey={d.key}
                      onApplied={patch => onChange(patch)}
                    />
                  </div>
                  {/* VOICE-SAMPLE:声纹样本行挂 AI 提取入口（其余维度保持纯文本框） */}
                  {d.key === 'voiceSamples' ? (
                    <div className="flex-1 min-w-0">
                      <CharacterDimensionField
                        key={`${character.id ?? 'draft'}:${d.key}`}
                        dimension={d}
                        value={String(character[d.key] ?? '')}
                        onCommit={value => onChange({ [d.key]: value } as Partial<Character>)}
                      />
                      <div className="mt-1">
                        <VoiceSampleExtractAction character={character} onApplied={patch => onChange(patch)} />
                      </div>
                    </div>
                  ) : (
                    <CharacterDimensionField
                      key={`${character.id ?? 'draft'}:${d.key}`}
                      dimension={d}
                      value={String(character[d.key] ?? '')}
                      onCommit={value => onChange({ [d.key]: value } as Partial<Character>)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
