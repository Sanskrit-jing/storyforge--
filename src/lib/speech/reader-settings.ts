import { isValidReaderBarPosition, type ReaderBarPosition } from './reader-bar'

/**
 * 正文朗读偏好 · 单一事实源（全局持久）。
 *
 * 语速/语音属于「听书偏好」，应跨章保持、刷新不丢——存 localStorage，
 * 与编辑器排版偏好（editor-typography）同模式，不写入 IndexedDB、不进入章节正文。
 * 语音通过 voiceURI 匹配系统语音；换设备后 URI 失效时回落自动选择中文语音。
 */
export interface ReaderSettings {
  /** 语速：0.7 / 0.9 / 1 / 1.2 / 1.5 */
  rate: number
  /** 系统语音 voiceURI；空串 = 自动选择中文语音 */
  voiceURI: string
  /**
   * 远程 TTS 服务地址（用户自部署的 Cloudflare Worker）。
   * 空串 = 使用浏览器内置 Web Speech API（APK/HAP 无 TTS 时朗读不可用）；
   * 填了则走远程引擎，获得 Edge Neural 人声。
   */
  ttsBaseUrl: string
  /** 远程 TTS 服务 API Key（Bearer 认证；用户在 Worker 环境变量中自设的值） */
  ttsApiKey: string
}

const KEY = 'storyforge-speech-reader'

export const READER_RATES = [0.7, 0.9, 1, 1.2, 1.5] as const

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  rate: 1,
  voiceURI: '',
  ttsBaseUrl: '',
  ttsApiKey: '',
}

export function loadReaderSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const obj = JSON.parse(raw) as Partial<ReaderSettings>
      return {
        rate: READER_RATES.includes(obj.rate as (typeof READER_RATES)[number]) ? obj.rate! : 1,
        voiceURI: typeof obj.voiceURI === 'string' ? obj.voiceURI : '',
        ttsBaseUrl: typeof obj.ttsBaseUrl === 'string' ? obj.ttsBaseUrl : '',
        ttsApiKey: typeof obj.ttsApiKey === 'string' ? obj.ttsApiKey : '',
      }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_READER_SETTINGS }
}

export function saveReaderSettings(settings: ReaderSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch { /* 隐私模式等场景静默失败 */ }
}

// —— 控制条位置（独立键，不与听书偏好混存） ——

const BAR_KEY = 'storyforge-speech-reader-bar'

/** 读取控制条位置；无存储或结构非法时返回 null（= 默认底部居中） */
export function loadReaderBarPosition(): ReaderBarPosition | null {
  try {
    const raw = localStorage.getItem(BAR_KEY)
    if (!raw) return null
    const obj = JSON.parse(raw) as unknown
    return isValidReaderBarPosition(obj) ? { x: obj.x, y: obj.y } : null
  } catch { /* ignore */ }
  return null
}

/** 保存控制条位置（拖动提交时调用；隐私模式等场景静默失败） */
export function saveReaderBarPosition(position: ReaderBarPosition): void {
  try {
    localStorage.setItem(BAR_KEY, JSON.stringify(position))
  } catch { /* ignore */ }
}
