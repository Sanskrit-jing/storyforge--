/**
 * KB-1 全局知识库（globalKnowledgeEntries）· 查阅式参考手册。
 *
 * 作者手写的写作范例与约定：每条 = 主题（title）+ 可选触发词（triggers）+
 * 范例/约定正文（content）。知识条目不常驻注入 AI 上下文；AI 写到相关情节时
 * 通过 search_knowledge 工具按主题主动查询，节点模式可手动勾选条目进上下文。
 * 表生命周期登记在 PROJECT_TABLES：owner='global'，删项目/删世界不影响。
 */

export const KNOWLEDGE_CATEGORIES = [
  '情感', // 喜欢/愤怒/悲伤等情绪与感情戏
  '人物', // 外貌、性格、微表情、角色塑造
  '对话', // 台词、语气、潜台词
  '打斗', // 动作、战斗、追逐场面
  '特效', // 法术、能量、光影等视觉效果
  '武器', // 飞剑、法宝、神兵的描写与展示
  '功法', // 功法运转、修炼、施法过程
  '境界突破', // 闭关、冲击瓶颈、渡劫飞升
  '灵物', // 灵草、丹药、矿脉、天材地宝
  '灵兽', // 灵兽、妖兽、契约与驯养
  '场景', // 环境、氛围、五感描写
  '文风', // 句式、节奏、比喻、叙事口吻
  '情节', // 转折、伏笔、开篇钩子、章末悬念
  '世界观', // 力量体系、历史、势力等设定约定
  '禁忌红线', // 不允许出现的内容与写法
  '其他',
] as const
export type KnowledgeCategory = typeof KNOWLEDGE_CATEGORIES[number]

/** 触发词边界：单条目最多 12 个触发词，单个触发词最多 30 字符 */
export const KNOWLEDGE_MAX_TRIGGERS = 12
export const KNOWLEDGE_MAX_TRIGGER_LENGTH = 30

export interface GlobalKnowledgeEntry {
  id?: number
  /** 主题名；AI 查询的主要匹配目标，注入时作为小节标题 */
  title: string
  content: string
  /** 分类仅用于 UI 分组，不参与查询匹配 */
  category: KnowledgeCategory | string
  /** 条目级开关；停用条目不参与查询，也不可被勾选注入 */
  enabled: boolean
  /** 可选触发词（如「喜欢」→ 心动/告白）；查询命中任一即返回本条 */
  triggers?: string[]
  createdAt: number
  updatedAt: number
}

/** 清洗触发词：去空白、截长、去重、限量。 */
export function normalizeKnowledgeTriggers(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of value) {
    if (typeof raw !== 'string') continue
    const trigger = raw.trim().slice(0, KNOWLEDGE_MAX_TRIGGER_LENGTH)
    if (!trigger || seen.has(trigger)) continue
    seen.add(trigger)
    result.push(trigger)
    if (result.length >= KNOWLEDGE_MAX_TRIGGERS) break
  }
  return result
}
