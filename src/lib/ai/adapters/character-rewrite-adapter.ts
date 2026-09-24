/**
 * 角色维度重写适配器（CHARACTER-REWRITE）——作者对某维度已有内容不满意，
 * 让 AI 按自己的要求（userHint）重新生成该维度的内容。
 *
 * 边界：AI 只产文本候选，作者预览（可改）并点击替换后才写回；
 * 写回经 adopt({ target:'characters', recordId }) 收口到 FIELD_REGISTRY 已登记的维度字段。
 * 不新增 prompt-seed(单字段纯文本输出无需模板),在此就地构造受控 prompt。
 *
 * 与 src/lib/ai/field-regenerate.ts 的边界：后者面向「采纳前草稿」的单字段打磨
 * （内容尚未入库,用户手改值即期望值,非流式 chat,不走 adopt）；本链路面向
 * 「已入库角色维度」的替换重写（流式预览 + assembleContext 世界观上下文 +
 * adopt() 定点写回,替换前旧内容保持不变）。场景不同,不互相替代。
 */
import type { ChatMessage, Character } from '../../types'
import { CHARACTER_DIMENSIONS, type CharacterDimensionKey } from '../../character/character-dimensions'

export interface CharacterRewriteArgs {
  character: Character
  /** 要重写的维度 key */
  dimensionKey: CharacterDimensionKey
  /** 世界观/力量体系等上下文（CONTEXT_SOURCES 装配） */
  worldContext: string
  /** 作者的重写要求（可空——纯「不满意，换个思路重新来」） */
  userHint?: string
}

const labelOf = (k: CharacterDimensionKey) => CHARACTER_DIMENSIONS.find(d => d.key === k)?.label ?? k

export function buildCharacterRewritePrompt(args: CharacterRewriteArgs): ChatMessage[] {
  const { character, dimensionKey, worldContext, userHint } = args
  const label = labelOf(dimensionKey)
  const current = ((character[dimensionKey] as string) ?? '').trim()
  // 其它已有设定（排除正在重写的维度），让 AI 据此保持一致
  const known = CHARACTER_DIMENSIONS
    .filter(d => d.key !== dimensionKey && ((character[d.key] as string) ?? '').trim())
    .map(d => `- ${d.label}：${((character[d.key] as string) ?? '').trim()}`)
    .join('\n') || '（暂无）'

  const system = [
    `你是资深网文角色设计师。任务：按作者的要求重写角色「${label}」这一个维度的设定。`,
    '硬性要求：',
    `1. 只输出「${label}」的新内容纯文本,不要输出其它字段、不要解释、不要标题、不要 markdown 代码块；`,
    '2. 新内容必须与该角色的【其它已有设定】一致、不冲突；',
    '3. 作者给了具体要求时,必须严格按要求重写；作者没给要求时,换一个与当前内容明显不同的思路重写；',
    '4. 内容要具体、可直接使用,符合该角色定位与世界观。',
  ].join('\n')

  const user = [
    `【角色】${character.name || '未命名'}`,
    `【其它已有设定】\n${known}`,
    `【世界观/设定】\n${worldContext || '（暂无）'}`,
    `【当前「${label}」内容（作者不满意的旧版本）】\n${current || '（空）'}`,
    `【作者的重写要求】${userHint?.trim() || '（未填写——请换一个明显不同的思路重写）'}`,
    `现在请输出「${label}」的新内容（纯文本）。`,
  ].join('\n\n')

  return [{ role: 'system', content: system }, { role: 'user', content: user }]
}

/** 解析重写输出:剥掉意外的 markdown 代码块包裹后取纯文本;空输出返回 ''。 */
export function parseCharacterRewrite(raw: string): string {
  const fenced = raw.match(/```(?:\w*\n)?([\s\S]*?)```/)
  const text = (fenced ? fenced[1] : raw).trim()
  return text
}
