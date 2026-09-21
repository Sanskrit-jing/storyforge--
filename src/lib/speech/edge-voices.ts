/**
 * Edge TTS 神经网络人声静态清单。
 *
 * 这些语音来自微软 Edge 在线 TTS 服务，名称以 "Neural" 结尾，
 * 对应 Cloudflare Worker 部署的 edgetts-cloudflare-workers 项目中的 voice 参数。
 * 用于远程 TTS 引擎（createRemoteTtsEngine）的 getVoices() 返回值，
 * 使语音下拉能展示与浏览器 Web Speech API 相同的 Natural 分组。
 *
 * 仅包含中文人声（普通话 + 粤港澳 + 台湾），因为本项目面向中文小说创作。
 */

/** 创建一个结构兼容 SpeechSynthesisVoice 的静态语音描述 */
function voice(
  voiceURI: string,
  name: string,
  lang: string,
  isDefault = false,
): SpeechSynthesisVoice {
  return { voiceURI, name, lang, localService: false, default: isDefault }
}

/** 普通话女声 */
const MANDARIN_FEMALE = [
  voice('zh-CN-XiaoxiaoNeural', '晓晓 Neural · 女声 · 温暖叙事', 'zh-CN', true),
  voice('zh-CN-XiaoyiNeural', '晓伊 Neural · 女声 · 活泼', 'zh-CN'),
  voice('zh-CN-XiaohanNeural', '晓涵 Neural · 女声 · 沉静', 'zh-CN'),
  voice('zh-CN-XiaomoNeural', '晓墨 Neural · 女声 · 清冷', 'zh-CN'),
  voice('zh-CN-XiaoruiNeural', '晓睿 Neural · 女声 · 成熟', 'zh-CN'),
  voice('zh-CN-XiaochenNeural', '晓辰 Neural · 女声 · 明快', 'zh-CN'),
  voice('zh-CN-XiaoxuanNeural', '晓萱 Neural · 女声 · 柔和', 'zh-CN'),
  voice('zh-CN-XiaoyanNeural', '晓颜 Neural · 女声 · 亲切', 'zh-CN'),
  voice('zh-CN-XiaoshuangNeural', '晓双 Neural · 女童声', 'zh-CN'),
]

/** 普通话男声 */
const MANDARIN_MALE = [
  voice('zh-CN-YunxiNeural', '云希 Neural · 男声 · 温暖叙事', 'zh-CN'),
  voice('zh-CN-YunyangNeural', '云扬 Neural · 男声 · 沉稳播音', 'zh-CN'),
  voice('zh-CN-YunjianNeural', '云健 Neural · 男声 · 阳刚', 'zh-CN'),
  voice('zh-CN-YunfengNeural', '云枫 Neural · 男声 · 磊落', 'zh-CN'),
  voice('zh-CN-YunzeNeural', '云泽 Neural · 男声 · 浑厚成熟', 'zh-CN'),
  voice('zh-CN-YunhaoNeural', '云皓 Neural · 男声 · 清朗', 'zh-CN'),
  voice('zh-CN-YunyeNeural', '云野 Neural · 男声 · 质朴', 'zh-CN'),
  voice('zh-CN-YunxiaNeural', '云夏 Neural · 男童声', 'zh-CN'),
]

/** 粤港澳 + 台湾 */
const CANTONESE_TAIWAN = [
  voice('zh-HK-HiuMaanNeural', '曉曼 Neural · 粤语女声', 'zh-HK'),
  voice('zh-HK-WanLungNeural', '雲龍 Neural · 粤语男声', 'zh-HK'),
  voice('zh-TW-HsiaoChenNeural', '曉臻 Neural · 台湾女声', 'zh-TW'),
  voice('zh-TW-YunJheNeural', '雲哲 Neural · 台湾男声', 'zh-TW'),
]

/** Edge TTS 中文 Neural 人声完整清单（供远程引擎使用） */
export const EDGE_TTS_VOICES: SpeechSynthesisVoice[] = [
  ...MANDARIN_FEMALE,
  ...MANDARIN_MALE,
  ...CANTONESE_TAIWAN,
]
