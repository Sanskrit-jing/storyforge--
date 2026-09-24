/**
 * AI 语义同步（数据层）。
 *
 * 补齐全局精确替换覆盖不到的场景：源模块的变更改变了语义
 * （如设定更名、规则调整、人物关系重定义），其他模块用不同措辞
 * 引用该语义的文本需要联动改写。流程：
 * 1) 收集 GLOBAL_REPLACE_TABLES 白名单文本字段的候选内容
 *    （focusKeyword 可选预筛；html 字段——章节正文——不参与：
 *    AI 全文改写无法安全写回 TipTap HTML，正文旧词由精确替换覆盖）；
 * 2) AI 返回结构化改写建议（完整新文本，非 diff）；
 * 3) 校验建议只能落在白名单字段上，并读取当前真实值；
 * 4) 确认后走 applyGlobalReplaceChange 同款写回分流
 *    （ADOPTION_BY_TARGET → adopt()，否则直接 update）+
 *    transactionTablesFor('importProject') 事务 + manual 快照 + UndoPatch。
 */
import type { AIConfig, ChatMessage } from '../types'
import { chat, resolveRequestConfig } from '../ai/client'
import { db } from '../db/schema'
import {
  dataTable,
  applyGlobalReplaceChange,
  GLOBAL_REPLACE_TABLES,
  type GlobalReplaceUndoPatch,
} from './global-find-replace'
import { transactionTablesFor } from '../registry/lifecycle'

/** 消耗统计分类（creation 类改写任务） */
export const SEMANTIC_SYNC_CATEGORY = 'editor.semantic-sync'

/** 单字段送入 AI 的文本上限（字符） */
const FIELD_TEXT_LIMIT = 1500
/** 全部候选文本总上限（字符），超出截断并提示 */
const TOTAL_TEXT_LIMIT = 30000
/** 单次建议数量上限 */
const MAX_SUGGESTIONS = 60

export interface SemanticSyncRequest {
  /** 变更说明：发生了什么变更、期望如何联动（如「主角改名：林尘→陆沉」） */
  changeSummary: string
  /** 旧关键词（可选）：用于预筛候选记录，减少送入 AI 的文本量 */
  focusKeyword?: string
  /** 限定参与的模块 target 列表（默认全部登记模块） */
  targets?: string[]
}

export interface SemanticSyncCandidate {
  key: string
  target: string
  targetLabel: string
  id: number
  recordLabel: string
  field: string
  fieldLabel: string
  text: string
}

export interface SemanticSyncSuggestion {
  key: string
  target: string
  id: number
  field: string
  targetLabel: string
  recordLabel: string
  fieldLabel: string
  /** 执行时读取的真实当前值 */
  currentText: string
  /** AI 建议的完整新文本 */
  suggestedText: string
  reason: string
}

export interface SemanticSyncRunResult {
  suggestions: SemanticSyncSuggestion[]
  scannedFields: number
  /** 候选文本超出总上限被截断 */
  truncated: boolean
}

export interface SemanticSyncExecuteResult {
  snapshotId: number
  changedRecords: number
  undoPatch: GlobalReplaceUndoPatch
}

// ─────────────────────────────────────────────────────────────
// 候选收集
// ─────────────────────────────────────────────────────────────

export async function collectSemanticSyncCandidates(
  projectId: number,
  request: SemanticSyncRequest,
): Promise<{ candidates: SemanticSyncCandidate[]; scannedFields: number; truncated: boolean }> {
  const targetFilter = request.targets?.length ? new Set(request.targets) : null
  const focus = (request.focusKeyword ?? '').trim().toLowerCase()
  const candidates: SemanticSyncCandidate[] = []
  let totalLength = 0
  let scannedFields = 0
  let truncated = false

  for (const spec of GLOBAL_REPLACE_TABLES) {
    if (targetFilter && !targetFilter.has(spec.target)) continue
    const textFields = spec.fields.filter(field => field.kind === 'text')
    if (!textFields.length) continue
    const rows = await dataTable(spec.target).where('projectId').equals(projectId).toArray()

    for (const row of rows) {
      if (typeof row.id !== 'number') continue
      const recordLabel = typeof spec.recordLabel === 'function'
        ? spec.recordLabel(row)
        : (() => {
            const name = row.name ?? row.title ?? row.entityName
            return typeof name === 'string' && name.trim() ? name : `记录 #${String(row.id)}`
          })()

      for (const fieldSpec of textFields) {
        const raw = row[fieldSpec.field]
        if (typeof raw !== 'string' || !raw.trim()) continue
        scannedFields += 1
        const text = raw.length > FIELD_TEXT_LIMIT ? raw.slice(0, FIELD_TEXT_LIMIT) : raw
        if (!text.trim()) continue
        if (focus && !raw.toLowerCase().includes(focus) && !text.toLowerCase().includes(focus)) continue
        if (totalLength + text.length > TOTAL_TEXT_LIMIT) {
          truncated = true
          continue
        }
        totalLength += text.length
        candidates.push({
          key: `${spec.target}#${row.id}:${fieldSpec.field}`,
          target: spec.target,
          targetLabel: spec.label,
          id: row.id,
          recordLabel,
          field: fieldSpec.field,
          fieldLabel: fieldSpec.label,
          text,
        })
      }
    }
  }

  return { candidates, scannedFields, truncated }
}

// ─────────────────────────────────────────────────────────────
// AI 调用与解析
// ─────────────────────────────────────────────────────────────

function buildPrompt(request: SemanticSyncRequest, candidates: SemanticSyncCandidate[]): ChatMessage[] {
  const listText = candidates
    .map(candidate => `[${candidate.key}] ${candidate.targetLabel}「${candidate.recordLabel}」·${candidate.fieldLabel}：\n${candidate.text}`)
    .join('\n---\n')

  return [
    {
      role: 'system',
      content: [
        '你是小说项目的一致性编辑。作者对项目做了一处变更（见「变更说明」），',
        '你需要在提供的各模块字段文本中找出语义上需要联动改写的位置，',
        '并输出改写后的完整新文本。',
        '',
        '规则：',
        '1. 只改写与变更说明语义相关的文本；无关文本、措辞不同但含义已正确的文本不要输出；',
        '2. 保持原文的风格、人称与信息量，只修改需要联动的部分；',
        '3. 不确定是否需要修改时，宁可不输出；',
        '4. suggestedText 必须是改写后的完整字段内容本身（不是 diff、不是片段、不是解释）；',
        '   候选列表中每条开头的「[key] 模块「记录」·字段：」只是元数据标签，不属于正文，',
        '   绝不能把这类标签、字段名或冒号前缀写进 suggestedText；',
        '5. 严格输出 JSON，不要输出任何其他文字。',
        '',
        '示例：候选 `[characters#3:name] 角色「王轩」·姓名：` 的正文是「王轩」，变更说明为「主角王轩改名为陆沉」，则该字段输出 {"key":"characters#3:name","suggestedText":"陆沉","reason":"主角改名"}。',
        '',
        '输出格式：',
        '{"suggestions":[{"key":"表名#记录ID:字段名","suggestedText":"改写后的完整文本","reason":"简要理由"}]}',
        '没有需要改写的内容时输出 {"suggestions":[]}。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【变更说明】\n${request.changeSummary.trim()}`,
        '',
        `【候选字段文本】（共 ${candidates.length} 条）`,
        listText,
      ].join('\n'),
    },
  ]
}

interface RawSuggestion {
  key?: unknown
  suggestedText?: unknown
  reason?: unknown
}

/**
 * AI 偶尔会把候选条目的元数据标签行（形如 `角色「王轩」·姓名：`）整行
 * 当作正文输出，或作为前缀复制进 suggestedText；直接写库会污染字段。
 * 清洗规则：
 * - 仅当标签中的字段名与候选 fieldLabel 精确一致时才剥离前缀
 *   （字段名不一致时视为无效输出直接丢弃，避免误伤真实正文）；
 * - 剥离或修剪后为空（整行就是标签、无正文）时返回 null 丢弃建议：
 *   宁可漏改，也不把标签行写进用户数据。
 */
const META_LABEL_PREFIX_RE = /^[^「」\n]{0,16}「[^「」\n]{1,48}」·([^「」\n：:]{1,16})[：:]\s*/

function normalizeSuggestedText(text: string, fieldLabel: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const match = trimmed.match(META_LABEL_PREFIX_RE)
  if (!match) return trimmed
  if (match[1] !== fieldLabel) return null
  return trimmed.slice(match[0].length).trim() || null
}

export async function runSemanticSync(args: {
  projectId: number
  request: SemanticSyncRequest
  aiConfig: AIConfig
}): Promise<SemanticSyncRunResult> {
  if (!args.request.changeSummary.trim()) {
    throw new Error('请先描述变更内容')
  }

  const { candidates, scannedFields, truncated } = await collectSemanticSyncCandidates(args.projectId, args.request)
  if (!candidates.length) {
    return { suggestions: [], scannedFields, truncated }
  }

  const effectiveConfig = resolveRequestConfig(args.aiConfig, { category: SEMANTIC_SYNC_CATEGORY }).config
  const raw = await chat(
    buildPrompt(args.request, candidates),
    effectiveConfig,
    { category: SEMANTIC_SYNC_CATEGORY, projectId: args.projectId },
  )

  let parsed: { suggestions?: unknown }
  try {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start < 0 || end <= start) throw new Error('no json')
    parsed = JSON.parse(raw.slice(start, end + 1)) as { suggestions?: unknown }
  } catch {
    throw new Error('AI 返回格式无法解析，请重试')
  }
  const rows = Array.isArray(parsed.suggestions) ? parsed.suggestions : []

  const candidateByKey = new Map(candidates.map(candidate => [candidate.key, candidate]))
  const seenKeys = new Set<string>()
  const suggestions: SemanticSyncSuggestion[] = []

  for (const value of rows) {
    if (suggestions.length >= MAX_SUGGESTIONS) break
    if (!value || typeof value !== 'object') continue
    const row = value as RawSuggestion
    const key = typeof row.key === 'string' ? row.key : ''
    const candidate = candidateByKey.get(key)
    if (!candidate || seenKeys.has(key)) continue
    const suggestedText = normalizeSuggestedText(
      typeof row.suggestedText === 'string' ? row.suggestedText : '',
      candidate.fieldLabel,
    )
    if (!suggestedText || suggestedText === candidate.text.trim()) continue
    seenKeys.add(key)
    // 读取当前真实值，避免候选收集与执行之间数据漂移
    const current = await dataTable(candidate.target).get(candidate.id)
    const currentText = current ? current[candidate.field] : candidate.text
    if (typeof currentText !== 'string' || currentText.trim() === suggestedText) continue
    suggestions.push({
      key,
      target: candidate.target,
      id: candidate.id,
      field: candidate.field,
      targetLabel: candidate.targetLabel,
      recordLabel: candidate.recordLabel,
      fieldLabel: candidate.fieldLabel,
      currentText,
      suggestedText,
      reason: typeof row.reason === 'string' && row.reason.trim() ? row.reason.trim() : 'AI 判断需要联动改写',
    })
  }

  return { suggestions, scannedFields, truncated }
}

// ─────────────────────────────────────────────────────────────
// 执行写入
// ─────────────────────────────────────────────────────────────

export async function executeSemanticSyncSuggestions(args: {
  projectId: number
  suggestions: SemanticSyncSuggestion[]
  createSnapshot: (projectId: number, label: string, type: 'auto' | 'manual') => Promise<number>
  label: string
}): Promise<SemanticSyncExecuteResult> {
  if (!args.suggestions.length) throw new Error('请先勾选要应用的同步建议')

  const snapshotId = await args.createSnapshot(args.projectId, args.label, 'manual')
  const changes: { target: string; id: number; field: string; before: unknown; after: string }[] = []

  await db.transaction('rw', transactionTablesFor('importProject'), async () => {
    for (const suggestion of args.suggestions) {
      const current = await dataTable(suggestion.target).get(suggestion.id)
      if (!current) throw new Error(`记录已不存在：${suggestion.target} #${suggestion.id}`)
      const beforeValue = current[suggestion.field]
      if (typeof beforeValue !== 'string') {
        throw new Error(`字段已变化：${suggestion.targetLabel}「${suggestion.recordLabel}」·${suggestion.fieldLabel}，请重新生成建议`)
      }
      if (beforeValue === suggestion.suggestedText) continue
      changes.push({
        target: suggestion.target,
        id: suggestion.id,
        field: suggestion.field,
        before: beforeValue,
        after: suggestion.suggestedText,
      })
    }
    if (!changes.length) throw new Error('选中的建议与当前内容一致，无需应用')
    for (const change of changes) {
      await applyGlobalReplaceChange(args.projectId, {
        target: change.target,
        id: change.id,
        before: { [change.field]: change.before },
        after: { [change.field]: change.after },
      }, 'after')
    }
  })

  return {
    snapshotId,
    changedRecords: new Set(changes.map(change => `${change.target}#${change.id}`)).size,
    undoPatch: {
      label: `${args.label} · 快照 #${snapshotId}`,
      snapshotId,
      projectId: args.projectId,
      query: 'AI 语义同步',
      replacement: '',
      changes: changes.map(change => ({
        target: change.target,
        id: change.id,
        before: { [change.field]: change.before },
        after: { [change.field]: change.after },
      })),
    },
  }
}
