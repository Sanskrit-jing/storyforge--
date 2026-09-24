/**
 * 世界观面板字段级互参上下文（三注册表收口）。
 *
 * 世界观各面板（世界起源/自然环境/人文环境/故事核心）生成单个字段时，
 * 需要「其余字段」做互参上下文。历史上各面板手拼 slice(0,100~300) 摘要，
 * 绕过了 CONTEXT_SOURCES 的预算管理；现统一收口为走注册表 worldview 源：
 * 全量字段注入、按 excludeKeys 排除「正在生成的字段」自身，
 * 预算由 assembleContext 的 capBySourceBudget / trimToFit 兜底。
 */
import { assembleContext } from './assemble-context'

export async function assembleWorldviewPeerContext(
  projectId: number,
  worldGroupId: number | null,
  excludeKeys: string[],
): Promise<string> {
  return (await assembleContext({
    projectId,
    worldGroupId,
    sourceKeys: ['worldview'],
    worldviewExcludeKeys: excludeKeys,
  })).text
}
