import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import type { Project } from '../../lib/types'
import { loadWorldProjection, type WorldProjection } from '../../lib/world-engine/domain'
export default function WorldDraftSummary({project}:{project:Project}) {
  const [summary,setSummary]=useState<WorldProjection|null>(null),[error,setError]=useState('')
  useEffect(()=>{setSummary(null);setError('');const sub=liveQuery(()=>loadWorldProjection(project)).subscribe({next:setSummary,error:e=>setError(String(e))});return()=>sub.unsubscribe()},[project])
  return <section className="lf-paper"><h3>世界草稿内容概览</h3><p>这里显示当前草稿的语义内容；产品读取的仍是你选定的封存版本。</p>{error&&<p role="alert">{error}</p>}{summary&&<dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Object.values(summary.domains).map(domain=><div key={domain.key}><dt>{domain.label}</dt><dd className="text-sm text-text-secondary">{domain.rowCount} 条记录 · {domain.activeTableCount}/{domain.tableCount} 类内容</dd></div>)}</dl>}</section>
}
