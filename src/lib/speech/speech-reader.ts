/**
 * 正文语音朗读 · 纯逻辑层。
 *
 * 基于浏览器原生 Web Speech API（window.speechSynthesis）：
 * - 不依赖后端、API Key 或网络（系统本地语音离线可用；系统选择的在线语音由系统自行联网）
 * - 朗读项按正文段落切分，超长段落再按句子切（规避 Chrome 单个 utterance
 *   约 15 秒后被截断的已知缺陷）
 * - 任意时刻只保留「一个」正在朗读的 utterance，下一段只由它的 onend/onerror
 *   推进（单一播放推进源）；暂停/停止/跳转先 cancel 再用代际令牌让旧回调失效，
 *   避免 cancel 触发的回调把队列错误推进
 *
 * 本文件不依赖 React 与 DOM 全局，引擎（SpeechEngine）可注入，便于单测。
 */

/** 一个朗读条目：text 为实际朗读文本；blockPos/blockIndex 指回正文块用于高亮 */
export interface ReaderItem {
  text: string
  /** ProseMirror 文档位置（段落块起点） */
  blockPos: number
  /** 去重后的正文段落序号（同一段被切成多句时相同） */
  blockIndex: number
}

export interface ReaderSnapshot {
  /** 朗读会话是否开启（开启时底部控制条可见） */
  active: boolean
  /** 是否正在出声；false = 已暂停（或已停止） */
  playing: boolean
  /** 当前朗读条目序号 */
  index: number
  /** 朗读条目总数（段落数或长段切句后的句数） */
  total: number
  /** 当前正文段落序号（用于「第 x/y 段」与编辑器高亮） */
  blockIndex: number
  /** 正文段落总数 */
  blockTotal: number
  rate: number
  voiceURI: string
  /**
   * 环境级失败（如系统没有任何可用语音、合成被策略拒绝）：
   * 会话已中止，UI 应提示作者并收起控制条；null 表示正常。
   */
  readerError: 'unavailable' | null
}

/** 语音引擎抽象；生产环境由 window.speechSynthesis 适配，测试可注入 mock */
export interface SpeechEngine {
  getVoices(): SpeechSynthesisVoice[]
  createUtterance(text: string): SpeechSynthesisUtterance
  speak(utterance: SpeechSynthesisUtterance): void
  cancel(): void
  /** 订阅系统语音列表就绪/变化；返回取消订阅函数 */
  onVoicesChanged(cb: () => void): () => void
}

type Listener = (snapshot: ReaderSnapshot) => void

const SINGLE_UTTERANCE_MAX = 160

/**
 * 将段落文本切成适合单次朗读的短条：
 * 先按句末标点（中英文）切句，再把相邻短句合并到 max 以内；
 * 单句仍然过长时按次级停顿（逗号/顿号）切，最后兜底硬切。
 */
export function chunkForSpeech(raw: string, max = SINGLE_UTTERANCE_MAX): string[] {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return []
  if (text.length <= max) return [text]

  const sentences = text.match(/[^。！？；….!?;\n]+[。！？；….!?;]?/g) ?? [text]
  const chunks: string[] = []
  let buffer = ''

  const flushHard = (long: string) => {
    const parts = long.match(/[^，、,:：]+[，、,:：]?/g) ?? [long]
    for (const part of parts) {
      if (part.length <= max) {
        if ((buffer + part).length <= max) {
          buffer += part
        } else {
          if (buffer) chunks.push(buffer)
          buffer = part
        }
      } else {
        if (buffer) { chunks.push(buffer); buffer = '' }
        for (let i = 0; i < part.length; i += max) chunks.push(part.slice(i, i + max))
      }
    }
  }

  for (const sentence of sentences) {
    if (sentence.length <= max && (buffer + sentence).length <= max) {
      buffer += sentence
    } else {
      if (buffer) { chunks.push(buffer); buffer = '' }
      if (sentence.length <= max) buffer = sentence
      else flushHard(sentence)
    }
  }
  if (buffer) chunks.push(buffer)
  return chunks.filter(chunk => chunk.trim().length > 0)
}

/**
 * 把正文块（含 ProseMirror 位置的纯文本）展开为朗读条目。
 * 空段落跳过；超长段落切多句，句子条目共享同一段落的位置与序号。
 */
export function buildReaderItems(blocks: ReadonlyArray<{ pos: number; text: string }>): ReaderItem[] {
  const items: ReaderItem[] = []
  let blockIndex = 0
  for (const block of blocks) {
    const chunks = chunkForSpeech(block.text)
    if (chunks.length === 0) continue // 空段落不占序号
    chunks.forEach(text => items.push({ text, blockPos: block.pos, blockIndex }))
    blockIndex += 1
  }
  return items
}

/** 语音自然度等级：natural = 神经网络语音；online = 在线新一代引擎；classic = 系统老引擎 */
export type VoiceNaturalness = 'natural' | 'online' | 'classic'

/** 按语音名称判定自然度等级（如 Edge 的「… Online (Natural)」在线人声为 natural） */
export function getVoiceNaturalness(voice: SpeechSynthesisVoice): VoiceNaturalness {
  const name = voice.name ?? ''
  if (/natural|neural/i.test(name)) return 'natural'
  if (/online/i.test(name)) return 'online'
  return 'classic'
}

/**
 * 语音自然度评分：名称含 Natural/Neural 的神经网络语音（如 Edge 的
 * 「… Online (Natural)」在线人声）最接近真人，其次带 Online 的新一代引擎，
 * 最后是系统自带的老引擎语音（SAPI/OneCore，听感机械）。
 */
function naturalnessScore(voice: SpeechSynthesisVoice): number {
  const level = getVoiceNaturalness(voice)
  if (level === 'natural') return 2
  if (level === 'online') return 1
  return 0
}

/**
 * 语音按自然度从高到低排序（名称做次级稳定排序，避免不同浏览器列表顺序波动）。
 * 供语音下拉展示与自动选择共用，保证「列表顺序」与「默认选中」一致。
 */
export function sortVoicesByNaturalness(
  voices: ReadonlyArray<SpeechSynthesisVoice>,
): SpeechSynthesisVoice[] {
  return [...voices].sort(
    (a, b) => naturalnessScore(b) - naturalnessScore(a) || (a.name ?? '').localeCompare(b.name ?? ''),
  )
}

/** 是否存在神经网络自然语音；没有时 UI 会提示作者如何获得更自然的人声 */
export function hasNaturalVoice(voices: ReadonlyArray<SpeechSynthesisVoice>): boolean {
  return voices.some(voice => naturalnessScore(voice) >= 2)
}

/**
 * 语音按自然度分组：自然语音（Natural/Neural）单列一组置顶展示，
 * 其余（在线旧引擎、系统老引擎）归「其他」组；组内保持入参顺序。
 * 供语音下拉的 optgroup 使用，与排序共用同一判定，保证「组位置」与「默认选中」一致。
 */
export function groupVoicesByNaturalness(
  voices: ReadonlyArray<SpeechSynthesisVoice>,
): { natural: SpeechSynthesisVoice[]; classic: SpeechSynthesisVoice[] } {
  const natural: SpeechSynthesisVoice[] = []
  const classic: SpeechSynthesisVoice[] = []
  for (const voice of voices) {
    ;(getVoiceNaturalness(voice) === 'natural' ? natural : classic).push(voice)
  }
  return { natural, classic }
}

/** 试听样例句：短句含逗号停顿与叙事语调，能听出语音的语气起伏 */
export const VOICE_PREVIEW_TEXT = '他翻开书页，月色正好落在字里行间。'

/**
 * 用指定语音试听一句样例文本（应在朗读暂停或未开始时调用）。
 * 先 cancel 清空队列再播放，避免与在途朗读叠加；返回取消函数供再次试听/卸载前调用。
 */
export function speakVoicePreview(engine: SpeechEngine, voiceURI: string): () => void {
  engine.cancel()
  const utterance = engine.createUtterance(VOICE_PREVIEW_TEXT)
  utterance.rate = 1
  utterance.lang = 'zh-CN'
  const voice = pickVoice(engine.getVoices(), voiceURI || undefined)
  if (voice) {
    utterance.voice = voice
    utterance.lang = voice.lang
  }
  engine.speak(utterance)
  return () => engine.cancel()
}

/**
 * 选择朗读语音：优先作者指定；自动选择时先取普通话（zh-CN，其次任意中文），
 * 同语言内再按自然度排序（Neural/Natural > Online > 普通老引擎）。
 */
export function pickVoice(
  voices: ReadonlyArray<SpeechSynthesisVoice>,
  preferredURI?: string,
): SpeechSynthesisVoice | null {
  if (preferredURI) {
    const preferred = voices.find(voice => voice.voiceURI === preferredURI)
    if (preferred) return preferred
  }
  const mandarin = voices.filter(voice => voice.lang?.toLowerCase() === 'zh-cn')
  const pool = mandarin.length > 0
    ? mandarin
    : voices.filter(voice => voice.lang?.toLowerCase().startsWith('zh'))
  if (pool.length === 0) return null
  return sortVoicesByNaturalness(pool)[0] ?? null
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.speechSynthesis.speak === 'function'
}

/** 生产环境语音引擎：封装浏览器 speechSynthesis 与语音列表异步加载 */
export function createBrowserSpeechEngine(): SpeechEngine | null {
  if (!isSpeechSynthesisSupported() || typeof SpeechSynthesisUtterance === 'undefined') return null
  const synth = window.speechSynthesis
  return {
    getVoices: () => synth.getVoices(),
    createUtterance: text => new SpeechSynthesisUtterance(text),
    speak: utterance => synth.speak(utterance),
    cancel: () => synth.cancel(),
    onVoicesChanged(cb) {
      synth.addEventListener?.('voiceschanged', cb)
      return () => synth.removeEventListener?.('voiceschanged', cb)
    },
  }
}

export class SpeechReaderController {
  private readonly engine: SpeechEngine
  private readonly listeners = new Set<Listener>()
  private items: ReaderItem[] = []
  private index = 0
  private active = false
  private playing = false
  private rate: number
  private voiceURI: string
  private readerError: 'unavailable' | null = null
  /** 代际令牌：每次（重新）开始朗读一个条目时 +1，旧 utterance 回调据此失效 */
  private generation = 0
  private disposeVoices?: () => void
  private voices: SpeechSynthesisVoice[] = []
  /** voiceschanged 不可靠（部分浏览器只在早期触发一次）时的兜底重试探针 */
  private voiceRetryTimers: ReturnType<typeof setTimeout>[] = []

  constructor(engine: SpeechEngine, rate = 1, voiceURI = '') {
    this.engine = engine
    this.rate = rate
    this.voiceURI = voiceURI
    this.voices = engine.getVoices()
    this.disposeVoices = engine.onVoicesChanged(() => {
      this.voices = engine.getVoices()
      this.emit()
    })
    // Chromium 系常见竞态：getVoices() 初始返回空且 voiceschanged 已错过，
    // 在短时间内兜底重探，拿到语音后立刻停止并通知 UI
    if (this.voices.length === 0 && typeof setTimeout === 'function') {
      for (const delay of [200, 800, 2000]) {
        const timer = setTimeout(() => {
          const latest = this.engine.getVoices()
          if (latest.length > 0) {
            this.voices = latest
            this.voiceRetryTimers.forEach(t => clearTimeout(t))
            this.voiceRetryTimers = []
            this.emit()
          }
        }, delay)
        this.voiceRetryTimers.push(timer)
      }
    }
  }

  getSnapshot(): ReaderSnapshot {
    const blockTotal = new Set(this.items.map(item => item.blockPos)).size
    return {
      active: this.active,
      playing: this.playing,
      index: this.index,
      total: this.items.length,
      blockIndex: this.items[this.index]?.blockIndex ?? (this.active ? Math.max(0, blockTotal - 1) : 0),
      blockTotal,
      rate: this.rate,
      voiceURI: this.voiceURI,
      readerError: this.readerError,
    }
  }

  getVoices(): SpeechSynthesisVoice[] {
    return this.voices
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit() {
    const snapshot = this.getSnapshot()
    this.listeners.forEach(listener => listener(snapshot))
  }

  /** 开始一次朗读会话；fromBlockPos 可指定从某段落开始（重新开始时传 0 或省略） */
  start(items: ReadonlyArray<ReaderItem>, options: { rate?: number; voiceURI?: string; fromIndex?: number } = {}) {
    this.readerError = null
    if (options.rate != null) this.rate = options.rate
    if (options.voiceURI !== undefined) this.voiceURI = options.voiceURI
    // 开始朗读前再同步一次语音列表（兜底：页面长时间停留后语音才可用）
    const latestVoices = this.engine.getVoices()
    if (latestVoices.length !== this.voices.length) {
      this.voices = latestVoices
      this.voiceRetryTimers.forEach(t => clearTimeout(t))
      this.voiceRetryTimers = []
    }
    this.items = [...items]
    this.index = Math.max(0, Math.min(options.fromIndex ?? 0, Math.max(0, this.items.length - 1)))
    this.active = true
    if (this.items.length === 0) {
      this.playing = false
      this.emit()
      return
    }
    this.speakCurrent()
    this.emit()
  }

  /** 播放/暂停切换；暂停采用 cancel + 保留段落位置（移动端 pause() 不可靠） */
  togglePause() {
    if (!this.active) return
    if (this.playing) {
      this.generation += 1
      this.playing = false
      this.engine.cancel()
      this.emit()
    } else {
      this.speakCurrent()
      this.emit()
    }
  }

  stop() {
    this.generation += 1
    this.active = false
    this.playing = false
    this.items = []
    this.index = 0
    this.readerError = null
    this.engine.cancel()
    this.emit()
  }

  prev() {
    if (!this.active) return
    this.jumpTo(this.index - 1)
  }

  next() {
    if (!this.active) return
    this.jumpTo(this.index + 1)
  }

  /** 跳到指定正文段落（块）的第一条朗读条目；供「点击段落从此处朗读」扩展 */
  jumpToBlock(blockIndex: number) {
    if (!this.active) return
    const target = this.items.findIndex(item => item.blockIndex === blockIndex)
    if (target >= 0) this.jumpTo(target)
  }

  setRate(rate: number) {
    this.rate = rate
    if (this.active) {
      // 让新语速立即生效：重说当前条目
      this.speakCurrent()
    }
    this.emit()
  }

  setVoice(voiceURI: string) {
    this.voiceURI = voiceURI
    if (this.active) this.speakCurrent()
    this.emit()
  }

  dispose() {
    this.generation += 1
    this.active = false
    this.playing = false
    this.engine.cancel()
    this.disposeVoices?.()
    this.voiceRetryTimers.forEach(t => clearTimeout(t))
    this.voiceRetryTimers = []
    this.listeners.clear()
  }

  private jumpTo(next: number) {
    if (next < 0 || next >= this.items.length) {
      // 越过结尾：结束会话；回绕到开头由 UI 调用 prev/start 控制
      if (next >= this.items.length) {
        this.generation += 1
        this.active = false
        this.playing = false
        this.engine.cancel()
        this.emit()
      }
      return
    }
    this.index = next
    this.speakCurrent()
    this.emit()
  }

  private speakCurrent() {
    const item = this.items[this.index]
    if (!item) {
      this.active = false
      this.playing = false
      return
    }
    // 打断可能在途的旧条目；旧回调通过代际令牌失效
    this.generation += 1
    const myGeneration = this.generation
    this.engine.cancel()

    const utterance = this.engine.createUtterance(item.text)
    utterance.rate = this.rate
    utterance.lang = utterance.lang || 'zh-CN'
    const voice = pickVoice(this.voices, this.voiceURI || undefined)
    if (voice) {
      utterance.voice = voice
      utterance.lang = voice.lang
    }

    utterance.onend = () => {
      if (myGeneration !== this.generation) return
      this.advance()
    }
    utterance.onerror = event => {
      if (myGeneration !== this.generation) return
      // cancel/interrupted 是主动切换造成的，不能当作播放结束推进
      // 注：部分错误名（not-allowed 等）在不同浏览器/DOM 类型版本中存在差异，按 string 比较
      const error = String((event as SpeechSynthesisErrorEvent).error ?? '')
      if (error === 'canceled' || error === 'interrupted') return
      // 环境级失败（无语音/被策略拒绝/合成器不可用）：逐条重试只会瞬跑整条队列，
      // 直接中止会话并交由 UI 提示作者
      if (
        error === 'not-allowed'
        || error === 'service-not-allowed'
        || error === 'language-unavailable'
        || error === 'synthesis-unavailable'
        || error === 'synthesis-failed'
      ) {
        this.failReader()
        return
      }
      // 其余偶发错误（如 audio-busy）跳过当前条目，避免整条链路卡死
      this.advance()
    }

    this.playing = true
    this.engine.speak(utterance)
  }

  private advance() {
    if (!this.active) return
    const next = this.index + 1
    if (next >= this.items.length) {
      this.active = false
      this.playing = false
      this.generation += 1
      this.emit()
      return
    }
    this.index = next
    this.speakCurrent()
    this.emit()
  }

  /** 环境级失败中止：复位会话但保留 readerError，由 UI 提示后再 stop() 清除 */
  private failReader() {
    this.generation += 1
    this.active = false
    this.playing = false
    this.items = []
    this.index = 0
    this.readerError = 'unavailable'
    this.engine.cancel()
    this.emit()
  }
}
