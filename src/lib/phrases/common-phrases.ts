/**
 * PHRASE-1 全局常用语核心逻辑。
 *
 * 常用语是作者手写的快捷语料便签（标题 + 内容），跨项目共享：
 * - readAllPhrases: 弹层/面板列表读取（updatedAt 降序 = 最近编辑在前）。
 * - filterPhrases: 弹层查找（标题精确 > 标题前缀 > 标题包含 > 内容兜底）。
 * - savePhrase / deletePhrase: 设置页「常用语」卡片的统一增删改。
 * - export/import: 常用语页独立 JSON 往返（表本身 exportable=false，不进项目备份）。
 *
 * 常用语不注入 AI 上下文（非 CONTEXT_SOURCES），AI 也不可写（非 FIELD_REGISTRY），
 * 仅作为作者手动查找/填入/复制的快捷输入辅助。
 */
import { db } from '../db/schema'
import type { CommonPhraseEntry } from '../types/common-phrases'

/** 全部条目（updatedAt 降序 = 最近编辑在前） */
export function readAllPhrases(): Promise<CommonPhraseEntry[]> {
  return db.commonPhrases.orderBy('updatedAt').reverse().toArray()
}

export interface SavePhraseInput {
  id?: number
  title: string
  content: string
}

/** 新增或更新条目：标题与内容去空白后必须非空。 */
export async function savePhrase(input: SavePhraseInput): Promise<number> {
  const title = input.title.trim()
  const content = input.content.trim()
  if (!title || !content) throw new Error('标题与内容均不能为空')
  const now = Date.now()
  if (input.id != null) {
    await db.commonPhrases.update(input.id, { title, content, updatedAt: now })
    return input.id
  }
  return db.commonPhrases.add({ title, content, createdAt: now, updatedAt: now })
}

export async function deletePhrase(id: number): Promise<void> {
  await db.commonPhrases.delete(id)
}

/** 弹层填入：已有内容时以换行拼接，避免覆盖作者已输入的文字 */
export function joinPhrase(current: string, addition: string): string {
  const base = current.trimEnd()
  return base ? `${base}\n${addition}` : addition
}

// ── 常用语页 JSON 导出 / 导入（独立于项目导出；表 exportable=false） ──────────

const EXPORT_FORMAT_VERSION = 1

export interface CommonPhrasesExportFile {
  format: 'storyforge-common-phrases'
  version: 1
  exportedAt: number
  entries: CommonPhraseEntry[]
}

/** 全量导出（updatedAt 升序 = 创建顺序，文件内容稳定）。 */
export async function exportCommonPhrases(): Promise<CommonPhrasesExportFile> {
  const entries = await db.commonPhrases.orderBy('updatedAt').toArray()
  return {
    format: 'storyforge-common-phrases',
    version: EXPORT_FORMAT_VERSION,
    exportedAt: Date.now(),
    entries,
  }
}

export interface CommonPhrasesImportResult {
  imported: number
  skipped: number
}

/**
 * 追加式导入：逐条清洗（标题/内容去空白后必须非空，否则跳过）。
 * 标题是查找匹配词，与库中现有条目或文件内前文按标题重复的一律跳过，
 * 避免重复导入造成查找歧义与列表翻倍。
 */
export async function importCommonPhrases(
  file: unknown,
): Promise<CommonPhrasesImportResult> {
  const parsed = parseExportFile(file)
  const now = Date.now()
  const existing = new Set(
    (await db.commonPhrases.toArray()).map(row => row.title.trim().toLowerCase()),
  )
  let imported = 0
  let skipped = 0
  for (const entry of parsed) {
    const title = entry.title?.trim() ?? ''
    const content = entry.content?.trim() ?? ''
    if (!title || !content) {
      skipped += 1
      continue
    }
    const key = title.toLowerCase()
    if (existing.has(key)) {
      skipped += 1
      continue
    }
    existing.add(key)
    await db.commonPhrases.add({ title, content, createdAt: now, updatedAt: now })
    imported += 1
  }
  return { imported, skipped }
}

function parseExportFile(file: unknown): CommonPhraseEntry[] {
  if (!file || typeof file !== 'object') return []
  const candidate = file as Partial<CommonPhrasesExportFile>
  if (candidate.format !== 'storyforge-common-phrases') return []
  if (candidate.version !== 1) return []
  if (!Array.isArray(candidate.entries)) return []
  return candidate.entries.filter((entry): entry is CommonPhraseEntry => (
    !!entry && typeof entry === 'object'
  ))
}

/**
 * 弹层查找：对已读取的全量条目做标题/内容匹配计分过滤。
 * 标题精确 100 > 标题前缀 80 > 标题包含 60 > 内容包含 30；同分按 updatedAt 降序。
 */
export function filterPhrases(
  entries: CommonPhraseEntry[],
  query: string,
): CommonPhraseEntry[] {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return entries
  const scored: { entry: CommonPhraseEntry; score: number }[] = []
  for (const entry of entries) {
    const title = entry.title.trim().toLowerCase()
    let score = 0
    if (title === keyword) score = 100
    else if (title.startsWith(keyword)) score = 80
    else if (title.includes(keyword)) score = 60
    else if (entry.content.toLowerCase().includes(keyword)) score = 30
    if (score) scored.push({ entry, score })
  }
  return scored
    .sort((a, b) => b.score - a.score || b.entry.updatedAt - a.entry.updatedAt)
    .map(item => item.entry)
}
