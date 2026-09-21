import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SpeechReaderController,
  buildReaderItems,
  chunkForSpeech,
  getVoiceNaturalness,
  groupVoicesByNaturalness,
  hasNaturalVoice,
  isSpeechSynthesisSupported,
  pickVoice,
  sortVoicesByNaturalness,
  speakVoicePreview,
  VOICE_PREVIEW_TEXT,
  type SpeechEngine,
} from '../../src/lib/speech/speech-reader'
import { DEFAULT_READER_SETTINGS, loadReaderSettings, saveReaderSettings } from '../../src/lib/speech/reader-settings'

/** 可控的假 utterance：测试中手动触发 onend/onerror 驱动状态机 */
interface FakeUtterance {
  text: string
  rate: number
  lang: string
  voice: { voiceURI: string; lang: string } | null
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
}

interface MockEngine extends SpeechEngine {
  spoken: FakeUtterance[]
  cancelCount: number
  current: FakeUtterance | null
  voices: Array<{ voiceURI: string; name: string; lang: string }>
}

function createMockEngine(voices: MockEngine['voices'] = []): MockEngine {
  const engine: MockEngine = {
    spoken: [],
    cancelCount: 0,
    current: null,
    voices,
    getVoices: () => engine.voices as unknown as SpeechSynthesisVoice[],
    createUtterance(text) {
      const u: FakeUtterance = { text, rate: 1, lang: '', voice: null, onend: null, onerror: null }
      return u as unknown as SpeechSynthesisUtterance
    },
    speak(utterance) {
      const u = utterance as unknown as FakeUtterance
      engine.current = u
      engine.spoken.push(u)
    },
    cancel() {
      engine.cancelCount += 1
      engine.current = null
    },
    onVoicesChanged() {
      return () => {}
    },
  }
  return engine
}

function endCurrent(engine: MockEngine) {
  const u = engine.current
  engine.current = null
  u?.onend?.()
}

describe('语音朗读 · 文本切分', () => {
  it('短文本原样返回，空白文本返回空数组', () => {
    expect(chunkForSpeech('短文本')).toEqual(['短文本'])
    expect(chunkForSpeech('   ')).toEqual([])
    expect(chunkForSpeech('')).toEqual([])
  })

  it('超过阈值按句末标点切分并尽量合并短句', () => {
    const text = '第一句话很短。'.repeat(20) // 240 字
    const chunks = chunkForSpeech(text, 30)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(chunk => chunk.length <= 30)).toBe(true)
    expect(chunks.join('')).toBe(text.replace(/\s+/g, ' '))
  })

  it('无句读的超长文本硬切不丢字', () => {
    const text = '啊'.repeat(350)
    const chunks = chunkForSpeech(text, 100)
    expect(chunks).toHaveLength(4)
    expect(chunks.join('')).toBe(text)
  })

  it('空白符（含换行）被归一为单空格', () => {
    expect(chunkForSpeech('第一行\n  第二行\t第三行')).toEqual(['第一行 第二行 第三行'])
  })
})

describe('语音朗读 · 朗读条目构建', () => {
  it('跳过空段落，超长段落切出的句子共享 blockPos 与 blockIndex', () => {
    const items = buildReaderItems([
      { pos: 0, text: '开篇段落。'.repeat(40) }, // 200 字，超过 160 阈值会切成多条
      { pos: 40, text: '   ' },
      { pos: 60, text: '第二段。' },
    ])
    expect(items.length).toBeGreaterThan(2)
    expect(items[0].blockIndex).toBe(0)
    expect(items[0].blockPos).toBe(0)
    // 同一长段切出的所有句子 blockIndex 都是 0
    const firstBlockItems = items.filter(item => item.blockIndex === 0)
    expect(firstBlockItems.length).toBeGreaterThan(1)
    expect(firstBlockItems.every(item => item.blockPos === 0)).toBe(true)
    // 空段被跳过，第二段 blockIndex 为 1
    const second = items.find(item => item.text === '第二段。')
    expect(second?.blockIndex).toBe(1)
    expect(second?.blockPos).toBe(60)
  })
})

describe('语音朗读 · 语音选择', () => {
  const voices = [
    { voiceURI: 'en-us', name: 'English', lang: 'en-US' },
    { voiceURI: 'yue', name: 'Cantonese', lang: 'zh-HK' },
    { voiceURI: 'cn', name: 'Xiaoxiao', lang: 'zh-CN' },
    { voiceURI: 'tw', name: 'Tingting', lang: 'zh-TW' },
  ] as unknown as SpeechSynthesisVoice[]

  it('优先作者指定的 voiceURI', () => {
    expect(pickVoice(voices, 'tw')?.voiceURI).toBe('tw')
  })

  it('未指定时优先普通话 zh-CN，再次任意中文，最后回落 null', () => {
    expect(pickVoice(voices)?.voiceURI).toBe('cn')
    const noMandarin = voices.filter(v => v.lang !== 'zh-CN')
    expect(pickVoice(noMandarin)?.voiceURI).toBe('yue')
    expect(pickVoice(voices.filter(v => !v.lang.startsWith('zh')))).toBeNull()
  })

  it('指定 URI 不存在时回落到自动选择', () => {
    expect(pickVoice(voices, 'missing')?.voiceURI).toBe('cn')
  })

  const naturalFirst = [
    { voiceURI: 'huihui', name: 'Microsoft Huihui - Chinese (Simplified)', lang: 'zh-CN' },
    { voiceURI: 'yaoyao', name: 'Microsoft Yaoyao Online (Desktop)', lang: 'zh-CN' },
    { voiceURI: 'xiaoxiao', name: 'Microsoft Xiaoxiao Online (Natural) - Chinese (Simplified)', lang: 'zh-CN' },
    { voiceURI: 'yunxi', name: 'Microsoft Yunxi Neural - Chinese (Simplified)', lang: 'zh-CN' },
  ] as unknown as SpeechSynthesisVoice[]

  it('同语言内优先神经网络自然语音（Natural/Neural），其次 Online，最后老引擎', () => {
    expect(pickVoice(naturalFirst)?.voiceURI).toBe('xiaoxiao')
    const noNeural = [naturalFirst[0]!, naturalFirst[1]!]
    expect(pickVoice(noNeural)?.voiceURI).toBe('yaoyao') // Online 优先于老引擎 Huihui
    expect(pickVoice([naturalFirst[0]!])?.voiceURI).toBe('huihui') // 仅老引擎时照常返回
  })

  it('语言优先于自然度：普通话老引擎仍先于方言自然语音', () => {
    const mixed = [
      { voiceURI: 'yue-nat', name: 'Cantonese Online (Natural)', lang: 'zh-HK' },
      { voiceURI: 'huihui', name: 'Microsoft Huihui', lang: 'zh-CN' },
    ] as unknown as SpeechSynthesisVoice[]
    expect(pickVoice(mixed)?.voiceURI).toBe('huihui')
  })

  it('sortVoicesByNaturalness 返回新数组且稳定排序；hasNaturalVoice 只认 Neural/Natural', () => {
    const sorted = sortVoicesByNaturalness(naturalFirst)
    expect(sorted.map(v => v.voiceURI)).toEqual(['xiaoxiao', 'yunxi', 'yaoyao', 'huihui'])
    expect(naturalFirst[0].voiceURI).toBe('huihui') // 不改动入参
    expect(hasNaturalVoice(naturalFirst)).toBe(true)
    expect(hasNaturalVoice(voices)).toBe(false)
    expect(hasNaturalVoice([naturalFirst[0]!])).toBe(false)
  })
})

describe('语音朗读 · 语音分组与试听', () => {
  const mixed = [
    { voiceURI: 'huihui', name: 'Microsoft Huihui - Chinese (Simplified)', lang: 'zh-CN' },
    { voiceURI: 'xiaoxiao', name: 'Microsoft Xiaoxiao Online (Natural) - Chinese (Simplified)', lang: 'zh-CN' },
    { voiceURI: 'yaoyao', name: 'Microsoft Yaoyao Online (Desktop)', lang: 'zh-CN' },
    { voiceURI: 'yunxi', name: 'Microsoft Yunxi Neural - Chinese (Simplified)', lang: 'zh-CN' },
  ] as unknown as SpeechSynthesisVoice[]

  it('getVoiceNaturalness 按名称分级：Natural/Neural > Online > classic', () => {
    expect(getVoiceNaturalness(mixed[0]!)).toBe('classic')
    expect(getVoiceNaturalness(mixed[1]!)).toBe('natural')
    expect(getVoiceNaturalness(mixed[2]!)).toBe('online')
    expect(getVoiceNaturalness(mixed[3]!)).toBe('natural')
  })

  it('groupVoicesByNaturalness：自然语音单列一组置顶，组内保持入参顺序，不改入参', () => {
    const grouped = groupVoicesByNaturalness(mixed)
    expect(grouped.natural.map(v => v.voiceURI)).toEqual(['xiaoxiao', 'yunxi'])
    expect(grouped.classic.map(v => v.voiceURI)).toEqual(['huihui', 'yaoyao'])
    expect(mixed[0].voiceURI).toBe('huihui') // 入参顺序不变
    // 全部为自然语音时 classic 组为空，反之亦然
    expect(groupVoicesByNaturalness([mixed[1]!]).classic).toHaveLength(0)
    expect(groupVoicesByNaturalness([mixed[0]!]).natural).toHaveLength(0)
    expect(groupVoicesByNaturalness([])).toEqual({ natural: [], classic: [] })
  })

  it('speakVoicePreview：先 cancel 清队列，用指定语音以固定 1 倍速说样例句', () => {
    const engine = createMockEngine([
      { voiceURI: 'cn', name: '晓晓', lang: 'zh-CN' },
      { voiceURI: 'en', name: 'English', lang: 'en-US' },
    ])
    const cancel = speakVoicePreview(engine, 'cn')
    expect(engine.cancelCount).toBe(1) // 播放前先清队列
    expect(engine.spoken).toHaveLength(1)
    const preview = engine.spoken[0]!
    expect(preview.text).toBe(VOICE_PREVIEW_TEXT)
    expect(preview.rate).toBe(1)
    expect(preview.voice?.voiceURI).toBe('cn')
    expect(preview.lang).toBe('zh-CN')
    // 返回的取消函数可停掉样例句（再次试听/卸载前调用）
    cancel()
    expect(engine.cancelCount).toBe(2)
    expect(engine.current).toBeNull()
  })

  it('speakVoicePreview：voiceURI 为空时自动选择中文语音；无中文语音时不指定 voice', () => {
    const zhEngine = createMockEngine([
      { voiceURI: 'en', name: 'English', lang: 'en-US' },
      { voiceURI: 'cn', name: '云希 Neural', lang: 'zh-CN' },
    ])
    speakVoicePreview(zhEngine, '')
    expect(zhEngine.spoken[0]?.voice?.voiceURI).toBe('cn')

    const enEngine = createMockEngine([{ voiceURI: 'en', name: 'English', lang: 'en-US' }])
    speakVoicePreview(enEngine, '')
    expect(enEngine.spoken[0]?.voice).toBeNull() // 无中文语音回落，仅保留 lang 兜底
    expect(enEngine.spoken[0]?.lang).toBe('zh-CN')
  })
})

describe('语音朗读 · 控制器状态机', () => {
  let engine: MockEngine

  beforeEach(() => {
    engine = createMockEngine()
  })

  it('start 后立即朗读第一段，快照为播放中', () => {
    const reader = new SpeechReaderController(engine)
    const items = buildReaderItems([{ pos: 0, text: '甲。' }, { pos: 10, text: '乙。' }])
    reader.start(items)
    expect(engine.current?.text).toBe('甲。')
    expect(reader.getSnapshot()).toMatchObject({ active: true, playing: true, index: 0, total: 2, blockIndex: 0, blockTotal: 2 })
  })

  it('下一段只由当前 utterance 的 onend 推进（单一推进源）', () => {
    const reader = new SpeechReaderController(engine)
    reader.start(buildReaderItems([{ pos: 0, text: '甲。' }, { pos: 10, text: '乙。' }, { pos: 20, text: '丙。' }]))
    endCurrent(engine)
    expect(engine.current?.text).toBe('乙。')
    expect(reader.getSnapshot().blockIndex).toBe(1)
    endCurrent(engine)
    expect(engine.current?.text).toBe('丙。')
    // 最后一段结束：会话关闭
    endCurrent(engine)
    expect(reader.getSnapshot()).toMatchObject({ active: false, playing: false })
    expect(engine.current).toBeNull()
  })

  it('主动 cancel 触发的 canceled/interrupted 错误不得推进队列', () => {
    const reader = new SpeechReaderController(engine)
    reader.start(buildReaderItems([{ pos: 0, text: '甲。' }, { pos: 10, text: '乙。' }]))
    const first = engine.spoken[0]!
    reader.next() // 内部先 cancel 再播放乙；旧 utterance 的错误回调可能异步到达
    first.onerror?.({ error: 'canceled' })
    first.onerror?.({ error: 'interrupted' })
    expect(reader.getSnapshot().index).toBe(1)
    expect(engine.current?.text).toBe('乙。')
  })

  it('非主动取消的播放错误跳过当前条目，避免链路卡死', () => {
    const reader = new SpeechReaderController(engine)
    reader.start(buildReaderItems([{ pos: 0, text: '甲。' }, { pos: 10, text: '乙。' }]))
    const first = engine.spoken[0]!
    first.onerror?.({ error: 'audio-busy' })
    expect(engine.current?.text).toBe('乙。')
  })

  it('环境级错误（无语音/被策略拒绝）中止会话并标记 readerError，不逐条空跑', () => {
    const reader = new SpeechReaderController(engine)
    reader.start(buildReaderItems([{ pos: 0, text: '甲。' }, { pos: 10, text: '乙。' }]))
    const first = engine.spoken[0]!
    first.onerror?.({ error: 'language-unavailable' })
    const snap = reader.getSnapshot()
    expect(snap.active).toBe(false)
    expect(snap.readerError).toBe('unavailable')
    // 第二条不得被尝试播放
    expect(engine.spoken).toHaveLength(1)
    // stop 复位错误标记，下次朗读可重新开始
    reader.stop()
    expect(reader.getSnapshot().readerError).toBeNull()
  })

  it('not-allowed 同样按环境级失败处理；start 可清除上一次错误标记', () => {
    const reader = new SpeechReaderController(engine)
    reader.start(buildReaderItems([{ pos: 0, text: '甲。' }]))
    engine.spoken[0]!.onerror?.({ error: 'not-allowed' })
    expect(reader.getSnapshot().readerError).toBe('unavailable')
    reader.start(buildReaderItems([{ pos: 0, text: '甲。' }]))
    expect(reader.getSnapshot().readerError).toBeNull()
    reader.stop()
  })

  it('暂停用 cancel 实现，继续时重说当前段落（段落粒度恢复）', () => {
    const reader = new SpeechReaderController(engine)
    reader.start(buildReaderItems([{ pos: 0, text: '甲。' }, { pos: 10, text: '乙。' }]))
    const first = engine.spoken[0]!
    reader.togglePause()
    expect(reader.getSnapshot()).toMatchObject({ playing: false, active: true, index: 0 })
    expect(engine.cancelCount).toBeGreaterThan(0)
    // 暂停期间旧条目延迟到达的结束/错误回调不得推进
    first.onend?.()
    first.onerror?.({ error: 'canceled' })
    expect(reader.getSnapshot().index).toBe(0)
    reader.togglePause()
    expect(engine.current?.text).toBe('甲。')
    expect(reader.getSnapshot().playing).toBe(true)
  })

  it('stop 硬停止并清空队列，再次 start 从新内容开头播放', () => {
    const reader = new SpeechReaderController(engine)
    reader.start(buildReaderItems([{ pos: 0, text: '甲。' }, { pos: 10, text: '乙。' }]))
    endCurrent(engine)
    reader.stop()
    expect(reader.getSnapshot()).toMatchObject({ active: false, playing: false, index: 0, total: 0 })
    reader.start(buildReaderItems([{ pos: 0, text: '新甲。' }]))
    expect(engine.current?.text).toBe('新甲。')
  })

  it('prev/next 段落跳转及边界处理', () => {
    const reader = new SpeechReaderController(engine)
    reader.start(buildReaderItems([{ pos: 0, text: '甲。' }, { pos: 10, text: '乙。' }, { pos: 20, text: '丙。' }]))
    reader.prev() // 已在开头：保持 0
    expect(reader.getSnapshot().index).toBe(0)
    expect(engine.current?.text).toBe('甲。')
    reader.next()
    expect(engine.current?.text).toBe('乙。')
    reader.prev()
    expect(engine.current?.text).toBe('甲。')
    // 连续 next 越过结尾 → 会话结束
    reader.next(); reader.next(); reader.next()
    expect(reader.getSnapshot().active).toBe(false)
  })

  it('setRate/setVoice 立即重说当前条目让偏好生效', () => {
    const engineWithVoices = createMockEngine([{ voiceURI: 'cn', name: '晓晓', lang: 'zh-CN' }])
    const reader = new SpeechReaderController(engineWithVoices)
    reader.start(buildReaderItems([{ pos: 0, text: '甲。' }]))
    reader.setRate(1.5)
    expect(engineWithVoices.current?.rate).toBe(1.5)
    reader.setVoice('cn')
    expect(engineWithVoices.current?.voice?.voiceURI).toBe('cn')
    expect(engineWithVoices.current?.lang).toBe('zh-CN')
  })

  it('空条目 start 不调用 speak，会话标记为暂停态空会话', () => {
    const reader = new SpeechReaderController(engine)
    reader.start([])
    expect(engine.spoken).toHaveLength(0)
    expect(reader.getSnapshot()).toMatchObject({ active: true, playing: false, total: 0 })
    reader.stop()
  })

  it('dispose 后订阅者不再收到通知', () => {
    const reader = new SpeechReaderController(engine)
    let calls = 0
    reader.subscribe(() => { calls += 1 })
    const unsubscribe = reader.subscribe(() => { calls += 1 })
    unsubscribe()
    reader.stop()
    expect(calls).toBe(1)
    reader.dispose()
  })
})

describe('语音朗读 · 偏好持久化', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('默认值、保存/读取往返与非法值回落', () => {
    expect(loadReaderSettings()).toEqual(DEFAULT_READER_SETTINGS)
    saveReaderSettings({ rate: 1.5, voiceURI: 'cn', ttsBaseUrl: '', ttsApiKey: '' })
    expect(loadReaderSettings()).toEqual({ rate: 1.5, voiceURI: 'cn', ttsBaseUrl: '', ttsApiKey: '' })
    localStorage.setItem('storyforge-speech-reader', JSON.stringify({ rate: 9, voiceURI: 123 }))
    expect(loadReaderSettings()).toEqual({ rate: 1, voiceURI: '', ttsBaseUrl: '', ttsApiKey: '' })
    localStorage.setItem('storyforge-speech-reader', '{bad json')
    expect(loadReaderSettings()).toEqual(DEFAULT_READER_SETTINGS)
  })
})

describe('语音朗读 · 语音列表异步加载', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('初始语音为空时，兜底探针在 200ms 后取到语音并只通知一次', () => {
    const engine = createMockEngine([])
    const reader = new SpeechReaderController(engine)
    let emits = 0
    reader.subscribe(() => { emits += 1 })
    expect(reader.getVoices()).toEqual([])
    engine.voices = [{ voiceURI: 'cn', name: '中文', lang: 'zh-CN' }]
    vi.advanceTimersByTime(200)
    expect(reader.getVoices()).toHaveLength(1)
    expect(emits).toBe(1)
    // 已拿到语音，后续兜底探针被取消，不再重复通知
    vi.advanceTimersByTime(2500)
    expect(emits).toBe(1)
    reader.dispose()
  })

  it('语音始终不可用时探针静默；dispose 清理定时器不报错', () => {
    const engine = createMockEngine([])
    const reader = new SpeechReaderController(engine)
    let emits = 0
    reader.subscribe(() => { emits += 1 })
    vi.advanceTimersByTime(3000)
    expect(reader.getVoices()).toEqual([])
    expect(emits).toBe(0)
    expect(() => reader.dispose()).not.toThrow()
  })

  it('start 时再同步一次语音列表（页面久留后语音才到达的兜底）', () => {
    const engine = createMockEngine([])
    const reader = new SpeechReaderController(engine)
    engine.voices = [{ voiceURI: 'cn', name: '中文', lang: 'zh-CN' }]
    reader.start(buildReaderItems([{ pos: 0, text: '甲。' }]))
    expect(reader.getVoices()).toHaveLength(1)
    reader.dispose()
  })
})

describe('语音朗读 · 环境支持检测', () => {
  it('测试环境（happy-dom）无 speechSynthesis 时报告不支持，UI 应隐藏入口', () => {
    expect(isSpeechSynthesisSupported()).toBe(false)
  })
})
