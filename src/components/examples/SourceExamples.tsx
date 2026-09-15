import { useState } from 'react'
import { useNavigate } from 'react-router'
import { createWorkspace } from '../../lib/workspace/create-workspace'
import { useProjectStore } from '../../stores/project'
import { flushPendingEditsV1 } from '../../lib/authoring/pending-edit-coordinator'

const sources = import.meta.glob('../../../showcase/{screenplay,comic}/*/source-novel.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export default function SourceExamples() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const create = async (title: string, source: string) => {
    if (busy) return
    setBusy(true); setError('')
    try {
      await flushPendingEditsV1()
      const result = await createWorkspace({ name: `${title}（体验副本）`, genres: [], description: '来自项目内置改编原作，可在长篇工作台继续创作。', targetWordCount: 300000, status: 'drafting' }, { purpose: 'independent-work', kind: 'novel', novelProfile: 'long', importedNovelText: source })
      await useProjectStore.getState().loadProjects()
      navigate(`/workspace/${result.project.id}?module=chapters-list`)
    } catch (cause) { setError(String(cause)); setBusy(false) }
  }
  return <><p>这些是剧本、漫画的短篇原作。可用来体验长篇工作台的编辑流程，尚不是写完的长篇作品。</p>{error && <p role="alert">{error}</p>}<div className="example-grid">{Object.entries(sources).map(([path, source]) => {
    const title = source.match(/^#\s+(.+)/m)?.[1]?.replace(/[《》]/g, '') || path.split('/').slice(-2)[0]
    return <article className="example-tile" key={path}><small>改编原作 · 工作台体验</small><h4>{title}</h4><details><summary>阅读原作</summary><pre className="example-source">{source}</pre></details><button className="lf-action" disabled={busy} onClick={() => void create(title, source)}>{busy ? '正在创建…' : '创建体验副本'}</button></article>
  })}</div></>
}
