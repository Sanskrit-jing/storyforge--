import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRemoteTtsEngine } from '../../src/lib/speech/remote-tts-engine'
import { EDGE_TTS_VOICES } from '../../src/lib/speech/edge-voices'
import {
  DEFAULT_READER_SETTINGS,
  loadReaderSettings,
  saveReaderSettings,
} from '../../src/lib/speech/reader-settings'

/** 等待引擎 fetch→blob→Audio 的微任务链走完 */
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

/** 引擎里 remote.voice 只被读取 voiceURI，测试用最小结构模拟 */
const asVoice = (voiceURI: string) => ({ voiceURI }) as unknown as SpeechSynthesisVoice

type ErrSink = (event: { error: string }) => void
/** 收集引擎 onerror 的 error 名称，供断言错误分类 */
function collectErrors(utterance: SpeechSynthesisUtterance): string[] {
  const errors: string[] = []
  utterance.onerror = ((event: { error: string }) => { errors.push(event.error) }) as unknown as ErrSink
  return errors
}

/** 成功响应（mp3 blob）与失败响应的最小模拟 */
const okRes = () => ({ ok: true, status: 200, blob: async () => new Blob(['audio']) })
const errRes = (status: number) => ({ ok: false, status, blob: async () => new Blob([]) })

/** HTMLAudioElement 最小模拟：记录 play/pause 调用与实例，供断言 */
class FakeAudio {
  static instances: FakeAudio[] = []
  src = ''
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  playCount = 0
  pauseCount = 0
  constructor(public url: string) {
    FakeAudio.instances.push(this)
    this.src = url // 与浏览器一致：new Audio(url) 自动设置 src
  }
  play() { this.playCount++; return Promise.resolve() }
  pause() { this.pauseCount++ }
}

describe('R-远程TTS：Edge 人声清单', () => {
  it('全部为中文 Neural 语音且 voiceURI 唯一', () => {
    expect(EDGE_TTS_VOICES.length).toBeGreaterThan(0)
    for (const voice of EDGE_TTS_VOICES) {
      expect(voice.lang.startsWith('zh')).toBe(true)
      expect(voice.name).toContain('Neural')
    }
    const uris = EDGE_TTS_VOICES.map(voice => voice.voiceURI)
    expect(new Set(uris).size).toBe(uris.length)
  })

  it('包含默认人声晓晓（zh-CN-XiaoxiaoNeural）', () => {
    expect(EDGE_TTS_VOICES.some(voice => voice.voiceURI === 'zh-CN-XiaoxiaoNeural')).toBe(true)
  })
})

describe('R-远程TTS：引擎基础', () => {
  it('getVoices 返回 Edge 清单；createUtterance 携带文本且不依赖浏览器 utterance 类', () => {
    const engine = createRemoteTtsEngine('https://tts.example/', 'key-1')
    expect(engine.getVoices()).toEqual(EDGE_TTS_VOICES)
    const utterance = engine.createUtterance('你好，世界')
    expect(utterance.text).toBe('你好，世界')
    expect(utterance.voice).toBeNull()
  })

  it('未 speak 前直接 cancel 不抛错', () => {
    const engine = createRemoteTtsEngine('https://tts.example/', 'key-1')
    expect(() => engine.cancel()).not.toThrow()
  })
})

describe('R-远程TTS：请求与错误路径', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('speak 发送 OpenAI 兼容请求体与 Bearer 头，成功后用 Audio 播放 blob', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okRes())
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('Audio', FakeAudio)
    FakeAudio.instances = []
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:mock', revokeObjectURL: vi.fn() })

    const engine = createRemoteTtsEngine('https://tts.example/', 'key-1')
    const utterance = engine.createUtterance('他翻开书页')
    utterance.rate = 1.2
    utterance.voice = asVoice('zh-CN-YunxiNeural')

    engine.speak(utterance)
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://tts.example/v1/audio/speech')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer key-1')
    expect(JSON.parse(String(init.body))).toEqual({
      input: '他翻开书页',
      voice: 'zh-CN-YunxiNeural',
      speed: 1.2,
      response_format: 'mp3',
    })
    // 音频已创建并播放
    expect(FakeAudio.instances).toHaveLength(1)
    expect(FakeAudio.instances[0].playCount).toBe(1)
    expect(FakeAudio.instances[0].src).toBe('blob:mock')
  })

  it('网络不可达 → synthesis-unavailable（环境级失败，中止会话）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const engine = createRemoteTtsEngine('https://tts.example/', 'key-1')
    const utterance = engine.createUtterance('你好')
    const errors = collectErrors(utterance)

    engine.speak(utterance)
    await flush()

    expect(errors).toEqual(['synthesis-unavailable'])
  })

  it('HTTP 401 → not-allowed（Key 失效，中止会话）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errRes(401)))
    const engine = createRemoteTtsEngine('https://tts.example/', 'key-1')
    const utterance = engine.createUtterance('你好')
    const errors = collectErrors(utterance)

    engine.speak(utterance)
    await flush()

    expect(errors).toEqual(['not-allowed'])
  })

  it('HTTP 500 → synthesis-failed（服务端错误，中止会话）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errRes(500)))
    const engine = createRemoteTtsEngine('https://tts.example/', 'key-1')
    const utterance = engine.createUtterance('你好')
    const errors = collectErrors(utterance)

    engine.speak(utterance)
    await flush()

    expect(errors).toEqual(['synthesis-failed'])
  })

  it('被后续 speak 取代的在途请求失效：旧音频不播放、旧回调不触发', async () => {
    let resolveFirst: (value: unknown) => void = () => {}
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve }))
      .mockImplementationOnce(() => Promise.resolve(okRes()))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('Audio', FakeAudio)
    FakeAudio.instances = []
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:mock', revokeObjectURL: vi.fn() })

    const engine = createRemoteTtsEngine('https://tts.example/', 'key-1')
    const first = engine.createUtterance('第一段')
    const second = engine.createUtterance('第二段')
    const firstErrors = collectErrors(first)

    engine.speak(first)
    engine.speak(second) // 打断第一段：其 fetch 尚未返回
    await flush()
    resolveFirst(okRes()) // 迟到的第一段响应
    await flush()

    expect(firstErrors).toEqual([]) // 旧条目不触发错误回调（代际令牌失效）
    expect(FakeAudio.instances).toHaveLength(1) // 只有第二段创建了音频
    expect(FakeAudio.instances[0].url).toBe('blob:mock')
  })

  it('cancel 停止当前音频并让在途回调失效', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okRes()))
    vi.stubGlobal('Audio', FakeAudio)
    FakeAudio.instances = []
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:mock', revokeObjectURL: vi.fn() })

    const engine = createRemoteTtsEngine('https://tts.example/', 'key-1')
    const utterance = engine.createUtterance('你好')
    const errors = collectErrors(utterance)

    engine.speak(utterance)
    await flush()
    engine.cancel()

    expect(FakeAudio.instances[0].pauseCount).toBe(1)
    expect(errors).toEqual([]) // cancel 不产生错误回调
  })
})

describe('R-远程TTS：TTS 服务配置持久化', () => {
  afterEach(() => localStorage.clear())

  it('保存后可原样读回（含 ttsBaseUrl / ttsApiKey）', () => {
    saveReaderSettings({
      rate: 1.2,
      voiceURI: 'zh-CN-XiaoxiaoNeural',
      ttsBaseUrl: 'https://my-tts.workers.dev',
      ttsApiKey: 'secret-key',
    })
    expect(loadReaderSettings()).toEqual({
      rate: 1.2,
      voiceURI: 'zh-CN-XiaoxiaoNeural',
      ttsBaseUrl: 'https://my-tts.workers.dev',
      ttsApiKey: 'secret-key',
    })
  })

  it('存储损坏时回落默认值（远程 TTS 未配置）', () => {
    localStorage.setItem('storyforge-speech-reader', '{bad json')
    expect(loadReaderSettings()).toEqual(DEFAULT_READER_SETTINGS)
    expect(loadReaderSettings().ttsBaseUrl).toBe('')
  })

  it('旧版本存储缺 TTS 字段时补默认空串，不抛错', () => {
    localStorage.setItem('storyforge-speech-reader', JSON.stringify({ rate: 0.9, voiceURI: 'x' }))
    const settings = loadReaderSettings()
    expect(settings.rate).toBe(0.9)
    expect(settings.ttsBaseUrl).toBe('')
    expect(settings.ttsApiKey).toBe('')
  })

  it('历史存储中的已废弃 preferEdgeDirect 字段被忽略', () => {
    localStorage.setItem(
      'storyforge-speech-reader',
      JSON.stringify({ rate: 1, voiceURI: '', ttsBaseUrl: '', ttsApiKey: '', preferEdgeDirect: false }),
    )
    const settings = loadReaderSettings()
    expect(settings.rate).toBe(1)
    expect('preferEdgeDirect' in settings).toBe(false)
  })
})
