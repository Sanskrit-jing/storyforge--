import { lazy, Suspense } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'

const CommonPhrasesPage = lazy(() => import('../components/phrases/CommonPhrasesPage'))

export default function PhrasesRoutePage() {
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
          <h1 className="text-base font-semibold text-text-primary">常用语</h1>
          <p className="text-xs text-text-muted">跨项目共享的快捷文案，创作时可随时查找、填入或复制。</p>
        </div>
      </header>
      <Suspense fallback={<div className="p-6 text-sm text-text-muted">常用语加载中…</div>}>
        <CommonPhrasesPage />
      </Suspense>
    </div>
  )
}
