import { db } from '../db/schema'
import { resolveScope, scopeTransactionTables } from '../workspace/scope'
import { assertComicTargetSpecV1 } from '../adaptation/contracts'
import { appendAgentEvent, getOrCreateAgentConversation, readAgentEvents } from '../agent/conversations'
import type { ComicTargetSpecV1, WorkspaceScope } from '../types'
export function defaultComicTargetSpec():ComicTargetSpecV1 {
 return {format:'page-comic',audience:'青少年及以上',readingDirection:'ltr',chapterCount:1,targetPagesPerChapter:8,pageSize:{width:1200,height:1700,unit:'px',bleed:0},colorMode:'color',artStyleBrief:'清晰叙事、稳定人物设计，克制的色彩与光影',renderCandidatesPerPanel:3,imageCapabilityRequirement:{referenceImage:true,deterministicSeed:false,inpainting:false,commercialUseRequired:true,minimumWidth:512,minimumHeight:512}}
}
export async function requireComicAuthorRoot(input:WorkspaceScope) {
 const scope=await resolveScope({scope:input});const root=await db.adaptationProjects.where('workId').equals(scope.workId).first()
 if(!root?.id||root.medium!=='comic'||root.projectId!==scope.projectId||root.worldId!==scope.worldId)throw new Error('当前漫画作品不存在或不属于此工作区')
 return {scope,root}
}
/** Drafts are Work-owned author events, never a second copy of confirmed comic fields. */
export async function readComicAuthorDraft(scope:WorkspaceScope,key:string):Promise<string|null> {
 await requireComicAuthorRoot(scope)
 const c=await getOrCreateAgentConversation({projectId:scope.projectId,scope,worldGroupId:null,purpose:`comic-author-draft:${key}`,title:'漫画编辑草稿'})
 const rows=await readAgentEvents(c.id!,scope);return rows[rows.length-1]?.content??null
}
export async function saveComicAuthorDraft(scope:WorkspaceScope,key:string,content:string) {
 await requireComicAuthorRoot(scope)
 const c=await getOrCreateAgentConversation({projectId:scope.projectId,scope,worldGroupId:null,purpose:`comic-author-draft:${key}`,title:'漫画编辑草稿'})
 await appendAgentEvent({projectId:scope.projectId,scope,conversationId:c.id!,kind:'message',role:'user',content})
}
export async function updateComicTargetSpecV1(input:{scope:WorkspaceScope;expectedRevision:number;targetSpec:ComicTargetSpecV1}) {
 assertComicTargetSpecV1(input.targetSpec);const {root}=await requireComicAuthorRoot(input.scope)
 return db.transaction('rw',scopeTransactionTables(db.adaptationProjects,db.comicPanels,db.comicPages),async()=>{
  const current=await db.adaptationProjects.get(root.id!)
  if(!current||current.medium!=='comic'||current.revision!==input.expectedRevision)throw new Error('漫画规格已变化，请重新读取')
  if(current.status==='complete')throw new Error('请先重新打开漫画审校')
  const pages=await db.comicPages.where('adaptationProjectId').equals(root.id!).toArray()
  if(pages.length)await db.comicPanels.where('pageId').anyOf(pages.map(p=>p.id!)).modify({narrativeReviewRevision:null,visualReviewRevision:null,visualReviewBasis:null,visualReviewedAt:null})
  await db.adaptationProjects.update(root.id!,{targetSpec:structuredClone(input.targetSpec),briefSourceManifestVersion:null,planSourceManifestVersion:null,visualBibleSourceManifestVersion:null,status:'brief-review',revision:current.revision+1,updatedAt:Date.now()})
 })
}
