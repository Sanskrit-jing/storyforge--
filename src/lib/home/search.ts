import { FIELD_REGISTRY } from '../registry/field-registry'
import { db } from '../db/schema'
import { readHomeCatalog, workPath, type HomeWork } from './catalog'
import { readOwnedRows } from '../workspace/scope'
import type { Chapter, Character, Worldview } from '../types'
import { htmlToPlainText } from '../utils/html'
export type HomeSearchHit={key:string;kind:string;title:string;excerpt:string;row?:HomeWork;path:string}
export async function searchHome(query:string,kind='all',workId?:number){
 const needle=query.trim().toLocaleLowerCase();if(!needle)return {items:[] as HomeSearchHit[],truncated:false}
 const catalog=await readHomeCatalog(),items:HomeSearchHit[]=[];let truncated=false
 const accepts=(k:string)=>kind==='all'||kind===k
 const add=(hit:HomeSearchHit,text:string)=>{if(!accepts(hit.kind))return;const plain=htmlToPlainText(text);const index=plain.toLocaleLowerCase().indexOf(needle);if(index<0)return;if(items.length>=100){truncated=true;return}items.push({...hit,excerpt:plain.slice(Math.max(0,index-45),index+180)})}
 for(const row of catalog.rows.filter(r=>!workId||r.work.id===workId)){
  const {work:w}=row;if(row.project.workspacePurpose==='independent-work')add({key:`work:${w.id}`,kind:'works',title:w.title,excerpt:'',row,path:`/home/detail?work=${w.id}`},`${w.title}\n${w.description}`)
  const scope={projectId:w.projectId,worldId:w.worldId,workId:w.id!}
  if(accepts('chapters'))for(const c of await readOwnedRows<Chapter>(scope,'chapters',{owner:'work'})){const outline=await db.outlineNodes.get(c.outlineNodeId);add({key:`chapter:${c.id}`,kind:'chapters',title:outline?.title||'正文',excerpt:'',row,path:workPath(row,'chapters-list')+(w.kind==='novel'&&w.novelProfile==='long'?`&chapter=${c.outlineNodeId}`:'')},`${outline?.title||''}\n${c.content}`)}
  if(accepts('characters'))for(const c of await readOwnedRows<Character>(scope,'characters',{owner:'world'}))add({key:`character:${c.id}`,kind:'characters',title:c.name,excerpt:'',row,path:workPath(row,'characters-main')},`${c.name}\n${c.shortDescription}\n${c.background}\n${c.personality}\n${c.motivation}`)
  if(accepts('settings'))for(const c of await readOwnedRows<Worldview>(scope,'worldviews',{owner:'world'}))add({key:`settings:${c.id}`,kind:'settings',title:`${row.world.name} · 世界设定`,excerpt:'',row,path:workPath(row,'world-rules')},FIELD_REGISTRY.filter(f=>f.target==='worldviews').map(f=>{const value=c[f.field as keyof Worldview];return value==null?'':`${f.labels?.[0]||f.field}: ${typeof value==='object'?Object.values(value).filter(v=>typeof v==='string').join('；'):String(value)}`}).join('\n'))
  if(truncated)break
 }
 if(!workId)for(const w of catalog.worlds)add({key:`world:${w.id}`,kind:'worlds',title:w.name,excerpt:'',path:`/world/basics?project=${w.projectId}`},`${w.name}\n${w.description}\n${w.code}`)
 return {items:[...new Map(items.map(item=>[item.key,item])).values()],truncated}
}
