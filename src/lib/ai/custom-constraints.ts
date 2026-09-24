/**
 * CUSTOM-CONSTRAINT:作者自定义写法约束（作品级，存 creativeRules.customConstraints）。
 * 注入路径与内置 PROSE-CRAFT 三约束一致（guard 链追加，位于三条内置约束之后）；
 * 条目由作者手写管理（创作规则页），非 AI 写入，不走 FIELD_REGISTRY。
 */
import type { CustomWritingConstraint } from '../types/creative-rules'
import { db } from '../db/schema'

/**
 * 容错解析:坏 JSON / 非数组 / 缺关键字段的条目一律丢弃,永不抛错。
 * 空正文条目保留(草稿态)——「添加」后未填写完成前不能在保存回读时被丢弃;
 * 注入侧由 formatCustomConstraintsGuard 跳过空正文。
 */
export function parseCustomConstraints(raw: string | undefined | null): CustomWritingConstraint[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is CustomWritingConstraint => {
      if (item == null || typeof item !== 'object') return false
      const candidate = item as Partial<CustomWritingConstraint>
      return typeof candidate.id === 'string' && candidate.id.trim().length > 0
        && typeof candidate.content === 'string'
    })
  } catch {
    return []
  }
}

export function serializeCustomConstraints(list: CustomWritingConstraint[]): string {
  return JSON.stringify(list)
}

/** 新条目 id:时间戳 + 随机段,前端生成即可满足唯一性。 */
export function newConstraintId(): string {
  return `cc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 渲染为注入文本段(不含头尾包裹,由 guard 函数统一包);无启用条目/空正文草稿不注入。 */
export function formatCustomConstraintsGuard(list: CustomWritingConstraint[]): string {
  const enabled = list.filter(item => item.enabled && item.content.trim().length > 0)
  if (enabled.length === 0) return ''
  return enabled
    .map(item => {
      const title = (item.title || '').trim()
      return title ? `【${title}】\n${item.content.trim()}` : item.content.trim()
    })
    .join('\n\n')
}

/** 异步读取当前项目的自定义约束注入段(仅启用条目);无配置/无启用条目返回空串。 */
export async function readCustomConstraintsGuard(projectId: number | undefined | null): Promise<string> {
  if (projectId == null) return ''
  const rules = await db.creativeRules.where('projectId').equals(projectId).first()
  if (!rules) return ''
  return formatCustomConstraintsGuard(parseCustomConstraints(rules.customConstraints))
}
