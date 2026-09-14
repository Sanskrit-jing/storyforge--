import { useDialog } from '../components/shared/Dialog'
import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { useNavigate } from 'react-router'
import { db } from '../lib/db/schema'
import type { Project, Work } from '../lib/types'
import { createWorkspace } from '../lib/workspace/create-workspace'
import { effectiveNovelProfile, effectiveWorkKind } from '../lib/workspace/work-kind'
import { useProjectStore } from '../stores/project'
import LongformLayout from '../components/longform/LongformLayout'

export default function LongformLibraryPage() {
  const navigate = useNavigate()
  const dialog = useDialog()
  const [rows, setRows] = useState<{ project: Project; work: Work }[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const sub = liveQuery(async () => {
      const projects = await db.projects.toArray()
      const result: { project: Project; work: Work }[] = []
      for (const project of projects) {
        if (project.workspacePurpose !== 'independent-work' || !project.activeWorkId) continue
        const work = await db.works.get(project.activeWorkId)
        if (work && work.projectId === project.id && effectiveWorkKind(work) === 'novel' && effectiveNovelProfile(work) === 'long') result.push({ project, work })
      }
      return result.sort((a, b) => b.work.updatedAt - a.work.updatedAt)
    }).subscribe({ next: value => { setRows(value); setLoading(false) }, error: cause => { setError(String(cause)); setLoading(false) } })
    return () => sub.unsubscribe()
  }, [])
  const create = async () => {
    if (!title.trim() || busy) return
    setBusy(true); setError('')
    try {
      const result = await createWorkspace({ name: title.trim(), genres: [], description: '', targetWordCount: 300000, status: 'drafting' }, { purpose: 'independent-work', kind: 'novel', novelProfile: 'long' })
      await useProjectStore.getState().loadProjects()
      navigate(`/workspace/${result.project.id}?module=info`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const rename = async (project: Project, work: Work) => {
    const value = await dialog.prompt({ title: '重命名长篇', defaultValue: work.title, confirmText: '保存名称' })
    if (!value?.trim()) return
    try { await useProjectStore.getState().updateActiveWork(project.id!, { title: value.trim() }) }
    catch (cause) { setError(String(cause)) }
  }
  const remove = async (project: Project) => {
    try { await useProjectStore.getState().deleteProject(project.id!) }
    catch (cause) { setError(String(cause)) }
  }
  return <LongformLayout section="library" onHome={() => navigate('/')} onSection={section => {
    if (section === 'library') return
    if (rows[0]) navigate(`/workspace/${rows[0].project.id}?section=${section}&module=${section === 'versions' ? 'version-history' : section === 'import' ? 'import-doc' : section === 'settings' ? 'settings' : 'info'}`)
    else { setCreating(true); setError('先创建一部长篇，再打开它的工作台。') }
  }}>
    <section className="lf-paper"><div className="flex flex-wrap items-center justify-between gap-4"><h3>我的长篇</h3><button className="lf-action lf-action-primary" onClick={() => setCreating(value => !value)}>新建长篇</button></div><input aria-label="搜索长篇" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索作品名称或简介"/>
      {creating && <form className="mt-5 flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); void create() }}><input aria-label="新长篇名称" autoFocus value={title} onChange={event => setTitle(event.target.value)} placeholder="为这部作品起个名字" maxLength={200}/><button className="lf-action lf-action-primary" disabled={busy || !title.trim()}>{busy ? '创建中…' : '创建并进入工作台'}</button></form>}
      {error && <p role="alert">{error}</p>}
    </section>
    {loading ? <p role="status">正在读取作品库…</p> : !rows.length ? <section className="lf-paper"><h3>从你的第一个故事开始</h3><p>在这里创建长篇，随后自由完善世界、故事和人物，直至写出正文。</p></section> : <div className="lf-library-grid">{rows.filter(({work}) => `${work.title} ${work.description}`.toLowerCase().includes(search.toLowerCase())).map(({ project, work }) => <article className="lf-paper" key={work.id}><h3>{work.title}</h3><p>{work.description || '尚未填写作品简介'}</p><p>{work.currentWordCount.toLocaleString()} 字 · 最近编辑 {new Date(work.updatedAt).toLocaleDateString()}</p><button className="lf-action" onClick={() => navigate(`/workspace/${project.id}?module=info`)}>进入长篇工作台</button><div className="mt-3 flex flex-wrap gap-3"><button className="lf-action" onClick={() => void rename(project, work)}>重命名</button><button className="lf-action" onClick={() => navigate(`/workspace/${project.id}?module=export`)}>导出与备份</button><button className="lf-action" onClick={() => void remove(project)}>删除作品</button></div></article>)}</div>}
  </LongformLayout>
}
