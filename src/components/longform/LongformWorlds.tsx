import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { db } from '../../lib/db/schema'
import type { Project, WorldDerivationV1, WorldRelease } from '../../lib/types'
import { useActiveWork } from '../../hooks/useActiveWork'
import WorldDerivationActions from '../world-engine/WorldDerivationActions'
import WorldSharingPanel from '../product/WorldSharingPanel'
import { publishWorldRevision } from '../../lib/world-engine/releases'
import '../world-engine/panels.css'

export default function LongformWorlds({ project, community, onOpen }: { project: Project; community: boolean; onOpen: (id: number) => void }) {
  const work = useActiveWork(project)
  const [rows, setRows] = useState<{ lineage: WorldDerivationV1; project: Project; release?: WorldRelease }[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!work) return
    const sub = liveQuery(async () => {
      const origins = await db.worldDerivations.filter(row => row.sourceWorkCode === work.code && row.sourceWorkspaceUid === project.workspaceUid).toArray()
      const result: { lineage: WorldDerivationV1; project: Project; release?: WorldRelease }[] = []
      for (const lineage of origins) {
        const target = await db.projects.get(lineage.projectId)
        if (target) result.push({ lineage, project: target, release: lineage.targetRevisionId ? await db.worldReleases.where('revisionId').equals(lineage.targetRevisionId).first() : undefined })
      }
      return result.sort((a, b) => b.lineage.createdAt - a.lineage.createdAt)
    }).subscribe({ next: setRows, error: cause => setError(String(cause)) })
    return () => sub.unsubscribe()
  }, [work?.code, project.workspaceUid, work])
  const current = rows.find(row => row.project.id === selected) ?? rows[0]
  const seal = async () => {
    if (!current?.lineage.targetRevisionId || busy) return
    setBusy(true); setError('')
    try { await publishWorldRevision(current.lineage.targetRevisionId); setRevision(value => value + 1) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  return <div><section className="lf-paper"><h3>{community ? '派生世界的分享与发行' : '从这部作品派生世界'}</h3><p>选择已确认的内容，生成带有作品来源记录的独立世界草稿或封存版本。原作品保留，后续修改由你决定何时再次派生。</p><WorldDerivationActions project={project} onDerived={id => setSelected(id)} /></section>
    {error && <p role="alert">{error}</p>}
    <section className="lf-paper"><h3>已派生的世界</h3>{!rows.length ? <p>这部作品还没有派生世界。完成派生后，可以在这里查看来源并制作世界分享包。</p> : <><label>选择世界 <select value={current?.project.id ?? ''} onChange={event => setSelected(Number(event.target.value))}>{rows.map(row => <option key={row.project.id} value={row.project.id}>{row.project.name}</option>)}</select></label><p>{current.release ? `已封存 · v${current.release.version} · ${current.release.label}` : '草稿修订 · 尚未封存'}</p><p>源作品修订：{new Date(current.lineage.sourceWorkRevision).toLocaleString()}<br/>派生时间：{new Date(current.lineage.createdAt).toLocaleString()}</p><div className="flex flex-wrap gap-3"><button className="lf-action" onClick={() => onOpen(current.project.id!)}>打开世界</button><button className="lf-action" disabled={busy || !!current.release || !current.lineage.targetRevisionId} onClick={() => void seal()}>{busy ? '封存中…' : current.release ? '已封存' : '封存派生修订'}</button></div></>}</section>
    {community && current && <section className="lf-paper"><WorldSharingPanel key={current.project.id} project={current.project} worldReleaseRevision={revision} onImported={onOpen}/></section>}
    {community && <section className="lf-paper"><h3>社区数据</h3><p>当前分享方式为本地世界文件包。在线发布、浏览量、使用量及社区反馈尚未接入服务，暂无可展示的数据。</p></section>}
  </div>
}
