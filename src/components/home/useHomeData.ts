import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { db } from '../../lib/db/schema'
import { readHomeCatalog } from '../../lib/home/catalog'
export async function readHomeData(){
 const [catalog,runs,imports,releases,products]=await Promise.all([readHomeCatalog(),db.agentRuns.toArray(),db.importJobs.toArray(),db.creationReleases.toArray(),db.productReleases.toArray()])
 return {...catalog,runs:runs.filter(r=>!r.productRuntimeSessionId&&catalog.rows.some(w=>w.work.id===r.workId&&w.work.projectId===r.projectId)).sort((a,b)=>b.updatedAt-a.updatedAt),imports:imports.filter(i=>catalog.projects.some(p=>p.id===i.projectId)).sort((a,b)=>b.updatedAt-a.updatedAt),releases:releases.filter(r=>catalog.rows.some(w=>w.work.id===r.workId&&w.work.projectId===r.projectId&&w.work.worldId===r.worldId)).sort((a,b)=>b.createdAt-a.createdAt),products:products.filter(r=>catalog.rows.some(w=>w.work.id===r.workId&&w.work.projectId===r.projectId&&w.work.worldId===r.worldId)).sort((a,b)=>b.createdAt-a.createdAt)}
}
export type HomeData=Awaited<ReturnType<typeof readHomeData>>
export function useHomeData(){const [data,setData]=useState<HomeData|null>(null),[error,setError]=useState('');useEffect(()=>{const sub=liveQuery(readHomeData).subscribe({next:d=>{setData(d);setError('')},error:e=>setError(String(e))});return()=>sub.unsubscribe()},[]);return {data,error}}
