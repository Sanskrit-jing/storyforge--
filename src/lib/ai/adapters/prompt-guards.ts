import type { ChatMessage } from '../../types'

export const SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT = [
  '【语言输出硬约束】',
  '除用户原文明确要求保留的专名、术语、代码、JSON key 外，所有面向读者的标题、summary、目标、说明和正文内容必须使用自然流畅的简体中文。',
  '禁止中英夹杂，禁止输出整句英文，禁止把英文变量名、英文示例或 prompt key 写进创作结果。',
  '如果输入资料中混有英文，请先在内部理解并转写为中文表达；不要原样扩散到大纲或正文。',
].join('\n')

export function appendUserConstraint(messages: ChatMessage[], constraint: string): ChatMessage[] {
  const next = messages.map(message => ({ ...message }))
  const user = [...next].reverse().find(message => message.role === 'user')
  if (user) user.content = `${user.content}\n\n${constraint}`
  return next
}

export function appendSimplifiedChineseOutputConstraint(messages: ChatMessage[]): ChatMessage[] {
  return appendUserConstraint(messages, SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT)
}

/** STYLE-SHORT-PATH:改写短链路的作者文风注入。空/缺省原样返回,不产生多余约束。 */
export function appendStyleContext(messages: ChatMessage[], styleContext?: string): ChatMessage[] {
  const text = styleContext?.trim()
  if (!text) return messages
  return appendUserConstraint(messages, text)
}

/**
 * CUSTOM-CONSTRAINT:作者自定义写法约束段(readCustomConstraintsGuard 产出,仅启用条目)。
 * 空/缺省原样返回;注入位置在内置 PROSE-CRAFT 三约束之后。
 */
export function appendCustomConstraintsGuard(messages: ChatMessage[], customConstraints?: string): ChatMessage[] {
  const text = customConstraints?.trim()
  if (!text) return messages
  return appendUserConstraint(messages, text)
}

export const EMOTION_EXTERNALIZATION_CONSTRAINT = [
  '【情绪外化写法】',
  '叙述人物情绪时禁止直接贴标签（如"他很生气""她很紧张""他很伤心"），必须把情绪外化为动作、神态、语气、生理反应和环境细节。',
  '示例：愤怒不写"他很愤怒"，而写双手紧握、死死盯着对方，随后忽然哈哈大笑——"好，好，好，好的很"（怒极反笑）。',
  '人物对话与内心独白中确需直陈情绪的可以保留，其余叙述一律外化。',
].join('\n')

/** EMOTION-GUARD:情绪外化轻约束。调用方按写作偏好开关决定是否附加。 */
export function appendEmotionExternalizationGuard(messages: ChatMessage[]): ChatMessage[] {
  return appendUserConstraint(messages, EMOTION_EXTERNALIZATION_CONSTRAINT)
}

export const IMAGERY_CONSTRAINT = [
  '【画面感写法】',
  '环境、打斗、天象描写禁止名词堆砌和形容词定性（如"荒凉死寂""气氛压抑""威力巨大""气势磅礴"），必须用镜头取景的方式，筛选有情绪重量的细节展示画面，不强行下结论。',
  '示例：荒凉山谷不写"到处乱石、草木枯萎、一片灰暗压抑"，而写风卷着碎石在谷底滚、枯草根死死扒在裂开的岩石上、连飞鸟都不肯落进来；打斗不写"剑气纵横、大地开裂、战况凶险"，而写剑刃相撞迸出火星、脚下岩石应声崩碎、尘土呛进喉咙。',
  '人物对话与直接感受中确需概括的可以保留，其余叙述一律用画面代替定性。',
].join('\n')

/** PROSE-CRAFT:画面感轻约束。调用方按写作偏好开关决定是否附加。 */
export function appendImageryGuard(messages: ChatMessage[]): ChatMessage[] {
  return appendUserConstraint(messages, IMAGERY_CONSTRAINT)
}

export const SENSORY_IMMERSION_CONSTRAINT = [
  '【代入感写法】',
  '叙述人物处境与状态时禁止旁观者式总结（如"他生活很苦""内心无比绝望""十分可怜"），必须把读者放进人物的感官里——用动作、触觉、生理反应和留白来展示。',
  '示例：写苦不写"满身伤痛、十分可怜"，而写他缓慢脱下衣服、背上纵横交错全是伤痕，垂着眼指尖轻轻摩挲旧疤，淡淡摇头说早就麻木了；写绝望不写"看不到希望"，而写攥紧的手缓缓松开、掌心血印慢慢变淡，望着空无一人的前路很久没有动弹。',
  '对话与内心独白中确需直陈的可以保留，其余叙述一律改为感官化呈现。',
].join('\n')

/** PROSE-CRAFT:代入感轻约束。调用方按写作偏好开关决定是否附加。 */
export function appendSensoryImmersionGuard(messages: ChatMessage[]): ChatMessage[] {
  return appendUserConstraint(messages, SENSORY_IMMERSION_CONSTRAINT)
}
