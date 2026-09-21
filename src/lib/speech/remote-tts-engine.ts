/**
 * 远程 TTS 引擎 · Cloudflare Worker 部署的 Edge TTS 代理。
 *
 * 适用场景：APK/HAP 打包后 WebView 无 speechSynthesis，或浏览器缺少 Neural 人声时，
 * 通过用户自部署的 Cloudflare Worker（edgetts-cloudflare-workers-webui）获取
 * Edge Neural 人声音频。
 *
 * 实现 SpeechEngine 接口：getVoices 返回静态 Edge Neural 中文人声清单，
 * speak 用 fetch POST /v1/audio/speech 取回 mp3 → HTML5 Audio 播放，
 * cancel 用序列号令牌让在途 fetch 失效并停止音频。
 */

import type { SpeechEngine } from './speech-reader'
import { EDGE_TTS_VOICES } from './edge-voices'

/** 默认语音：晓晓 Neural（女声，温暖叙事，适合小说朗读） */
const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural'

/**
 * 远程 TTS 语音合成 utterance。
 *
 * 结构兼容 SpeechSynthesisUtterance（extends EventTarget + 同名属性），
 * 使 SpeechReaderController 能用同一套 onend/onerror 回调推进队列。
 * 不调用 new SpeechSynthesisUtterance（WebView 可能不存在该类）。
 */
class RemoteTtsUtterance extends EventTarget {
  readonly text: string
  lang = ''
  pitch = 1
  rate = 1
  volume = 1
  voice: SpeechSynthesisVoice | null = null
  onstart: ((ev: SpeechSynthesisEvent) => void) | null = null
  onend: ((ev: SpeechSynthesisEvent) => void) | null = null
  onerror: ((ev: SpeechSynthesisErrorEvent) => void) | null = null
  onpause: ((ev: SpeechSynthesisEvent) => void) | null = null
  onresume: ((ev: SpeechSynthesisEvent) => void) | null = null
  onmark: ((ev: SpeechSynthesisEvent) => void) | null = null
  onboundary: ((ev: SpeechSynthesisEvent) => void) | null = null

  constructor(text: string) {
    super()
    this.text = text
  }
}

/** 最小化的 SpeechSynthesisErrorEvent 兼容对象（仅需 error 字符串属性） */
function makeErrorEvent(error: string): SpeechSynthesisErrorEvent {
  return { error } as unknown as SpeechSynthesisErrorEvent
}

/** 最小化的 SpeechSynthesisEvent 兼容对象（控制器不读其属性） */
const EMPTY_EVENT = {} as SpeechSynthesisEvent

/**
 * 创建远程 TTS 引擎。
 *
 * @param baseUrl Cloudflare Worker 地址（如 https://xxx.workers.dev）
 * @param apiKey  用户设置的 API Key（Bearer 认证）
 * @returns SpeechEngine 实现；getVoices 立即返回静态清单，speak 异步取音频
 */
export function createRemoteTtsEngine(baseUrl: string, apiKey: string): SpeechEngine {
  const root = baseUrl.replace(/\/+$/, '')
  let currentSeq = 0
  let currentAudio: HTMLAudioElement | null = null
  /** 在途 utterance 的 onend/onerror 回调引用（cancel 时清空，阻止旧回调推进） */
  let activeUtterance: RemoteTtsUtterance | null = null

  return {
    getVoices: () => EDGE_TTS_VOICES,

    createUtterance: (text: string) =>
      new RemoteTtsUtterance(text) as unknown as SpeechSynthesisUtterance,

    speak: (utterance: SpeechSynthesisUtterance) => {
      const remote = utterance as unknown as RemoteTtsUtterance
      const mySeq = ++currentSeq
      activeUtterance = remote

      const voiceURI = remote.voice?.voiceURI || DEFAULT_VOICE
      const speed = remote.rate > 0 ? remote.rate : 1

      remote.onstart?.(EMPTY_EVENT)

      fetch(`${root}/v1/audio/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input: remote.text,
          voice: voiceURI,
          speed,
          response_format: 'mp3',
        }),
      })
        .then(response => {
          if (!response.ok) {
            // 401/403 = 认证失败（每次都会失败）→ not-allowed 让控制器 failReader
            if (response.status === 401 || response.status === 403) {
              if (mySeq === currentSeq && activeUtterance === remote) {
                remote.onerror?.(makeErrorEvent('not-allowed'))
              }
              return null
            }
            // 5xx 等 = 服务端临时错误 → synthesis-failed 跳过当前条目
            if (mySeq === currentSeq && activeUtterance === remote) {
              remote.onerror?.(makeErrorEvent('synthesis-failed'))
            }
            return null
          }
          return response.blob()
        })
        .then(blob => {
          if (!blob) return // 上述错误分支已处理回调
          // 被后续 speak/cancel 取代：丢弃过期音频
          if (mySeq !== currentSeq || activeUtterance !== remote) return

          const url = URL.createObjectURL(blob)
          const audio = new Audio(url)
          currentAudio = audio

          audio.onended = () => {
            URL.revokeObjectURL(url)
            currentAudio = null
            if (mySeq === currentSeq && activeUtterance === remote) {
              activeUtterance = null
              remote.onend?.(EMPTY_EVENT)
            }
          }
          audio.onerror = () => {
            URL.revokeObjectURL(url)
            currentAudio = null
            if (mySeq === currentSeq && activeUtterance === remote) {
              activeUtterance = null
              remote.onerror?.(makeErrorEvent('audio-busy'))
            }
          }

          audio.play().catch(() => {
            URL.revokeObjectURL(url)
            currentAudio = null
            if (mySeq === currentSeq && activeUtterance === remote) {
              activeUtterance = null
              remote.onerror?.(makeErrorEvent('audio-busy'))
            }
          })
        })
        .catch(() => {
          // 网络错误（DNS/超时/断网）= 服务不可达 → synthesis-unavailable 让控制器 failReader
          if (mySeq === currentSeq && activeUtterance === remote) {
            activeUtterance = null
            remote.onerror?.(makeErrorEvent('synthesis-unavailable'))
          }
        })
    },

    cancel: () => {
      currentSeq++ // 让所有在途 fetch 回调失效
      activeUtterance = null
      if (currentAudio) {
        currentAudio.onended = null
        currentAudio.onerror = null
        currentAudio.pause()
        currentAudio.src = ''
        currentAudio = null
      }
    },

    onVoicesChanged: () => () => {}, // 静态清单，无需异步加载
  }
}
