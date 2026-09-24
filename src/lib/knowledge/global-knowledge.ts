/**
 * KB-1 全局知识库核心逻辑 · 查阅式参考手册。
 *
 * - searchKnowledgeEntries: search_knowledge 工具的匹配引擎
 *   （主题/触发词计分优先，正文包含兜底；停用条目不参与）。
 * - readKnowledgeSelectionContext: knowledgeSelection 源读取（节点/Agent 勾选的精确条目）。
 * - searchKnowledgeContext: knowledgeQuery 源读取（AI 主动定向查询）。
 * - export/import: 知识库页独立 JSON 往返（v2 含 triggers；表本身 exportable=false）。
 */
import { db } from '../db/schema'
import {
  normalizeKnowledgeTriggers,
  type GlobalKnowledgeEntry,
} from '../types/global-knowledge'

const MAX_SEARCH_RESULTS = 10

/** 全部条目（知识库页列表用，updatedAt 降序 = 最近编辑在前） */
export function readAllKnowledgeEntries(): Promise<GlobalKnowledgeEntry[]> {
  return db.globalKnowledgeEntries.orderBy('updatedAt').reverse().toArray()
}

export interface SaveKnowledgeEntryInput {
  id?: number
  title: string
  content: string
  category: string
  enabled: boolean
  triggers?: string[]
}

/** 新增或更新条目：标题与正文去空白后必须非空，触发词归一化落库。 */
export async function saveKnowledgeEntry(input: SaveKnowledgeEntryInput): Promise<number> {
  const title = input.title.trim()
  const content = input.content.trim()
  if (!title || !content) throw new Error('标题与正文均不能为空')
  const triggers = normalizeKnowledgeTriggers(input.triggers)
  const now = Date.now()
  if (input.id != null) {
    await db.globalKnowledgeEntries.update(input.id, {
      title,
      content,
      category: input.category.trim() || '其他',
      enabled: input.enabled,
      triggers,
      updatedAt: now,
    })
    return input.id
  }
  return db.globalKnowledgeEntries.add({
    title,
    content,
    category: input.category.trim() || '其他',
    enabled: input.enabled,
    triggers,
    createdAt: now,
    updatedAt: now,
  })
}

export async function deleteKnowledgeEntry(id: number): Promise<void> {
  await db.globalKnowledgeEntries.delete(id)
}

export type KnowledgeMatchReason = 'title' | 'trigger' | 'content'

export interface KnowledgeSearchHit {
  entry: GlobalKnowledgeEntry
  reason: KnowledgeMatchReason
  score: number
}

/**
 * 匹配引擎：主题/触发词与查询词双向包含计分，正文包含兜底。
 * 同分按 createdAt 升序保证结果稳定。
 */
export async function searchKnowledgeEntries(
  query: string,
  limit = 5,
): Promise<KnowledgeSearchHit[]> {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return []
  const rows = await db.globalKnowledgeEntries.toArray()
  const hits: KnowledgeSearchHit[] = []
  for (const entry of rows) {
    if (!entry.enabled) continue
    if (!entry.title.trim() || !entry.content.trim()) continue
    const hit = scoreKnowledgeEntry(entry, keyword)
    if (hit) hits.push(hit)
  }
  return hits
    .sort((a, b) => b.score - a.score || a.entry.createdAt - b.entry.createdAt)
    .slice(0, Math.max(1, Math.min(MAX_SEARCH_RESULTS, Math.floor(limit))))
}

function scoreKnowledgeEntry(
  entry: GlobalKnowledgeEntry,
  keyword: string,
): KnowledgeSearchHit | null {
  const title = entry.title.trim().toLowerCase()
  if (title === keyword) return { entry, reason: 'title', score: 100 }
  if (title.includes(keyword) || keyword.includes(title)) {
    return { entry, reason: 'title', score: 80 }
  }
  let bestTriggerScore = 0
  for (const trigger of entry.triggers ?? []) {
    const normalized = trigger.trim().toLowerCase()
    if (!normalized) continue
    if (normalized === keyword) return { entry, reason: 'trigger', score: 90 }
    if (normalized.includes(keyword) || keyword.includes(normalized)) {
      bestTriggerScore = Math.max(bestTriggerScore, 60)
    }
  }
  if (bestTriggerScore) return { entry, reason: 'trigger', score: bestTriggerScore }
  if (entry.content.toLowerCase().includes(keyword)) {
    return { entry, reason: 'content', score: 30 }
  }
  return null
}

/** 查询结果注入格式：主题小节 + 触发词标注 + 范例正文。 */
export function formatKnowledgeEntryBlock(entry: GlobalKnowledgeEntry): string {
  const categoryTag = entry.category.trim() ? `（${entry.category.trim()}）` : ''
  const triggers = entry.triggers?.length ? `\n触发词：${entry.triggers.join('、')}` : ''
  return `◆ ${entry.title.trim()}${categoryTag}${triggers}\n${entry.content.trim()}`
}

/** knowledgeQuery 源读取：给 search_knowledge 工具的定向查询文本。 */
export async function searchKnowledgeContext(query: string): Promise<string> {
  const keyword = query.trim()
  const hits = await searchKnowledgeEntries(keyword, MAX_SEARCH_RESULTS)
  if (!hits.length) {
    return `【知识库查询】没有匹配「${keyword}」的条目。`
  }
  const blocks = hits.map(hit => formatKnowledgeEntryBlock(hit.entry))
  return `【知识库查询 · ${hits.length} 条匹配「${keyword}」】\n${blocks.join('\n\n')}`
}

/** knowledgeSelection 源读取：按勾选键顺序精确取条目，键为字符串化条目 ID。 */
export async function readKnowledgeSelectionContext(entryKeys: string[]): Promise<string> {
  const keys = [...new Set(entryKeys.map(key => key.trim()).filter(Boolean))]
  if (!keys.length) return ''
  const rows = await db.globalKnowledgeEntries.toArray()
  const byId = new Map(rows.map(row => [String(row.id), row]))
  const blocks: string[] = []
  for (const key of keys) {
    const entry = byId.get(key)
    if (!entry || !entry.enabled) continue
    if (!entry.title.trim() || !entry.content.trim()) continue
    blocks.push(formatKnowledgeEntryBlock(entry))
  }
  if (!blocks.length) return ''
  return `【全局知识库 · 作者勾选的参考条目】\n${blocks.join('\n\n')}`
}

// ── 知识库页 JSON 导出 / 导入（独立于项目导出） ─────────────────────────────

const EXPORT_FORMAT_VERSION = 2

export interface GlobalKnowledgeExportFile {
  format: 'storyforge-global-knowledge'
  /** 当前导出恒为 2；导入兼容 v1（丢弃旧 weight/tokenCap 字段） */
  version: 1 | 2
  exportedAt: number
  entries: GlobalKnowledgeEntry[]
}

export async function exportGlobalKnowledge(): Promise<GlobalKnowledgeExportFile> {
  const entries = await db.globalKnowledgeEntries.orderBy('updatedAt').toArray()
  return {
    format: 'storyforge-global-knowledge',
    version: EXPORT_FORMAT_VERSION,
    exportedAt: Date.now(),
    entries,
  }
}

export interface GlobalKnowledgeImportResult {
  imported: number
  skipped: number
}

/** 导入为追加式：逐条清洗归一化（兼容 v1 旧字段，丢弃 weight/tokenCap），非法条目跳过。 */
export async function importGlobalKnowledge(
  file: unknown,
): Promise<GlobalKnowledgeImportResult> {
  const parsed = parseExportFile(file)
  const now = Date.now()
  let imported = 0
  let skipped = 0
  for (const entry of parsed) {
    const title = entry.title?.trim() ?? ''
    const content = entry.content?.trim() ?? ''
    if (!title || !content) {
      skipped += 1
      continue
    }
    await db.globalKnowledgeEntries.add({
      title,
      content,
      category: entry.category?.trim() || '其他',
      enabled: entry.enabled !== false,
      triggers: normalizeKnowledgeTriggers(entry.triggers),
      createdAt: now,
      updatedAt: now,
    })
    imported += 1
  }
  return { imported, skipped }
}

function parseExportFile(file: unknown): GlobalKnowledgeEntry[] {
  if (!file || typeof file !== 'object') return []
  const candidate = file as Partial<GlobalKnowledgeExportFile>
  if (candidate.format !== 'storyforge-global-knowledge') return []
  if (candidate.version !== 1 && candidate.version !== 2) return []
  if (!Array.isArray(candidate.entries)) return []
  return candidate.entries.filter((entry): entry is GlobalKnowledgeEntry => (
    !!entry && typeof entry === 'object'
  ))
}
