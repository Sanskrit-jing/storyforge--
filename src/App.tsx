import { lazy, Suspense } from 'react'
import { Routes, Route, useSearchParams } from 'react-router'

import { PRODUCT_NAVIGATION } from './components/navigation/product-navigation'

const PreviewRoutePage = lazy(() => import('./pages/PreviewRoutePage'))
const MistHarborPage = lazy(() => import('./pages/MistHarborPage'))
const ProductHubPage = lazy(() => import('./pages/ProductHubPage'))
const LongformLibraryPage = lazy(() => import('./pages/LongformLibraryPage'))
const WorkspacePage = lazy(() => import('./pages/WorkspacePage'))
const TtrpgCommunityPage = lazy(() => import('./pages/TtrpgCommunityPage'))
const TtrpgSessionPage = lazy(() => import('./pages/TtrpgSessionPage'))
const SettingsRoutePage = lazy(() => import('./pages/SettingsRoutePage'))

function RouteFallback() {
  return <div className="min-h-screen bg-bg-base flex items-center justify-center text-sm text-text-muted">加载中…</div>
}

function HomeRoute() {
  const [params] = useSearchParams()
  // Preserve existing work/tool deep links while the remaining products are audited.
  return params.has('tab') ? <ProductHubPage /> : <PreviewRoutePage />
}

export default function App() {
  return (
    <Routes>
      {[...PRODUCT_NAVIGATION.filter(item => item.id !== 'long'), { id: 'community' }].map(item => <Route key={item.id} path={`/${item.id}/:pageId?`} element={<Suspense fallback={<RouteFallback />}><PreviewRoutePage productId={item.id}/></Suspense>}/>)}
      <Route path="/" element={<Suspense fallback={<RouteFallback />}><HomeRoute /></Suspense>} />
      <Route path="/play" element={<Suspense fallback={<RouteFallback />}><TtrpgCommunityPage /></Suspense>} />
      <Route path="/play/session/:sessionId" element={<Suspense fallback={<RouteFallback />}><TtrpgSessionPage /></Suspense>} />
      <Route path="/play/mist-harbor" element={<Suspense fallback={<RouteFallback />}><MistHarborPage /></Suspense>} />
      <Route path="/play/:gameKey" element={<Suspense fallback={<RouteFallback />}><TtrpgCommunityPage /></Suspense>} />
      <Route path="/settings" element={<Suspense fallback={<RouteFallback />}><SettingsRoutePage /></Suspense>} />
      <Route path="/long" element={<Suspense fallback={<RouteFallback />}><LongformLibraryPage /></Suspense>} />
      <Route path="/workspace/:projectId" element={<Suspense fallback={<RouteFallback />}><WorkspacePage /></Suspense>} />
    </Routes>
  )
}
