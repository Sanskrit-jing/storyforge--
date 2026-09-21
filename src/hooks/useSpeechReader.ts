import { useEffect, useMemo, useRef, useState } from 'react'
import {
  SpeechReaderController,
  createBrowserSpeechEngine,
  speakVoicePreview,
  type ReaderItem,
  type ReaderSnapshot,
  type SpeechEngine,
} from '../lib/speech/speech-reader'
import { createRemoteTtsEngine } from '../lib/speech/remote-tts-engine'
import { loadReaderSettings, saveReaderSettings } from '../lib/speech/reader-settings'

/** 当前生效的朗读引擎来源；null = 环境完全不支持（控制器未创建） */
export type SpeechEngineKind = 'remote' | 'browser'

const IDLE_SNAPSHOT: ReaderSnapshot = {
  active: false,
  playing: false,
  index: 0,
  total: 0,
  blockIndex: 0,
  blockTotal: 0,
  rate: 1,
  voiceURI: '',
  readerError: null,
}

/**
 * 章节正文语音朗读。
 *
 * 引擎选择策略（配置了远程 TTS 地址时优先走远程，获得 Edge Neural 人声；
 * 否则回落浏览器 Web Speech API——APK/HAP WebView 无 speechSynthesis 时朗读不可用）：
 * - 远程引擎：fetch → Cloudflare Worker → 微软 Edge 在线 TTS → mp3 → Audio 播放
 * - 浏览器引擎：window.speechSynthesis（Edge 桌面版自带 Neural 人声）
 *
 * - 控制器生命周期与组件一致：卸载/切章时必须调用 stop()
 * - 语速/语音/远程 TTS 偏好写 localStorage 全局持久化；改配置后需刷新生效
 */
export function useSpeechReader() {
  const controllerRef = useRef<SpeechReaderController | null>(null)
  const engineRef = useRef<SpeechEngine | null>(null)
  const engineKindRef = useRef<SpeechEngineKind | null>(null)
  if (controllerRef.current === null) {
    const settings = loadReaderSettings()
    // 引擎优先级：Worker（显式配置，任意环境可用）> 浏览器内置 Web Speech API
    // （曾提供「Edge 直连微软 TTS」零部署路径，实测微软门禁苛刻不可靠，已移除）
    let engine: SpeechEngine | null
    if (settings.ttsBaseUrl) {
      engine = createRemoteTtsEngine(settings.ttsBaseUrl, settings.ttsApiKey)
      engineKindRef.current = 'remote'
    } else {
      engine = createBrowserSpeechEngine()
      engineKindRef.current = 'browser'
    }
    if (engine) {
      engineRef.current = engine
      controllerRef.current = new SpeechReaderController(engine, settings.rate, settings.voiceURI)
    }
  }
  const controller = controllerRef.current

  // 控制器只创建一次；useSyncExternalStore 订阅其状态
  const [snapshot, setSnapshot] = useState<ReaderSnapshot>(() => controller?.getSnapshot() ?? IDLE_SNAPSHOT)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => controller?.getVoices() ?? [])

  useEffect(() => {
    if (!controller) return
    const unsubscribeSnapshot = controller.subscribe(setSnapshot)
    const unsubscribeVoices = controller.subscribe(() => setVoices(controller.getVoices()))
    setVoices(controller.getVoices())
    return () => {
      unsubscribeSnapshot()
      unsubscribeVoices()
    }
  }, [controller])

  // 卸载硬停止并释放语音列表监听
  useEffect(() => () => controller?.dispose(), [controller])

  return useMemo(() => ({
    supported: controller !== null,
    /** 当前引擎来源：Worker / 浏览器内置；用于失败提示按来源给指引 */
    engineKind: engineKindRef.current,
    snapshot,
    voices,
    start(items: ReadonlyArray<ReaderItem>, fromIndex = 0) {
      const settings = loadReaderSettings()
      controller?.start(items, { ...settings, fromIndex })
    },
    togglePause: () => controller?.togglePause(),
    stop: () => controller?.stop(),
    prev: () => controller?.prev(),
    next: () => controller?.next(),
    setRate(rate: number) {
      saveReaderSettings({ ...loadReaderSettings(), rate })
      controller?.setRate(rate)
    },
    setVoice(voiceURI: string) {
      saveReaderSettings({ ...loadReaderSettings(), voiceURI })
      controller?.setVoice(voiceURI)
    },
    /** 试听当前选中语音（固定 1 倍速样例句）；朗读进行中忽略，避免打断推进队列 */
    previewVoice(voiceURI: string) {
      const engine = engineRef.current
      if (!engine || controller?.getSnapshot().playing) return
      speakVoicePreview(engine, voiceURI)
    },
  }), [controller, snapshot, voices])
}

export type SpeechReaderApi = ReturnType<typeof useSpeechReader>
