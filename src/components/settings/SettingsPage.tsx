import { useRef, useState } from 'react'
import { BookOpen, Download, Loader2, Upload } from 'lucide-react'
import AIConfigPanel from './AIConfigPanel'
import TtsConfigCard from './TtsConfigCard'
import { resetWelcomeGuide } from '../guide/WelcomeGuide'
import NS0EvalPanel from './NS0EvalPanel'
import { useToast } from '../shared/Toast'
import { saveText } from '../../lib/export/save-file'
import { exportSettings, importSettings } from '../../lib/settings/settings-backup'
import {
  isEmotionExternalizationEnabled,
  setEmotionExternalizationEnabled,
  isImageryEnabled,
  setImageryEnabled,
  isSensoryImmersionEnabled,
  setSensoryImmersionEnabled,
} from '../../lib/ai/writing-preferences'

/** PROSE-CRAFT:写作偏好开关行（三项共用布局）。 */
function PrefToggleRow(props: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-text-secondary">{props.label}</p>
        <p className="text-xs text-text-muted">{props.description}</p>
      </div>
      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer shrink-0 ml-4">
        <input
          type="checkbox"
          checked={props.checked}
          onChange={e => props.onChange(e.target.checked)}
          className="accent-accent"
        />
        开启
      </label>
    </div>
  )
}

/**
 * 设置页（Phase 4 之后）：
 * 「提示词管理」已升级为侧边栏一级菜单，所以这里只剩 AI 配置。
 * 保留这个外壳是为了未来可能再加其他「设置」类目（快捷键、语言、备份策略等）。
 */
export default function SettingsPage() {
  const toast = useToast()
  const [guideReset, setGuideReset] = useState(false)
  // PROSE-CRAFT:真人感写作约束组开关（localStorage 持久化，默认全部开启）
  const [emotionGuard, setEmotionGuard] = useState(() => isEmotionExternalizationEnabled())
  const [imagery, setImagery] = useState(() => isImageryEnabled())
  const [sensoryImmersion, setSensoryImmersion] = useState(() => isSensoryImmersionEnabled())
  // 备份与迁移：全局设置合并包导出/导入（API Key 默认剥离，显式勾选才含明文）
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [includeSecrets, setIncludeSecrets] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    setBusy('export')
    try {
      const file = exportSettings(includeSecrets)
      const date = new Date().toISOString().slice(0, 10)
      await saveText(
        JSON.stringify(file, null, 2),
        `storyforge-settings-${date}.json`,
        'application/json',
      )
      toast.success(includeSecrets ? '设置已导出（包含 API Key 明文，请妥善保管文件）' : '设置已导出（不含 API Key）')
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(null)
    }
  }

  const handleImportFile = async (file: File) => {
    setBusy('import')
    try {
      let parsed: unknown
      try {
        parsed = JSON.parse(await file.text())
      } catch {
        throw new Error('文件不是有效的 JSON')
      }
      const result = importSettings(parsed)
      if (!result.applied) {
        toast.error('未导入任何设置：文件中没有可识别的设置项')
        setBusy(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }
      // 设置由各模块在页面加载时读取一次，导入完成后刷新页面生效
      toast.success(`已导入 ${result.applied} 项设置，即将刷新页面…`)
      setTimeout(() => window.location.reload(), 900)
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
      setBusy(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="h-full overflow-auto p-6">
      <AIConfigPanel />
      <TtsConfigCard />
      {import.meta.env.DEV && <NS0EvalPanel />}

      {/* 写作偏好 */}
      <div className="max-w-2xl mt-6 p-4 bg-bg-surface border border-border rounded-xl">
        <h3 className="text-sm font-semibold text-text-primary mb-3">写作偏好</h3>
        <div className="space-y-4">
          <PrefToggleRow
            label="情绪外化写法"
            description="生成与改写正文时提醒 AI 把情绪外化为动作、神态、语气（如「怒极反笑」），而不是直接写「他很生气」式标签；对话与内心独白不受限"
            checked={emotionGuard}
            onChange={checked => { setEmotionGuard(checked); setEmotionExternalizationEnabled(checked) }}
          />
          <PrefToggleRow
            label="画面感写法"
            description="环境、打斗、天象描写提醒 AI 用镜头取景式细节展示画面（如滚落的碎石、扒住岩石的枯根），不做「荒凉死寂」「气势磅礴」式形容词定性"
            checked={imagery}
            onChange={checked => { setImagery(checked); setImageryEnabled(checked) }}
          />
          <PrefToggleRow
            label="代入感写法"
            description="人物处境提醒 AI 用动作、触觉和留白把读者放进感官里（如摩挲旧疤淡淡摇头），不做「他生活很苦」式旁观者总结"
            checked={sensoryImmersion}
            onChange={checked => { setSensoryImmersion(checked); setSensoryImmersionEnabled(checked) }}
          />
        </div>
      </div>

      {/* 备份与迁移：全局设置不随项目导出（PROJECT_TABLES 只覆盖项目数据），此处提供独立 JSON 往返 */}
      <div className="max-w-2xl mt-6 p-4 bg-bg-surface border border-border rounded-xl">
        <h3 className="text-sm font-semibold text-text-primary mb-1">备份与迁移</h3>
        <p className="mb-3 text-xs leading-5 text-text-muted">
          导出/导入全局设置（AI 配置与预设、任务路由、Agent 策略、主题、写作偏好、朗读、流派包），
          用于换设备或重装后快速恢复；作品数据请使用项目内的导出功能。
        </p>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={includeSecrets}
              onChange={e => setIncludeSecrets(e.target.checked)}
              className="accent-accent"
            />
            包含 API Key（明文导出，请妥善保管文件）
          </label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void handleExport()}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50 transition-colors"
            >
              {busy === 'export' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              导出设置
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50 transition-colors"
            >
              {busy === 'import' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              导入设置
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0]
                if (file) void handleImportFile(file)
              }}
            />
          </div>
        </div>
      </div>

      {/* 其他设置 */}
      <div className="max-w-2xl mt-6 p-4 bg-bg-surface border border-border rounded-xl">
        <h3 className="text-sm font-semibold text-text-primary mb-3">其他</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-text-secondary">新手引导</p>
            <p className="text-xs text-text-muted">重新显示首次使用时的新手引导教程</p>
          </div>
          <button
            onClick={() => { resetWelcomeGuide(); setGuideReset(true) }}
            disabled={guideReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-bg-elevated text-text-secondary rounded-lg hover:bg-bg-hover disabled:opacity-50 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            {guideReset ? '已重置（刷新生效）' : '重新引导'}
          </button>
        </div>
      </div>
    </div>
  )
}
