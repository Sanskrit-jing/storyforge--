/**
 * 全局跨表查找替换（数据层）。
 *
 * 补齐「章节查找替换」（仅正文）与「实体改名」（entity-rename，含 ID 关联字段）
 * 之间的空档：把一段文本在所有结构化模块的白名单字段中统一替换，
 * 解决「改了 A 模块，B 模块残留旧文本」的联动问题。
 *
 * - 匹配与替换复用 find-replace.ts 的文本节点级逻辑；
 * - 写回分流：在 ADOPTION_SCHEMA 登记的 target 走 adopt() 定点更新，
 *   未登记的等价文本表（worldviews/storyCores/notes/worldNodes/userStyleProfiles）
 *   走直接 update（等价文本替换不改变值的类型与结构，与 entity-rename 对
 *   temporalFacts 直接 update 的先例一致）；
 * - 事务声明派生自 transactionTablesFor('importProject')，不手写表清单；
 * - 执行前创建 manual 快照，撤销走字段级 UndoPatch；
 * - 白名单只含叙述性文本字段，不触碰按 ID 关联的显示字段
 *   （temporalFacts.subjectName、itemLedger.heldByName 等），实体改名仍走 entity-rename。
 */
import type { Table } from 'dexie'
import { db } from '../db/schema'
import { adopt } from '../registry/adopt'
import { ADOPTION_BY_TARGET } from '../registry/adoption-schema'
import { transactionTablesFor } from '../registry/lifecycle'
import {
  createSearchRegExp,
  expandReplacement,
  findChapterMatches,
  findMatchesInText,
  replaceChapterContent,
  snippetFor,
  type ChapterSearchTarget,
  type FindReplaceOptions,
} from './find-replace'

// ─────────────────────────────────────────────────────────────
// 注册表
// ─────────────────────────────────────────────────────────────

export interface GlobalReplaceOptions extends FindReplaceOptions {
  replacement: string
  /** 命中位置被更长的实体名/物品名覆盖时跳过（默认开启） */
  protectLongerTerms?: boolean
}

export type GlobalReplaceFieldKind = 'text' | 'html'

export interface GlobalReplaceFieldSpec {
  field: string
  kind: GlobalReplaceFieldKind
  label: string
}

export interface GlobalReplaceTableSpec {
  /** PROJECT_TABLES / FIELD_REGISTRY 中的表名 */
  target: string
  label: string
  fields: GlobalReplaceFieldSpec[]
  recordLabel?: (row: Record<string, unknown>) => string
}

const text = (field: string, label: string): GlobalReplaceFieldSpec => ({ field, kind: 'text', label })
const htmlField = (field: string, label: string): GlobalReplaceFieldSpec => ({ field, kind: 'html', label })

/**
 * 可替换文本字段白名单。字段均已登记 FIELD_REGISTRY（worldviews/storyCores/
 * notes/worldNodes/userStyleProfiles 走直接 update 分流）或为纯文本等价替换。
 * 派生缓存表（retrievalChunks 等）、按 ID 关联的显示字段、枚举字段不进白名单。
 */
export const GLOBAL_REPLACE_TABLES: GlobalReplaceTableSpec[] = [
  {
    target: 'worldviews',
    label: '世界观',
    fields: [
      text('geography', '地理'), text('history', '历史'), text('society', '社会'),
      text('culture', '文化'), text('economy', '经济体系'), text('rules', '世界规则'),
      text('worldOrigin', '世界起源'), text('powerHierarchy', '力量体系'),
      text('divineDesign', '神明设定'), text('worldStructure', '世界结构'),
      text('worldDimensions', '世界尺寸'), text('continentLayout', '大陆分布'),
      text('regionDimensions', '区域面积'), text('mountainsRivers', '山川河流'),
      text('climateByRegion', '气候'), text('naturalResourceOverview', '自然资源概述'),
      text('naturalResources', '自然资源'), text('historyLine', '历史线'),
      text('worldEvents', '大事记'), text('races', '种族'), text('factionLayout', '势力分布'),
      text('politicsEconomyCulture', '政治经济文化'), text('politicsOverview', '政治概述'),
      text('economyOverview', '经济概述'), text('cultureOverview', '文化概述'),
      text('internalConflicts', '内部矛盾'), text('itemDesign', '道具设计'),
    ],
  },
  {
    target: 'storyCores',
    label: '故事核心',
    fields: [
      text('theme', '主题'), text('centralConflict', '核心冲突'), text('plotPattern', '情节模式'),
      text('logline', '一句话故事'), text('concept', '故事概念'), text('mainPlot', '主线'),
      text('subPlots', '复线'),
    ],
  },
  {
    target: 'characters',
    label: '角色',
    fields: [
      text('name', '姓名'), text('shortDescription', '简介'), text('appearance', '外貌'),
      text('personality', '性格'), text('background', '背景'), text('motivation', '动机'),
      text('abilities', '能力'), text('relationships', '关系'), text('arc', '角色弧光'),
      text('identity', '身份'), text('profile', '基础信息'), text('values', '价值观'),
      text('strengths', '优点'), text('weaknesses', '缺点'), text('fears', '恐惧'),
      text('goals', '目标'), text('innerConflict', '内心冲突'), text('keyEvents', '关键经历'),
      text('powerLevel', '实力定位'), text('speechStyle', '语言风格'), text('voiceSamples', '台词摘录'),
      text('habits', '习惯'), text('signatureItem', '标志性物品'), text('location', '常驻地点'),
      text('firstAppearance', '首次出场'), text('storyRole', '角色作用'), text('ending', '结局'),
    ],
  },
  {
    target: 'characterRelations',
    label: '角色关系',
    fields: [text('label', '关系名'), text('description', '关系描述')],
  },
  {
    target: 'outlineNodes',
    label: '大纲',
    fields: [text('title', '标题'), text('summary', '摘要')],
  },
  {
    target: 'chapters',
    label: '章节',
    fields: [text('title', '标题'), text('summary', '摘要'), text('notes', '笔记'), htmlField('content', '正文')],
  },
  {
    target: 'detailedOutlines',
    label: '详细大纲',
    fields: [
      text('scenes', '场景'), text('openingHook', '开场钩子'), text('endingCliffhanger', '结尾悬念'),
      text('sceneLocation', '场景地点'), text('lastUsedSummary', '最近摘要'),
    ],
    recordLabel: row => `大纲节点 #${String(row.outlineNodeId ?? '?')}`,
  },
  {
    target: 'foreshadows',
    label: '伏笔',
    fields: [text('name', '名称'), text('description', '描述'), text('notes', '备注')],
  },
  {
    target: 'storyArcs',
    label: '故事线',
    fields: [text('name', '名称'), text('description', '描述')],
  },
  {
    target: 'storylineProgress',
    label: '故事线进度',
    fields: [
      text('progressNote', '进度说明'), text('lastActiveChapterTitle', '最近活跃章节'),
      text('evidenceQuote', '正文证据'), text('involvedEntities', '涉及实体'),
    ],
    recordLabel: row => `故事线 #${String(row.arcId ?? row.id ?? '?')}`,
  },
  {
    target: 'storylineCrossings',
    label: '故事线交汇',
    fields: [text('chapterTitle', '章节标题'), text('note', '交汇说明'), text('evidenceQuote', '正文证据')],
  },
  {
    target: 'codexCategories',
    label: '词条分类',
    fields: [text('name', '分类名')],
  },
  {
    target: 'codexEntries',
    label: '词条',
    fields: [text('name', '词条名'), text('summary', '摘要'), text('description', '描述')],
  },
  {
    target: 'importantLocations',
    label: '重要地点',
    fields: [text('name', '名称'), text('description', '描述'), text('significance', '意义')],
  },
  {
    target: 'cultivationSystems',
    label: '修炼体系',
    fields: [text('name', '体系名'), text('description', '体系描述')],
  },
  {
    target: 'stateCards',
    label: '状态卡',
    fields: [text('entityName', '实体名'), text('fields', '状态字段')],
  },
  {
    target: 'emotionBeatCards',
    label: '情绪节拍卡',
    fields: [text('chapterTitle', '章节标题'), text('overallArc', '整体弧线'), text('beats', '节拍明细')],
  },
  {
    target: 'creativeRules',
    label: '写作规则',
    fields: [
      text('writingStyle', '文风'), text('atmosphere', '氛围'), text('specialRequirements', '特殊要求'),
      text('prohibitions', '禁止事项'), text('consistencyRules', '一致性规则'),
    ],
    recordLabel: () => '写作规则',
  },
  {
    target: 'worldNodes',
    label: '世界地图节点',
    fields: [text('name', '名称'), text('description', '描述')],
  },
  {
    target: 'notes',
    label: '章节笔记',
    fields: [text('content', '内容')],
    recordLabel: row => `笔记 · ${String(row.content ?? '').slice(0, 18)}`,
  },
  {
    target: 'userStyleProfiles',
    label: '文风档案',
    fields: [text('profile', '档案内容')],
    recordLabel: () => '文风档案',
  },
]

// ─────────────────────────────────────────────────────────────
// 预览结构
// ─────────────────────────────────────────────────────────────

export interface GlobalReplaceFieldMatch {
  field: string
  label: string
  count: number
  snippets: string[]
}

export interface GlobalReplaceRecordMatch {
  target: string
  id: number
  recordLabel: string
  count: number
  fields: GlobalReplaceFieldMatch[]
}

export interface GlobalReplaceGroup {
  target: string
  label: string
  count: number
  records: GlobalReplaceRecordMatch[]
}

export interface GlobalReplacePreview {
  query: string
  replacement: string
  groups: GlobalReplaceGroup[]
  totalMatches: number
  totalRecords: number
  blockers: string[]
  warnings: string[]
  baseline: string
}

export interface GlobalReplaceRecordChange {
  target: string
  id: number
  before: Record<string, unknown>
  after: Record<string, unknown>
}

export interface GlobalReplaceUndoPatch {
  label: string
  snapshotId: number
  projectId: number
  query: string
  replacement: string
  changes: GlobalReplaceRecordChange[]
}

export interface GlobalReplaceSelection {
  target: string
  id: number
}

function recordKey(target: string, id: number): string {
  return `${target}#${id}`
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function recordLabel(spec: GlobalReplaceTableSpec, row: Record<string, unknown>): string {
  if (spec.recordLabel) return spec.recordLabel(row)
  const name = row.name ?? row.title ?? row.entityName
  return typeof name === 'string' && name.trim() ? name : `记录 #${String(row.id)}`
}

// ─────────────────────────────────────────────────────────────
// 匹配与替换
// ─────────────────────────────────────────────────────────────

function replaceInText(
  source: string,
  options: GlobalReplaceOptions,
): { text: string; count: number; snippets: string[] } {
  const matches = findMatchesInText(source, options)
  if (!matches.length) return { text: source, count: 0, snippets: [] }
  let next = ''
  let cursor = 0
  const snippets: string[] = []
  for (const match of matches) {
    snippets.push(snippetFor(source, match))
    next += source.slice(cursor, match.start)
    next += options.useRegex
      ? expandReplacement(options.replacement, match.match, match.text)
      : options.replacement
    cursor = match.end
  }
  next += source.slice(cursor)
  return { text: next, count: matches.length, snippets }
}

/** 纯文本 / markdown / 嵌套 JSON 结构的等价文本替换（字符串值逐个替换） */
function replaceDeep(
  value: unknown,
  options: GlobalReplaceOptions,
): { value: unknown; count: number; snippets: string[] } {
  if (typeof value === 'string') {
    const result = replaceInText(value, options)
    return { value: result.text, count: result.count, snippets: result.snippets }
  }
  if (Array.isArray(value)) {
    let count = 0
    const snippets: string[] = []
    const next = value.map(item => {
      const result = replaceDeep(item, options)
      count += result.count
      snippets.push(...result.snippets)
      return result.value
    })
    if (!count) return { value, count: 0, snippets: [] }
    return { value: next, count, snippets }
  }
  if (value && typeof value === 'object') {
    let count = 0
    const snippets: string[] = []
    const next: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      const result = replaceDeep(item, options)
      next[key] = result.value
      count += result.count
      snippets.push(...result.snippets)
    }
    if (!count) return { value, count: 0, snippets: [] }
    return { value: next, count, snippets }
  }
  return { value, count: 0, snippets: [] }
}

/** 实体名 / 物品名集合：命中位置被更长名称覆盖时跳过，避免「林尘」误伤「林尘儿」 */
async function loadProtectedTerms(projectId: number): Promise<string[]> {
  const [characters, locations, codexEntries, itemRows] = await Promise.all([
    db.characters.where('projectId').equals(projectId).toArray(),
    db.importantLocations.where('projectId').equals(projectId).toArray(),
    db.codexEntries.where('projectId').equals(projectId).toArray(),
    db.itemLedger.where('projectId').equals(projectId).toArray(),
  ])
  return Array.from(new Set([
    ...characters.map(row => row.name),
    ...locations.map(row => row.name),
    ...codexEntries.map(row => row.name),
    ...itemRows.map(row => row.itemName),
  ].map(name => (name || '').trim()).filter(Boolean)))
}

type AnyTable = Table<Record<string, unknown>, number>

function dataTable(target: string): AnyTable {
  const table = (db as unknown as Record<string, AnyTable | undefined>)[target]
  if (!table) throw new Error(`未知数据表：${target}`)
  return table
}
export { dataTable }

async function loadRows(spec: GlobalReplaceTableSpec, projectId: number): Promise<Record<string, unknown>[]> {
  return await dataTable(spec.target).where('projectId').equals(projectId).toArray()
}

// ─────────────────────────────────────────────────────────────
// 预览
// ─────────────────────────────────────────────────────────────

interface BaselinePayload {
  options: {
    query: string
    replacement: string
    caseSensitive: boolean
    wholeWord: boolean
    useRegex: boolean
    protectLongerTerms: boolean
  }
  hits: Array<{ t: string; i: number; f: string; c: number }>
}

function buildBaseline(options: GlobalReplaceOptions, groups: GlobalReplaceGroup[]): string {
  const payload: BaselinePayload = {
    options: {
      query: options.query.trim(),
      replacement: options.replacement,
      caseSensitive: !!options.caseSensitive,
      wholeWord: !!options.wholeWord,
      useRegex: !!options.useRegex,
      protectLongerTerms: options.protectLongerTerms !== false,
    },
    hits: groups
      .flatMap(group =>
        group.records.flatMap(record =>
          record.fields.map(field => ({ t: group.target, i: record.id, f: field.field, c: field.count })),
        ),
      )
      .sort((left, right) =>
        left.t.localeCompare(right.t) || left.i - right.i || left.f.localeCompare(right.f)),
  }
  return JSON.stringify(payload)
}

async function buildPreviewInternal(
  projectId: number,
  requested: GlobalReplaceOptions,
): Promise<{ preview: GlobalReplacePreview; changes: GlobalReplaceRecordChange[] }> {
  const blockers: string[] = []
  const warnings: string[] = []
  const query = requested.query.trim()
  const replacement = requested.replacement ?? ''
  if (!query) blockers.push('查找内容不能为空')
  if (!requested.useRegex && query === replacement) blockers.push('替换内容与查找内容相同')

  const options: GlobalReplaceOptions = { ...requested, query, replacement }
  if (options.protectLongerTerms !== false) {
    options.protectedTerms = await loadProtectedTerms(projectId)
    // 归一化为 true：保护默认开启的语义需在 baseline 往返（执行时重建 options）中保持一致
    options.protectLongerTerms = true
  }

  try {
    createSearchRegExp(options)
  } catch {
    blockers.push('正则表达式无效，请检查语法')
  }

  const groups: GlobalReplaceGroup[] = []
  const changes: GlobalReplaceRecordChange[] = []
  let totalMatches = 0
  let totalRecords = 0

  if (!blockers.length) {
    for (const spec of GLOBAL_REPLACE_TABLES) {
      const rows = await loadRows(spec, projectId)
      const records: GlobalReplaceRecordMatch[] = []
      for (const row of rows) {
        const id = row.id
        if (typeof id !== 'number') continue
        const fieldMatches: GlobalReplaceFieldMatch[] = []
        const before: Record<string, unknown> = {}
        const after: Record<string, unknown> = {}
        for (const fieldSpec of spec.fields) {
          const original = row[fieldSpec.field]
          if (original == null || original === '') continue
          if (fieldSpec.kind === 'html') {
            const target: ChapterSearchTarget = {
              id,
              outlineNodeId: 0,
              title: recordLabel(spec, row),
              content: String(original),
            }
            const matched = findChapterMatches(target, options)
            if (!matched) continue
            const replaced = replaceChapterContent(String(original), options)
            fieldMatches.push({
              field: fieldSpec.field,
              label: fieldSpec.label,
              count: matched.count,
              snippets: matched.occurrences.slice(0, 5).map(occurrence => occurrence.snippet),
            })
            before[fieldSpec.field] = String(original)
            after[fieldSpec.field] = replaced.html
            // 章节 wordCount 随正文更新，与 content 同 record 断言
            before.wordCount = Number(row.wordCount ?? 0)
            after.wordCount = replaced.wordCount
          } else {
            const result = replaceDeep(original, options)
            if (!result.count) continue
            fieldMatches.push({
              field: fieldSpec.field,
              label: fieldSpec.label,
              count: result.count,
              snippets: result.snippets.slice(0, 5),
            })
            before[fieldSpec.field] = original
            after[fieldSpec.field] = result.value
          }
        }
        if (!fieldMatches.length) continue
        records.push({
          target: spec.target,
          id,
          recordLabel: recordLabel(spec, row),
          count: fieldMatches.reduce((sum, field) => sum + field.count, 0),
          fields: fieldMatches,
        })
        changes.push({ target: spec.target, id, before, after })
      }
      if (records.length) {
        groups.push({
          target: spec.target,
          label: spec.label,
          count: records.reduce((sum, record) => sum + record.count, 0),
          records,
        })
        totalMatches += groups[groups.length - 1].count
        totalRecords += records.length
      }
    }
  }

  if (!blockers.length) {
    warnings.push('时序事实、认知账本等按 ID 关联的显示字段不会自动修改；实体改名请使用「实体改名」')
    warnings.push('替换前会自动创建手动快照，可在版本历史中整体恢复')
    if (options.protectLongerTerms !== false) {
      warnings.push('命中位置被更长的实体名/物品名覆盖时自动跳过')
    }
  }

  const preview: GlobalReplacePreview = {
    query,
    replacement,
    groups,
    totalMatches,
    totalRecords,
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    baseline: buildBaseline(options, groups),
  }
  return { preview, changes }
}

export async function buildGlobalReplacePreview(
  projectId: number,
  options: GlobalReplaceOptions,
): Promise<GlobalReplacePreview> {
  const { preview } = await buildPreviewInternal(projectId, options)
  return preview
}

// ─────────────────────────────────────────────────────────────
// 执行与撤销
// ─────────────────────────────────────────────────────────────

export interface ExecuteGlobalReplaceArgs {
  projectId: number
  expectedBaseline: string
  selected: GlobalReplaceSelection[]
  createSnapshot: (projectId: number, label: string, type: 'auto' | 'manual') => Promise<number>
  label: string
}

export interface ExecuteGlobalReplaceResult {
  snapshotId: number
  changedRecords: number
  totalReplacements: number
  undoPatch: GlobalReplaceUndoPatch
}

async function getRecord(target: string, id: number): Promise<Record<string, unknown> | undefined> {
  return await dataTable(target).get(id)
}

async function assertRecordState(change: GlobalReplaceRecordChange, side: 'before' | 'after'): Promise<void> {
  const current = await getRecord(change.target, change.id)
  if (!current) throw new Error(`记录已不存在：${change.target} #${change.id}`)
  for (const [field, value] of Object.entries(change[side])) {
    if (!sameValue(current[field], value)) {
      throw new Error(`记录已被修改：${change.target} #${change.id} 的 ${field}，请重新预览`)
    }
  }
}

export async function applyGlobalReplaceChange(
  projectId: number,
  change: GlobalReplaceRecordChange,
  side: 'before' | 'after',
): Promise<void> {
  const data = change[side]
  if (ADOPTION_BY_TARGET.has(change.target)) {
    const result = await adopt({
      projectId,
      target: change.target,
      recordId: change.id,
      mode: 'replace',
      data,
    })
    if (result.written.length !== 1 || result.skipped.length || result.typeErrors.length || result.fkErrors.length) {
      throw new Error(`注册表拒绝更新 ${change.target} #${change.id}`)
    }
    return
  }
  await dataTable(change.target).update(change.id, { ...data, updatedAt: Date.now() })
}

export async function executeGlobalReplace(args: ExecuteGlobalReplaceArgs): Promise<ExecuteGlobalReplaceResult> {
  let payload: BaselinePayload
  try {
    payload = JSON.parse(args.expectedBaseline) as BaselinePayload
  } catch {
    throw new Error('执行参数无效，请重新预览')
  }
  const options = payload?.options
  if (!options?.query) throw new Error('执行参数无效，请重新预览')

  const selectedKeys = new Set(args.selected.map(item => recordKey(item.target, item.id)))
  if (!selectedKeys.size) throw new Error('请先勾选要替换的记录')

  const built = await buildPreviewInternal(args.projectId, options)
  if (built.preview.baseline !== args.expectedBaseline) {
    throw new Error('项目数据已变化，请重新预览后再执行')
  }
  if (built.preview.blockers.length) throw new Error(built.preview.blockers.join('；'))
  const changes = built.changes.filter(change => selectedKeys.has(recordKey(change.target, change.id)))
  if (!changes.length) throw new Error('勾选的记录已无匹配内容，请重新预览')

  const snapshotId = await args.createSnapshot(args.projectId, args.label, 'manual')
  await db.transaction('rw', transactionTablesFor('importProject'), async () => {
    const current = await buildPreviewInternal(args.projectId, options)
    if (current.preview.baseline !== args.expectedBaseline) {
      throw new Error('创建快照后项目数据发生变化，已取消替换，请重新预览')
    }
    const scoped = current.changes.filter(change => selectedKeys.has(recordKey(change.target, change.id)))
    if (scoped.length !== changes.length) {
      throw new Error('创建快照后项目数据发生变化，已取消替换，请重新预览')
    }
    for (const change of scoped) await assertRecordState(change, 'before')
    for (const change of scoped) await applyGlobalReplaceChange(args.projectId, change, 'after')
  })

  return {
    snapshotId,
    changedRecords: changes.length,
    totalReplacements: changes.reduce((sum, change) => sum + countForChange(built, change), 0),
    undoPatch: {
      label: `${args.label} · 快照 #${snapshotId}`,
      snapshotId,
      projectId: args.projectId,
      query: options.query.trim(),
      replacement: options.replacement,
      changes,
    },
  }
}

function countForChange(
  built: { preview: GlobalReplacePreview },
  change: GlobalReplaceRecordChange,
): number {
  const group = built.preview.groups.find(item => item.target === change.target)
  const record = group?.records.find(item => item.id === change.id)
  return record?.count ?? 0
}

export async function undoGlobalReplace(patch: GlobalReplaceUndoPatch): Promise<number> {
  await db.transaction('rw', transactionTablesFor('importProject'), async () => {
    for (const change of patch.changes) await assertRecordState(change, 'after')
    for (const change of [...patch.changes].reverse()) await applyGlobalReplaceChange(patch.projectId, change, 'before')
  })
  return patch.changes.length
}
