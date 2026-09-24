/**
 * 全局写作偏好（localStorage 持久化，读取失败时回退默认值）。
 *
 * PROSE-CRAFT:真人感写作约束组，各项默认开启——生成与改写正文时提醒 AI：
 * - emotionExternalization 情绪外化：把情绪外化为动作/神态/语气，而不是直接写「他很生气」式标签。
 * - imagery 画面感：环境/打斗/天象用镜头取景式细节展示，不做形容词定性。
 * - sensoryImmersion 代入感：用人物感官（动作/触觉/留白）展示处境，不做旁观者总结。
 */
const STORAGE_PREFIX = 'sf.writingPrefs.'

const DEFAULTS = {
  emotionExternalization: true,
  imagery: true,
  sensoryImmersion: true,
} as const

export type WritingPreferenceKey = keyof typeof DEFAULTS

function readPref(key: WritingPreferenceKey): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    return raw == null ? DEFAULTS[key] : raw === '1'
  } catch {
    return DEFAULTS[key]
  }
}

function writePref(key: WritingPreferenceKey, enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, enabled ? '1' : '0')
  } catch {
    // 隐私模式等存储失败：本次会话内退化为不可持久，不影响功能
  }
}

export function isEmotionExternalizationEnabled(): boolean {
  return readPref('emotionExternalization')
}

export function setEmotionExternalizationEnabled(enabled: boolean): void {
  writePref('emotionExternalization', enabled)
}

export function isImageryEnabled(): boolean {
  return readPref('imagery')
}

export function setImageryEnabled(enabled: boolean): void {
  writePref('imagery', enabled)
}

export function isSensoryImmersionEnabled(): boolean {
  return readPref('sensoryImmersion')
}

export function setSensoryImmersionEnabled(enabled: boolean): void {
  writePref('sensoryImmersion', enabled)
}
