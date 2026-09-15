import { lazy, Suspense } from 'react'
import { BookOpen } from 'lucide-react'
import AIConfigPanel from './AIConfigPanel'
import CreativeReliabilityCommunityPanel from './CreativeReliabilityCommunityPanel'
import ProjectStorageWorkspacePanel from './ProjectStorageWorkspacePanel'
import type { Project } from '../../lib/types'

const HarnessEvalPanel = import.meta.env.DEV
  ? lazy(() => import('./HarnessEvalPanel'))
  : null

interface Props {
  project?: Project
  onOpenDataManagement?: () => void
}

/**
 * 设置页（Phase 4 之后）：
 * 「提示词管理」已升级为侧边栏一级菜单；这里保留 AI 配置和项目级本地偏好。
 * 项目内设置同时承载存储工作区；全局设置会诚实显示“先进入项目”。
 */
export default function SettingsPage({ project, onOpenDataManagement }: Props) {

  return (
    <div className="h-full overflow-auto p-6">
      <AIConfigPanel />
      <div className="mt-6">
        <ProjectStorageWorkspacePanel project={project} onOpenDataManagement={onOpenDataManagement} />
      </div>
      <CreativeReliabilityCommunityPanel />
      {HarnessEvalPanel && (
        <Suspense fallback={null}>
          <HarnessEvalPanel />
        </Suspense>
      )}

      {/* 其他设置 */}
      <div className="max-w-2xl mt-6 p-4 bg-bg-surface border border-border rounded-xl">
        <h3 className="text-sm font-semibold text-text-primary mb-3">其他</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-text-secondary">新手引导</p>
            <p className="text-xs text-text-muted">浏览示例作品，了解各产品的创作与游玩方式</p>
          </div>
          <a
            href={`${import.meta.env.BASE_URL}home/examples`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-bg-elevated text-text-secondary rounded-lg hover:bg-bg-hover disabled:opacity-50 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            浏览作品示例
          </a>
        </div>
      </div>
    </div>
  )
}
