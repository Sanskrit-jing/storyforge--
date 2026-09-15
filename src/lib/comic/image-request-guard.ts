import {db} from '../db/schema'
import {scopeTransactionTables} from '../workspace/scope'
import {appendAgentEvent,getOrCreateAgentConversation,readAgentEvents} from '../agent/conversations'
import {requireComicAuthorRoot} from './authoring'
import type {WorkspaceScope} from '../types'
/** Persist submission before transport. Unknown outcomes require a new author-authorized request hash. */
export async function claimComicImageRequestV1(scope:WorkspaceScope,requestHash:string):Promise<void> {
 await requireComicAuthorRoot(scope)
 if(!/^[a-f0-9]{64}$/.test(requestHash))throw new Error('图片请求标识无效')
 await db.transaction('rw',scopeTransactionTables(db.agentConversations,db.agentEvents),async()=>{
  const conversation=await getOrCreateAgentConversation({projectId:scope.projectId,scope,worldGroupId:null,purpose:`comic-image-submission:${requestHash}`,title:'漫画图片请求记录'})
  if((await readAgentEvents(conversation.id!,scope)).length)throw new Error('此图片请求已经提交，结果尚未完整保存，可能仍在服务端处理。请先核查服务端结果；确认需要重做后，点击“明确再生成”。不会自动重发。')
  await appendAgentEvent({projectId:scope.projectId,scope,conversationId:conversation.id!,kind:'message',role:'user',content:JSON.stringify({version:1,requestHash,status:'submitted',submittedAt:Date.now()})})
 })
}
