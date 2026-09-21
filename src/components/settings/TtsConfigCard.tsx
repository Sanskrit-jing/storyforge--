/**
 * 朗读人声（在线 TTS）配置卡。
 *
 * 引擎优先级：自部署 Cloudflare Worker（显式配置，任意环境可用）
 *   > 浏览器 Web Speech API（Edge 桌面版自带 Neural 人声）。
 * 手机版 Edge、APK/HAP 打包后的 WebView 缺少 Neural 人声时，自部署 Worker
 * 路径改走微软在线 TTS 的 Neural 人声（晓晓/云希等）。配置持久化在
 * localStorage（reader-settings），与听书偏好同键存储。
 *
 * 说明：曾提供「Edge 直连微软 TTS」（不经自部署服务、网页直连微软私有接口）
 * 的实验性方式，实测微软对非 Edge UA 一律 403、版本门禁苛刻且不稳定，已移除；
 * 非 Edge 环境获得 Neural 人声的途径只保留自部署 Worker。
 */
import { useState } from 'react'
import { Volume2, PlugZap, Server } from 'lucide-react'
import { loadReaderSettings, saveReaderSettings } from '../../lib/speech/reader-settings'

const REPO_URL = 'https://github.com/icheer/edgetts-cloudflare-workers-webui'

export default function TtsConfigCard() {
  // 草稿模式：输入只改本地状态，点「保存」才写入持久层（有显式保存反馈，避免「改了不知道存没存」）。
  const [saved, setSaved] = useState(() => loadReaderSettings())
  const [baseUrl, setBaseUrl] = useState(() => saved.ttsBaseUrl)
  const [apiKey, setApiKey] = useState(() => saved.ttsApiKey)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState('')

  const dirty = baseUrl.trim() !== saved.ttsBaseUrl || apiKey !== saved.ttsApiKey

  const persist = (nextBase: string, nextKey: string) => {
    saveReaderSettings({ ...loadReaderSettings(), ttsBaseUrl: nextBase, ttsApiKey: nextKey })
    setSaved(loadReaderSettings())
  }

  const save = () => {
    persist(baseUrl.trim(), apiKey)
    setMsg('已保存。重新进入章节编辑器后生效。')
  }

  /** 发一小段文本验证服务可达与 Key 有效（不播放音频） */
  const testConnection = async () => {
    const root = baseUrl.trim().replace(/\/+$/, '')
    if (!root) { setMsg('请先填写服务地址'); return }
    setTesting(true); setMsg('')
    try {
      const res = await fetch(`${root}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({ input: '你好', voice: 'zh-CN-XiaoxiaoNeural', response_format: 'mp3' }),
      })
      setMsg(res.ok
        ? '连接成功，Neural 人声可用。重新进入章节编辑器后朗读即走该服务。'
        : `服务返回 HTTP ${res.status}${res.status === 401 || res.status === 403 ? '（API Key 不匹配）' : '（请检查服务地址）'}`)
    } catch {
      setMsg('无法连接服务：请检查地址是否正确、网络是否可达。若地址为 *.workers.dev，国内网络通常无法直连（表现为浏览器直接打开也超时），可给 Worker 绑定自定义域名后改填该域名。')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="max-w-2xl mt-6 p-4 bg-bg-surface border border-border rounded-xl">
      <h3 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-1.5">
        <Volume2 className="w-4 h-4 text-accent" /> 朗读人声
      </h3>
      <p className="text-xs text-text-muted leading-relaxed mb-3">
        默认使用浏览器内置语音——<strong>Edge 桌面版自带 Neural 自然人声</strong>，无需任何配置。
        想改用微软在线 TTS 的 Neural 人声（晓晓/云希等 15+）时，配置下方自部署 Worker 即可。
        正文文本只会发送到你部署的 Worker。
      </p>

      <div className="space-y-3">
        {/* 自部署 Worker（任意浏览器可用） */}
        <div className="p-2.5 bg-bg-base border border-border rounded space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-text-primary inline-flex items-center gap-1">
              <Server className="w-3.5 h-3.5 text-accent" /> 自部署 Worker（微软 TTS 代理）
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted shrink-0">任意浏览器可用 · 需一次性部署</span>
          </div>
          <p className="text-[11px] text-text-muted leading-relaxed">
            <strong>任意浏览器用 Edge Neural 人声的唯一途径</strong>：
            把开源项目一键部署到你自己的免费 Cloudflare Workers，得到一个私人微软 TTS 代理，部署一次永久可用。
          </p>
          <ol className="text-[11px] text-text-muted leading-relaxed pl-4 list-decimal space-y-0.5">
            <li>注册/登录 Cloudflare（免费套餐足够用）；</li>
            <li>
              打开开源项目{' '}
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline">edgetts-cloudflare-workers</a>
              {' '}→ 按项目页指引一键部署（约两分钟）；
            </li>
            <li>把部署得到的网址（形如 <code className="px-0.5">https://xxx.workers.dev</code>）粘贴到下方，点「测试连接」。</li>
          </ol>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Worker 服务地址（可选，配置后启用 Neural 人声）</label>
            <input type="text" value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://your-worker.workers.dev"
              className="w-full px-3 py-1.5 bg-bg-surface border border-border rounded text-text-primary text-xs focus:outline-none focus:border-accent" />
          </div>
          <p className="text-[11px] text-amber-500 leading-relaxed">
            提示：国内网络通常无法直连 <code className="px-0.5">*.workers.dev</code>（表现为"测试连接/浏览器打开均超时"），
            需给 Worker 绑定自定义域名后改填；Worker 侧密钥变量名须为 <code className="px-0.5">API_KEY</code>（机密变量），
            其他名称不会启用鉴权。
          </p>
          <div>
            <label className="block text-xs text-text-secondary mb-1">API Key <span className="text-text-muted">（部署 Worker 时自设的 API_KEY；未设鉴权可留空）</span></label>
            <input type="password" value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="留空 = Worker 未开启鉴权"
              className="w-full px-3 py-1.5 bg-bg-surface border border-border rounded text-text-primary text-xs focus:outline-none focus:border-accent" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={save} disabled={!dirty}
              className="px-3 py-1.5 text-xs bg-accent/10 text-accent rounded-lg hover:bg-accent/20 disabled:opacity-40 transition-colors">
              保存
            </button>
            <button onClick={testConnection} disabled={testing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-bg-elevated text-text-secondary rounded-lg hover:bg-bg-hover hover:text-accent disabled:opacity-50 transition-colors">
              <PlugZap className="w-3.5 h-3.5" /> {testing ? '测试中…' : '测试连接'}
            </button>
            {(saved.ttsBaseUrl || baseUrl.trim()) && (
              <button onClick={() => { setBaseUrl(''); setApiKey(''); persist('', ''); setMsg('已清空，恢复浏览器内置语音。') }}
                className="px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors">
                清空（恢复浏览器内置语音）
              </button>
            )}
            {dirty && <span className="text-[11px] text-amber-500">有未保存更改</span>}
          </div>
          {msg && <p className="text-[11px] text-text-secondary px-2 py-1 rounded bg-bg-surface">{msg}</p>}
        </div>

        <p className="text-[11px] text-text-muted">
          保存后<strong>重新进入章节编辑器</strong>生效；走微软在线 TTS 时语音下拉会显示完整的
          Edge Neural 中文声库（晓晓/云希/云扬等 15+ 人声）。
        </p>
      </div>
    </div>
  )
}
