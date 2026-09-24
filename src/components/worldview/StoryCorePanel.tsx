import { useState, useEffect, useCallback } from 'react'
import { useWorldviewStore } from '../../stores/worldview'
import { useWorldGroupStore } from '../../stores/world-group'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { buildStoryGeneratePrompt } from '../../lib/ai/adapters/story-adapter'
import AIStreamOutput from '../shared/AIStreamOutput'
import PromptRunPanel from '../shared/PromptRunPanel'
import { InlineTextarea } from '../shared/InlineEdit'
import FieldGenerationBar from '../shared/FieldGenerationBar'
import { assembleContext } from '../../lib/registry/assemble-context'
import type { Project } from '../../lib/types'
import type { FieldGenerationMode } from '../../lib/ai/field-generation-context'

// ── 字段定义 ──────────────────────────────────────────────────

interface FieldDef {
  key: string
  emoji: string
  label: string
  description: string
  dimension: string
  saveKey: string
}

const FIELDS: FieldDef[] = [
  { key: 'logline',         emoji: '📜', label: '一句话故事',   description: '用一句话讲清楚你的故事是什么。',                      dimension: '一句话故事（logline）',       saveKey: 'logline' },
  { key: 'concept',         emoji: '💡', label: '故事概念',     description: "独特设定或反差点：'如果……会怎么样？'",                 dimension: '故事概念（high concept）',    saveKey: 'concept' },
  { key: 'theme',           emoji: '🎯', label: '故事主题',     description: '想探讨的人性/价值观主题。',                            dimension: '故事主题',                    saveKey: 'theme' },
  { key: 'centralConflict', emoji: '⚔️', label: '核心冲突',     description: '主角面对的最大矛盾（外在 + 内在）。',                  dimension: '核心冲突',                    saveKey: 'centralConflict' },
  { key: 'plotPattern',     emoji: '📊', label: '故事模式',     description: '线性 / 莲花地图 / 多线并行 / 蒙太奇 等。',            dimension: '故事模式',                    saveKey: 'plotPattern' },
  { key: 'mainPlot',        emoji: '🛤', label: '故事主线',     description: '核心情节线 — 主角的目标与阻碍。',                      dimension: '故事主线',                    saveKey: 'mainPlot' },
  { key: 'subPlots',        emoji: '🎼', label: '故事复线',     description: '副线情节（情感线 / 配角线 / 暗线 / 悬念线）。',        dimension: '故事复线',                    saveKey: 'subPlots' },
]

// ── 主面板 ─────────────────────────────────────────────────────

interface Props { project: Project }

export default function StoryCorePanel({ project }: Props) {
  const { storyCore, saveStoryCore, loadAll } = useWorldviewStore()
  const activeGroupId = useWorldGroupStore(s => s.activeGroupId)

  const [values, setValues] = useState<Record<string, string>>({})
  const [activeKey, setActiveKey] = useState(FIELDS[0].key)
  // 跟踪哪些字段正在 streaming（用于侧边栏小圆点）
  const [streamingKeys, setStreamingKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadAll(project.id!, project.enableMultiWorld ? activeGroupId : null)
  }, [project.id, project.enableMultiWorld, activeGroupId, loadAll])

  useEffect(() => {
    if (!storyCore) return
    setValues({
      logline:         storyCore.logline || '',
      concept:         storyCore.concept || '',
      theme:           storyCore.theme || '',
      centralConflict: storyCore.centralConflict || '',
      plotPattern:     storyCore.plotPattern || '',
      mainPlot:        storyCore.mainPlot || storyCore.storyLines || '',
      subPlots:        storyCore.subPlots || '',
    })
  }, [storyCore])

  const save = (key: string, v: string) => {
    const field = FIELDS.find(f => f.key === key)!
    saveStoryCore({ projectId: project.id!, [field.saveKey]: v })
  }

  const handleStreamingChange = useCallback((key: string, streaming: boolean) => {
    setStreamingKeys(prev => {
      if (prev.has(key) === streaming) return prev
      const next = new Set(prev)
      if (streaming) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  return (
    <div className="flex flex-col gap-2 max-w-5xl md:flex-row md:gap-4">
      {/* ── 导航：宽屏左侧纵向；窄屏顶部横向滚动标签条 ── */}
      <div className="flex w-full shrink-0 gap-1 overflow-x-auto pb-1 md:w-fit md:min-w-32 md:max-w-40 md:flex-col md:gap-0 md:overflow-x-visible md:space-y-0.5 md:pt-1 md:pb-0">
        {FIELDS.map(f => {
          const active = activeKey === f.key
          const hasContent = !!values[f.key]
          const isFieldStreaming = streamingKeys.has(f.key)
          return (
            <button
              key={f.key}
              onClick={() => setActiveKey(f.key)}
              className={`shrink-0 whitespace-nowrap flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-all md:w-full md:px-2 md:border-l-2 ${
                active
                  ? 'bg-accent/8 border-accent'
                  : 'hover:bg-bg-hover border-transparent'
              }`}
            >
              <span className="text-base shrink-0">{f.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${active ? 'text-accent' : 'text-text-primary'}`}>
                  {f.label}
                </p>
                {hasContent && (
                  <p className="text-[10px] text-text-muted truncate">
                    {values[f.key].slice(0, 12)}…
                  </p>
                )}
              </div>
              {isFieldStreaming && !active && (
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
              )}
            </button>
          )
        })}
      </div>

      {/* ── 右侧：所有字段同时渲染，hidden 控制显示 ── */}
      <div className="flex-1 min-w-0">
        {FIELDS.map(f => (
          <div key={f.key} className={activeKey === f.key ? '' : 'hidden'}>
            <FieldEditor
              field={f}
              value={values[f.key] || ''}
              onChange={v => {
                setValues(prev => ({ ...prev, [f.key]: v }))
                save(f.key, v)
              }}
              project={project}
              sessionEntity={`${activeGroupId ?? 'global'}:${f.key}`}
              onStreamingChange={streaming => handleStreamingChange(f.key, streaming)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 单字段编辑器（各自独立的 AI 流） ──────────────────────────

function FieldEditor({
  field, value, onChange, project, sessionEntity, onStreamingChange,
}: {
  field: FieldDef
  value: string
  onChange: (v: string) => void
  project: Project
  sessionEntity: string
  onStreamingChange: (streaming: boolean) => void
}) {
  const [hint, setHint] = useState('')
  const [parameterValues, setParameterValues] = useState<Record<string, unknown>>({})
  const [systemOverride, setSystemOverride] = useState<string | null>(null)
  const [userOverride, setUserOverride] = useState<string | null>(null)
  const [mode, setMode] = useState<FieldGenerationMode>('expand')
  const ai = useAIStream(createAISessionKey(project.id!, 'story.generate', sessionEntity))

  // 通知父组件 streaming 状态
  useEffect(() => {
    onStreamingChange(ai.isStreaming)
  }, [ai.isStreaming, onStreamingChange])

  const activeGroupId = useWorldGroupStore(state => state.activeGroupId)
  const handleGenerate = async () => {
    // 世界观全量字段 + 历史年表一次性走注册表装配（世界关键设定不只取摘要，由预算软裁兜底）
    const ctx = await assembleContext({
      projectId: project.id!,
      worldGroupId: project.enableMultiWorld ? activeGroupId : null,
      sourceKeys: ['worldview', 'historical'],
    })
    const opts = {
      parameterValues: Object.keys(parameterValues).length > 0 ? parameterValues : undefined,
      overrides: (systemOverride != null || userOverride != null) ? {
        systemPrompt: systemOverride ?? undefined,
        userPromptTemplate: userOverride ?? undefined,
      } : undefined,
    }
    const messages = buildStoryGeneratePrompt(
      field.dimension, project.name, project.genre || '', ctx.text, hint, opts, value, mode,
    )
    ai.start(messages, undefined, { category: 'story.generate', projectId: project.id! })
  }

  return (
    <div className="space-y-4">
      {/* 标题 + 描述 */}
      <div>
        <h2 className="text-xl font-bold text-text-primary mb-0.5">
          {field.emoji} {field.label}
        </h2>
        <p className="text-sm text-text-muted">{field.description}</p>
      </div>

      {/* 内容区 — 行内编辑 */}
      <div className="bg-bg-surface border border-border rounded-lg p-4">
        <InlineTextarea
          value={value}
          onChange={onChange}
          placeholder={`点击填写${field.label}…`}
        />
      </div>

      {/* AI 生成区 */}
      <div className="space-y-3">
        <FieldGenerationBar
          mode={mode}
          onModeChange={setMode}
          hint={hint}
          onHintChange={setHint}
          onGenerate={handleGenerate}
          generating={ai.isStreaming}
          variant="outline"
          hintPlaceholder="补充提示（可选）"
        />

        <PromptRunPanel
          moduleKey="story.generate"
          parameterValues={parameterValues}
          onParamChange={setParameterValues}
          systemOverride={systemOverride}
          onSystemOverrideChange={setSystemOverride}
          userOverride={userOverride}
          onUserOverrideChange={setUserOverride}
        />

        {(ai.output || ai.isStreaming || ai.error) && (
          <AIStreamOutput
            output={ai.output}
            isStreaming={ai.isStreaming}
            error={ai.error}
            tokenUsage={ai.tokenUsage}
            onStop={ai.stop}
            onAccept={(text: string) => {
              onChange(text)
              ai.reset()
            }}
            onRetry={handleGenerate}
            moduleKey="story.generate"
          />
        )}
      </div>
    </div>
  )
}

// InlineTextarea 已移至 shared/InlineEdit.tsx（组合输入安全版）
