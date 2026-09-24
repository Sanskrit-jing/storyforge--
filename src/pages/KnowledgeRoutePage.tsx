import { lazy, Suspense } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'

const GlobalKnowledgePanel = lazy(() => import('../components/knowledge/GlobalKnowledgePanel'))

export default function KnowledgeRoutePage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen safe-area-pad bg-bg-base">
      <header className="border-b border-border px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/')}
          className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          title="返回首页"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-base font-semibold text-text-primary">全局知识库</h1>
          <p className="text-xs text-text-muted">作者手写的查阅式参考手册；AI 写到相关情节时按主题主动查询取参考。</p>
        </div>
      </header>
      <main className="p-4 md:p-8">
        <Suspense fallback={<div className="p-6 text-sm text-text-muted">知识库加载中…</div>}>
          <GlobalKnowledgePanel />
        </Suspense>
      </main>
    </div>
  )
}
