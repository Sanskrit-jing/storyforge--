/**
 * 全局设置备份（localStorage 合并包，独立于项目导出）。
 *
 * 背景：PROJECT_TABLES 只治理 IndexedDB 项目数据；全局设置全部落在 localStorage
 * （AI 配置/预设/任务路由/Agent 策略/embedding/主题/写作偏好/朗读/流派包），
 * 既不随项目 JSON 备份走，也没有任何导出通道——换设备/重装即全丢。
 * 本模块是这批键的统一导出/导入收口：导出为一个合并 JSON 包，导入按节应用。
 *
 * 安全边界：
 * - 导出默认剥离三类密钥（AI apiKey / embedding apiKey / TTS ttsApiKey，含预设内嵌
 *   config.apiKey），调用方显式传 includeSecrets=true 才写入明文（UI 默认不勾选）。
 * - 导入时包内密钥为空则保留本机现有值（避免「无密钥包」覆盖抹掉已配好的 key）。
 * - 导入不写 sessionStorage：会话密钥由用户在设置页重新输入或勾选「记住」后持久化。
 * - 导入后需刷新页面（zustand store 在模块加载时读一次 localStorage）。
 */

import { sanitizeAITaskRoutes } from '../ai/task-routing'
import { sanitizeAgentContextProfiles } from '../agent/context-policy'
import { sanitizeAgentTeamBudgetProfile } from '../agent/team-budget'
import { THEME_OPTIONS } from '../theme'

// ── 收口的 localStorage 键（与各模块单一事实源保持同键，不另立存储） ──────────
const KEY_AI_CONFIG = 'storyforge-ai-config'
const KEY_AI_PRESETS = 'storyforge-ai-presets'
const KEY_REMEMBER_API_KEY = 'storyforge-ai-api-key-remember'
const KEY_EMBEDDING = 'storyforge-embedding-config'
const KEY_TASK_ROUTES = 'storyforge-ai-task-routes'
const KEY_AGENT_PROFILES = 'storyforge-agent-context-profiles'
const KEY_AGENT_BUDGET = 'storyforge-agent-team-budget-profile'
const KEY_THEME = 'storyforge-theme'
const KEY_SPEECH_READER = 'storyforge-speech-reader'
const KEY_GENRE_PACK = 'sf-genre-pack'
const WRITING_PREFS_PREFIX = 'sf.writingPrefs.'
const WRITING_PREFS_KEYS = ['emotionExternalization', 'imagery', 'sensoryImmersion'] as const

const EXPORT_FORMAT_VERSION = 1

export interface SettingsBackupFile {
  format: 'storyforge-settings'
  version: 1
  exportedAt: number
  /** true = 包内含明文密钥（导出时显式勾选才会是 true） */
  includeSecrets: boolean
  sections: Partial<{
    aiConfig: Record<string, unknown>
    aiPresets: unknown[]
    rememberApiKey: boolean
    embedding: Record<string, unknown>
    taskRoutes: Record<string, unknown>
    agentContextProfiles: Record<string, unknown>
    agentTeamBudgetProfile: string
    theme: string
    writingPrefs: Record<string, string>
    speechReader: Record<string, unknown>
    genrePack: string
  }>
}

export interface SettingsImportResult {
  /** 成功应用的设置节数 */
  applied: number
  /** 因缺失或结构无效跳过的设置节数 */
  skipped: number
}

function readRaw(key: string): string | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw == null || raw === '' ? undefined : raw
  } catch {
    return undefined
  }
}

function readJSON(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** 浅拷贝并剥离指定密钥字段（导出脱敏用） */
function stripFields(value: unknown, fields: readonly string[]): Record<string, unknown> | undefined {
  if (!isObject(value)) return undefined
  const clone = { ...value }
  for (const field of fields) delete clone[field]
  return clone
}

function readWritingPrefs(): Record<string, string> {
  const prefs: Record<string, string> = {}
  for (const key of WRITING_PREFS_KEYS) {
    const raw = readRaw(WRITING_PREFS_PREFIX + key)
    if (raw != null) prefs[key] = raw === '1' ? '1' : '0'
  }
  return prefs
}

/** 全量导出当前全局设置为合并包；includeSecrets=false 时剥离全部明文密钥。 */
export function exportSettings(includeSecrets: boolean): SettingsBackupFile {
  const sections: SettingsBackupFile['sections'] = {}

  const aiConfig = stripFields(readJSON(KEY_AI_CONFIG), includeSecrets ? [] : ['apiKey'])
  if (aiConfig) sections.aiConfig = aiConfig

  const presetsRaw = readJSON(KEY_AI_PRESETS)
  if (Array.isArray(presetsRaw)) {
    sections.aiPresets = includeSecrets
      ? presetsRaw
      : presetsRaw.map(preset => (
        isObject(preset) && isObject(preset.config)
          ? { ...preset, config: stripFields(preset.config, ['apiKey']) }
          : preset
      ))
  }

  const rememberRaw = readRaw(KEY_REMEMBER_API_KEY)
  if (rememberRaw != null) sections.rememberApiKey = rememberRaw === 'true'

  const embedding = stripFields(readJSON(KEY_EMBEDDING), includeSecrets ? [] : ['apiKey'])
  if (embedding) sections.embedding = embedding

  const taskRoutes = readJSON(KEY_TASK_ROUTES)
  if (isObject(taskRoutes)) sections.taskRoutes = taskRoutes

  const agentProfiles = readJSON(KEY_AGENT_PROFILES)
  if (isObject(agentProfiles)) sections.agentContextProfiles = agentProfiles

  const agentBudget = readRaw(KEY_AGENT_BUDGET)
  if (agentBudget != null) sections.agentTeamBudgetProfile = agentBudget

  const theme = readRaw(KEY_THEME)
  if (theme != null) sections.theme = theme

  const writingPrefs = readWritingPrefs()
  if (Object.keys(writingPrefs).length) sections.writingPrefs = writingPrefs

  const speechReader = stripFields(readJSON(KEY_SPEECH_READER), includeSecrets ? [] : ['ttsApiKey'])
  if (speechReader) sections.speechReader = speechReader

  const genrePack = readRaw(KEY_GENRE_PACK)
  if (genrePack != null) sections.genrePack = genrePack

  return {
    format: 'storyforge-settings',
    version: EXPORT_FORMAT_VERSION,
    exportedAt: Date.now(),
    includeSecrets,
    sections,
  }
}

/**
 * 包内密钥为空时保留本机现有值：无密钥包导入不应抹掉已配好的 key。
 * 返回合并后的对象；本机无现有值时原样返回。
 */
function mergePreservedSecret(next: Record<string, unknown>, key: string, field: string): Record<string, unknown> {
  const incoming = next[field]
  if (typeof incoming === 'string' && incoming) return next
  const existing = readJSON(key)
  if (isObject(existing) && typeof existing[field] === 'string' && existing[field]) {
    return { ...next, [field]: existing[field] }
  }
  return next
}

/** 导入设置合并包：逐节校验并写入 localStorage（写完后由调用方刷新页面生效）。 */
export function importSettings(file: unknown): SettingsImportResult {
  const candidate = file as Partial<SettingsBackupFile> | null
  if (!isObject(candidate) || candidate.format !== 'storyforge-settings' || candidate.version !== 1) {
    throw new Error('不是有效的 StoryForge 设置备份文件')
  }
  if (!isObject(candidate.sections)) {
    throw new Error('设置备份文件缺少 sections 内容')
  }

  const sections = candidate.sections
  let applied = 0
  let skipped = 0
  const apply = (ok: boolean, write: () => void) => {
    if (ok) { write(); applied += 1 } else { skipped += 1 }
  }

  if ('aiConfig' in sections) {
    apply(isObject(sections.aiConfig), () => {
      localStorage.setItem(
        KEY_AI_CONFIG,
        JSON.stringify(mergePreservedSecret(sections.aiConfig!, KEY_AI_CONFIG, 'apiKey')),
      )
    })
  }

  if ('aiPresets' in sections) {
    apply(Array.isArray(sections.aiPresets), () => {
      const incoming = sections.aiPresets!.filter(isObject)
      // 按 id 找回本机现有预设的密钥（无密钥包不抹掉预设里已存的 key）
      const existing = readJSON(KEY_AI_PRESETS)
      const byId = new Map(
        Array.isArray(existing)
          ? existing.filter(isObject).map(preset => [typeof preset.id === 'string' ? preset.id : '', preset])
          : [],
      )
      const merged = incoming.map(preset => {
        if (!isObject(preset.config)) return preset
        const id = typeof preset.id === 'string' ? preset.id : ''
        const prev = byId.get(id)
        const prevKey = isObject(prev) && isObject(prev.config) ? prev.config.apiKey : undefined
        if (typeof prevKey === 'string' && prevKey && !preset.config.apiKey) {
          return { ...preset, config: { ...preset.config, apiKey: prevKey } }
        }
        return preset
      })
      localStorage.setItem(KEY_AI_PRESETS, JSON.stringify(merged))
    })
  }

  if ('rememberApiKey' in sections) {
    apply(typeof sections.rememberApiKey === 'boolean', () => {
      localStorage.setItem(KEY_REMEMBER_API_KEY, String(sections.rememberApiKey))
    })
  }

  if ('embedding' in sections) {
    apply(isObject(sections.embedding), () => {
      localStorage.setItem(
        KEY_EMBEDDING,
        JSON.stringify(mergePreservedSecret(sections.embedding!, KEY_EMBEDDING, 'apiKey')),
      )
    })
  }

  if ('taskRoutes' in sections) {
    apply(isObject(sections.taskRoutes), () => {
      localStorage.setItem(KEY_TASK_ROUTES, JSON.stringify(sanitizeAITaskRoutes(sections.taskRoutes)))
    })
  }

  if ('agentContextProfiles' in sections) {
    apply(isObject(sections.agentContextProfiles), () => {
      localStorage.setItem(KEY_AGENT_PROFILES, JSON.stringify(sanitizeAgentContextProfiles(sections.agentContextProfiles)))
    })
  }

  if ('agentTeamBudgetProfile' in sections) {
    apply(typeof sections.agentTeamBudgetProfile === 'string', () => {
      localStorage.setItem(KEY_AGENT_BUDGET, sanitizeAgentTeamBudgetProfile(sections.agentTeamBudgetProfile))
    })
  }

  if ('theme' in sections) {
    const theme = sections.theme
    apply(typeof theme === 'string' && THEME_OPTIONS.some(option => option.value === theme), () => {
      localStorage.setItem(KEY_THEME, theme as string)
    })
  }

  if ('writingPrefs' in sections) {
    const prefs = sections.writingPrefs
    apply(isObject(prefs), () => {
      for (const key of WRITING_PREFS_KEYS) {
        const value = prefs![key]
        if (value === '0' || value === '1') {
          localStorage.setItem(WRITING_PREFS_PREFIX + key, value)
        }
      }
    })
  }

  if ('speechReader' in sections) {
    apply(isObject(sections.speechReader), () => {
      localStorage.setItem(
        KEY_SPEECH_READER,
        JSON.stringify(mergePreservedSecret(sections.speechReader!, KEY_SPEECH_READER, 'ttsApiKey')),
      )
    })
  }

  if ('genrePack' in sections) {
    apply(typeof sections.genrePack === 'string', () => {
      localStorage.setItem(KEY_GENRE_PACK, sections.genrePack as string)
    })
  }

  return { applied, skipped }
}
