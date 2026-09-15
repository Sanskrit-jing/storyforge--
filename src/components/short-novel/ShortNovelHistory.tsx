import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import type { CreationReleaseV1, Project, WorkspaceScope } from '../../lib/types'
import { resolveScope } from '../../lib/workspace/scope'
import { listShortNovelReleasesV1, readShortNovelReleaseManifestV1, renderShortNovelReleaseJsonV1, renderShortNovelReleaseMarkdownV1, renderShortNovelReleaseTextV1 } from '../../lib/short-novel/service'

/** Historical shortform releases remain readable after the same Work expands to longform. */
export default function ShortNovelHistory({project}:{project:Project}) {
  const [state,setState] = useState<{scope:WorkspaceScope;rows:CreationReleaseV1[]}|null>(null)
  const [error,setError] = useState('')
  useEffect(()=>{
    const sub=liveQuery(async()=>{const scope=await resolveScope({projectId:project.id!});return {scope,rows:await listShortNovelReleasesV1(scope)}}).subscribe({next:setState,error:cause=>setError(String(cause))})
    return ()=>sub.unsubscribe()
  },[project.id])
  const download=async(row:CreationReleaseV1,format:'md'|'txt'|'json')=>{
    try {
      const manifest=await readShortNovelReleaseManifestV1(state!.scope,row.id!)
      const body=format==='md'?renderShortNovelReleaseMarkdownV1(manifest):format==='txt'?renderShortNovelReleaseTextV1(manifest):renderShortNovelReleaseJsonV1(manifest)
      const url=URL.createObjectURL(new Blob([body],{type:format==='json'?'application/json':'text/plain;charset=utf-8'}))
      const a=document.createElement('a');a.href=url;a.download=`${manifest.work.title.replace(/[\\/:*?"<>|]/g,'_')}-短篇-v${row.version}.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
    } catch(cause){setError(String(cause))}
  }
  if(!state?.rows.length&&!error)return null
  return <details className="lf-paper"><summary>扩写前的短篇版本</summary><p>这些版本保留发布时的短篇内容，后续长篇修改不会改变它们。</p>{state?.rows.map(row=><div key={row.id}><strong>{row.label}</strong>{(['md','txt','json'] as const).map(format=><button className="lf-action" key={format} onClick={()=>void download(row,format)}>下载 {format.toUpperCase()}</button>)}</div>)}{error&&<p role="alert">{error}</p>}</details>
}
