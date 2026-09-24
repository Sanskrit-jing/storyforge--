/**
 * 单字段 AI 重生成（采纳前草稿的手动修正增强）
 *
 * 场景：AI 生成结果在采纳前允许手动编辑；用户改完某个字段后，
 * 可让 AI「以编辑后内容为要求」重新生成该字段，其余字段原样保留。
 *
 * 与 composeFieldGenerationHint（流式整段生成的 hint 组装）不同，
 * 这里是单字段非流式轻量调用：prompt 独立组装，只输出该字段的新内容。
 */
import type { AIConfig } from '../types'
import { chat } from './client'

export interface RegenerateFieldOptions {
  /** 字段中文标签，如「世界来源」，用于 prompt 指明目标 */
  fieldLabel: string
  /** 编辑后的字段内容 —— 默认作为本次重生成的核心要求 */
  currentValue: string
  /** 可选补充要求（用户在弹层中额外输入） */
  userHint?: string
  /** 可选上下文块（项目名/题材/同结果其他字段摘要等），帮助 AI 保持整体一致 */
  contextBlock?: string
  aiConfig: AIConfig
  /** 消耗统计归属 */
  projectId?: number | null
  /** 消耗统计分类，如 'inspiration.reverse' */
  category?: string
  signal?: AbortSignal
}

/** 组装单字段重生成的用户 prompt（导出以便测试与未来复用） */
export function buildFieldRegeneratePrompt(options: {
  fieldLabel: string
  currentValue: string
  userHint?: string
  contextBlock?: string
}): string {
  const parts: string[] = []
  if (options.contextBlock?.trim()) {
    parts.push(`【背景上下文】\n${options.contextBlock.trim()}`)
  }
  parts.push(
    `【目标字段】${options.fieldLabel}`,
    `【我对该字段的要求】\n以下是我手动修改后的内容，它表达了我对这个字段最终的期望（可能是完整的期望描述，也可能是大致方向）：\n${options.currentValue.trim() || '（内容为空，请根据上下文与补充要求从零生成。）'}`,
  )
  if (options.userHint?.trim()) {
    parts.push(`【补充要求】\n${options.userHint.trim()}`)
  }
  parts.push(
    '【执行要求】\n1. 只重新生成「目标字段」这一项内容，不要输出其他字段。\n2. 以「我对该字段的要求」为核心：其中明确的设定、方向、措辞倾向必须体现；表述含糊处可结合背景上下文合理补全。\n3. 与背景上下文中其他信息保持一致，不得引入与其矛盾或无关的重大设定。\n4. 直接输出字段正文本身：不要任何标题、字段名、序号、引号包裹或解释性文字。',
  )
  return parts.join('\n\n')
}

/**
 * 单字段重生成：非流式 chat 调用，返回该字段的新内容文本。
 * 调用方负责配置就绪检查（isAIConfigReady）与 loading/error 状态。
 */
export async function regenerateField(options: RegenerateFieldOptions): Promise<string> {
  const prompt = buildFieldRegeneratePrompt({
    fieldLabel: options.fieldLabel,
    currentValue: options.currentValue,
    userHint: options.userHint,
    contextBlock: options.contextBlock,
  })
  const messages = [
    {
      role: 'system' as const,
      content:
        '你是专业的小说创作助手，正在协助用户打磨 AI 生成、尚未采纳的草稿。用户会手动修改某个字段来表达期望，你需要严格按要求重写该字段，输出纯净的正文。',
    },
    { role: 'user' as const, content: prompt },
  ]
  return chat(
    messages,
    options.aiConfig,
    { category: options.category, projectId: options.projectId },
    options.signal,
  )
}
