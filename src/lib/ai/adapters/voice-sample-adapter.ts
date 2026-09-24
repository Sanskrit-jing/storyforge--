/**
 * 声纹样本提取适配器（VOICE-SAMPLE）——从该角色已写正文中摘录「代表性台词候选」。
 *
 * 边界：AI 只产候选（逐字引文 + 出处 + 推荐理由），勾选确认由作者完成；
 * 写回经 adopt({ target:'characters', recordId }) 收口到 FIELD_REGISTRY 已登记的 voiceSamples。
 * 逐字校验：候选引文归一化后必须能在证据原文中找到，防止 AI 编造台词。
 */
import type { ChatMessage, Character } from '../../types'

export interface VoiceSampleCandidate {
  /** 逐字引文（必须是正文原话） */
  quote: string
  /** 出处（章节/场景标注） */
  chapterTitle: string
  /** 推荐理由（为什么这条能代表该角色的声纹） */
  reason: string
}

export interface VoiceSampleExtractArgs {
  character: Character
  /** 该角色在正文中的真实表现（CONTEXT_SOURCES.characterPassages 产出） */
  passagesContext: string
}

export function buildVoiceSampleExtractionPrompt(args: VoiceSampleExtractArgs): ChatMessage[] {
  const { character, passagesContext } = args
  const known = [
    character.speechStyle?.trim() && `语言风格：${character.speechStyle.trim()}`,
    character.personality?.trim() && `性格：${character.personality.trim()}`,
  ].filter(Boolean).join('；') || '（暂无）'

  const system = [
    '你是资深网文编辑。任务：从【正文证据】中为角色摘录最能代表其说话方式的「声纹样本」候选。',
    '硬性要求：',
    '1. quote 必须是正文证据里该角色台词的【逐字原话】，一个字都不能改、不能拼接不同句子；',
    '2. 只选该角色说的话，不要选旁白或别人的话；',
    '3. 优先选最能体现其语气、用词习惯、口头禅的台词；',
    '4. 没有合适的台词就返回空数组，绝不编造。',
    '只输出 JSON 数组，不要解释、不要 markdown：',
    '[{"quote":"逐字台词","chapterTitle":"出处(章节/场景)","reason":"推荐理由"}]',
  ].join('\n')

  const user = [
    `【角色】${character.name || '未命名'}`,
    `【已有声音设定】${known}`,
    `【正文证据】\n${passagesContext || '（暂无正文）'}`,
    '请摘录 3-8 条声纹候选。',
  ].join('\n\n')

  return [{ role: 'system', content: system }, { role: 'user', content: user }]
}

/** 解析 AI 输出为候选列表（非法项丢弃）。 */
export function parseVoiceSampleCandidates(raw: string): VoiceSampleCandidate[] {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let arr: unknown
  try { arr = JSON.parse(raw.slice(start, end + 1)) } catch { return [] }
  if (!Array.isArray(arr)) return []
  const out: VoiceSampleCandidate[] = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    if (typeof rec.quote !== 'string' || !rec.quote.trim()) continue
    out.push({
      quote: rec.quote.trim(),
      chapterTitle: typeof rec.chapterTitle === 'string' ? rec.chapterTitle.trim() : '',
      reason: typeof rec.reason === 'string' ? rec.reason.trim() : '',
    })
  }
  return out
}

/** 归一化：去掉所有空白差异后比对（排版空格/换行不影响逐字性）。 */
function normalizeForVerify(text: string): string {
  return text.replace(/\s+/g, '')
}

/** 逐字校验：只保留确实出现在证据原文中的引文（防 AI 编造）。 */
export function verifyVoiceSampleCandidates(
  candidates: VoiceSampleCandidate[],
  passagesContext: string,
): VoiceSampleCandidate[] {
  const haystack = normalizeForVerify(passagesContext)
  return candidates.filter(c => haystack.includes(normalizeForVerify(c.quote)))
}

/** 合并已有样本与勾选候选：每行一条「【出处】台词」，按台词内容去重。 */
export function mergeVoiceSamples(existing: string | undefined, picked: VoiceSampleCandidate[]): string {
  const lines = (existing ?? '').split('\n').map(l => l.trim()).filter(Boolean)
  const seen = new Set(lines.map(line => line.replace(/^【[^】]*】/, '')))
  for (const c of picked) {
    if (seen.has(c.quote)) continue
    seen.add(c.quote)
    lines.push(c.chapterTitle ? `【${c.chapterTitle}】${c.quote}` : c.quote)
  }
  return lines.join('\n')
}
