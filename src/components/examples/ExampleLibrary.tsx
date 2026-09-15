import { lazy, Suspense, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import './examples.css'

const Stories = lazy(() => import('../short-novel/ShortNovelShowcase'))
const Scripts = lazy(() => import('../screenplay/ScreenplayShowcase'))
const Comics = lazy(() => import('../comic/ComicShowcase'))
const Motion = lazy(() => import('../motion-drama/MotionDramaShowcase'))
const Town = lazy(() => import('../community/CommunityPrototypeGallery'))
const Ttrpg = lazy(() => import('../../pages/TtrpgCommunityPage'))
const Sources = lazy(() => import('./SourceExamples'))
export type ExampleKind = 'long' | 'short' | 'script' | 'comic' | 'motion' | 'avg' | 'ttrpg' | 'town'
const categories: [ExampleKind, string, string][] = [
  ['short', '小说 · 盐从记忆里长出来', '4 篇完整短篇，直接阅读全文。'],
  ['script', '剧本 · 夜班末站', '4 套完整剧本，阅读并下载 Fountain。'],
  ['comic', '漫画 · 雨停之前', '4 套成品漫画，逐页阅读与下载。'],
  ['motion', '漫剧 · 末班车回声', '前期制作包，查看分镜与逐镜执行方案。'],
  ['avg', 'AVG · 雾港：失潮钟声', '内置完整故事，无需 API 即可游玩。'],
  ['ttrpg', '跑团 · 雾港：最后一盏灯', '导入独立游戏存档，体验内置冒险。'],
  ['town', 'AI 小镇 · 回潮镇', '安装社区原型，拜访居民、体验小镇生活。'],
  ['long', '长篇工作台 · 原作体验', '用已有改编原作创建可编辑的体验副本。'],
]

export function ExampleShelf() {
  return <section className="lf-paper example-shelf" aria-label="示例作品">
    <div className="example-heading"><div><small>STORYFORGE COLLECTION</small><h3>先读一个故事，或走进一个世界</h3><p>项目自带的示例作品，随时阅读与体验。</p></div><Link className="lf-action" to="/home/examples">浏览全部示例</Link></div>
    <div className="example-grid">{categories.map(([id, title, description]) => <Link className="example-tile" key={id} to={`/home/examples?type=${id}`}><small>内置示例</small><h4>{title}</h4><p>{description}</p><span>打开作品 →</span></Link>)}</div>
  </section>
}

export default function ExampleLibrary({ kind = 'short', showNavigation = false }: { kind?: ExampleKind; showNavigation?: boolean }) {
  const navigate = useNavigate()
  const [copying, setCopying] = useState(false)
  const [error, setError] = useState('')
  const copyStory = async (story: { title: string; source: string; promise: string }) => {
    if (copying) return
    setCopying(true); setError('')
    try {
      const { flushPendingEditsV1 } = await import('../../lib/authoring/pending-edit-coordinator')
      await flushPendingEditsV1()
      const { createWorkspace } = await import('../../lib/workspace/create-workspace')
      const result = await createWorkspace({ name: `${story.title}（体验副本）`, genres: [], description: story.promise, targetWordCount: 6000, status: 'drafting' }, { kind: 'novel', novelProfile: 'short', preferredChapterCount: 3, initialChapterContent: story.source })
      const { useProjectStore } = await import('../../stores/project')
      await useProjectStore.getState().loadProjects()
      navigate(`/short/editor?project=${result.project.id}`)
    } catch (cause) { setError(String(cause)) }
    finally { setCopying(false) }
  }
  return <section className="example-library" aria-label="内置示例作品">
    <header className="example-heading"><div>{!showNavigation && <h3>示例作品</h3>}<p>可直接阅读与体验。创建体验副本或游戏存档时，会单独保存到本机。</p></div></header>
    {showNavigation && <nav className="example-tabs" aria-label="示例类型">{categories.map(([id, title]) => <Link key={id} aria-current={kind === id ? 'page' : undefined} to={`/home/examples?type=${id}`}>{title.split(' · ')[0]}</Link>)}</nav>}
    {error && <p role="alert">{error}</p>}
    <Suspense fallback={<p role="status">正在打开示例作品…</p>}>
      {kind === 'long' ? <Sources /> : kind === 'short' ? <Stories copyError={error} copying={copying} onCopy={story => void copyStory(story)} /> : kind === 'script' ? <Scripts /> : kind === 'comic' ? <Comics /> : kind === 'motion' ? <><p>这是前期制作示例，尚无成片视频。</p><Motion /></> : kind === 'town' ? <Town productType="ai-town" onImported={release => navigate(`/town/play?project=${release.projectId}&work=${release.workId}`)} /> : kind === 'ttrpg' ? <Ttrpg embedded /> : <article className="lf-paper example-game"><img src={`${import.meta.env.BASE_URL}demo-assets/mist-harbor/mist-bg-harbor.webp`} alt="" /><div><small>内置 AVG · 无需 API</small><h3>雾港：失潮钟声</h3><p>提起旧铜灯，走进一座正在遗忘姓名的城。选择路线，发现雾港的不同结局。</p><Link className="lf-action lf-action-primary" to="/play/mist-harbor">开始体验雾港</Link></div></article>}
    </Suspense>
  </section>
}
