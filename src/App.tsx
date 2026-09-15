import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useSearchParams } from 'react-router'

import ResumeTracker from './components/home/ResumeTracker'

import { PRODUCT_NAVIGATION } from './components/navigation/product-navigation'

const TtrpgPage = lazy(() => import('./pages/TtrpgPage'))
const AvgPage = lazy(() => import('./pages/AvgPage'))
const HomePage = lazy(() => import('./pages/HomePage'))
const WorldEnginePage = lazy(() => import('./pages/WorldEnginePage'))
const MotionMaterialsPage = lazy(() => import('./pages/MotionMaterialsPage'))
const PreviewRoutePage = lazy(() => import('./pages/PreviewRoutePage'))
const MistHarborPage = lazy(() => import('./pages/MistHarborPage'))
const ProductHubPage = lazy(() => import('./pages/ProductHubPage'))
const ScreenplayPage = lazy(() => import('./pages/ScreenplayPage'))
const ShortformPage = lazy(() => import('./pages/ShortformPage'))
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
  if (params.get('product') === 'avg') { const next = new URLSearchParams(params); next.delete('tab'); next.delete('product'); return <Navigate replace to={`/avg/production?${next}`}/> }
  if (params.get('tab') === 'ttrpg' && params.get('legacy') !== '1' && !params.has('onlineHandoff')) { const next = new URLSearchParams(params); next.delete('tab'); const page = next.has('worldHandoff') ? 'source' : next.has('session') ? 'play' : next.has('project') ? 'production' : 'library'; return <Navigate replace to={`/ttrpg/${page}?${next}`}/> }
  // Preserve existing work/tool deep links while the remaining products are audited.
  return params.has('tab') && (params.get('tab') !== 'home' || params.get('legacy') === '1') ? <ProductHubPage /> : <HomePage />
}

export default function App() {
  return (
    <>
    <ResumeTracker/>
    <Routes>
      <Route path="/motion/:pageId?" element={<Suspense fallback={<RouteFallback />}><MotionMaterialsPage/></Suspense>}/>
      {[...PRODUCT_NAVIGATION.filter(item => !['home', 'long', 'short', 'script', 'world', 'avg', 'ttrpg', 'motion'].includes(item.id)), { id: 'community' }].map(item => <Route key={item.id} path={`/${item.id}/:pageId?`} element={<Suspense fallback={<RouteFallback />}><PreviewRoutePage productId={item.id}/></Suspense>}/>)}
      <Route path="/ttrpg/:pageId?" element={<Suspense fallback={<RouteFallback />}><TtrpgPage /></Suspense>}/>
      <Route path="/avg/:pageId?" element={<Suspense fallback={<RouteFallback />}><AvgPage /></Suspense>}/>
      <Route path="/home/:pageId?" element={<Suspense fallback={<RouteFallback />}><HomePage /></Suspense>}/>
      <Route path="/world/:pageId?" element={<Suspense fallback={<RouteFallback />}><WorldEnginePage /></Suspense>}/>
      <Route path="/script/:pageId?" element={<Suspense fallback={<RouteFallback />}><ScreenplayPage /></Suspense>}/>
      <Route path="/" element={<Suspense fallback={<RouteFallback />}><HomeRoute /></Suspense>} />
      <Route path="/play" element={<Suspense fallback={<RouteFallback />}><TtrpgCommunityPage /></Suspense>} />
      <Route path="/play/session/:sessionId" element={<Suspense fallback={<RouteFallback />}><TtrpgSessionPage /></Suspense>} />
      <Route path="/play/mist-harbor" element={<Suspense fallback={<RouteFallback />}><MistHarborPage /></Suspense>} />
      <Route path="/play/:gameKey" element={<Suspense fallback={<RouteFallback />}><TtrpgCommunityPage /></Suspense>} />
      <Route path="/settings" element={<Suspense fallback={<RouteFallback />}><SettingsRoutePage /></Suspense>} />
      <Route path="/short/:pageId?" element={<Suspense fallback={<RouteFallback />}><ShortformPage /></Suspense>} />
      <Route path="/long" element={<Suspense fallback={<RouteFallback />}><LongformLibraryPage /></Suspense>} />
      <Route path="/workspace/:projectId" element={<Suspense fallback={<RouteFallback />}><WorkspacePage /></Suspense>} />
    </Routes>
    </>
  )
}
