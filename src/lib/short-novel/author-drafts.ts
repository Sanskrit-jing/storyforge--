import { appendAgentEvent, getOrCreateAgentConversation, readAgentEvents } from '../agent/conversations'
import type { WorkspaceScope } from '../types'

/** Author working text, never confirmed Canon; reuses registered Work-owned event lifecycle. */
export async function readShortAuthorDraft(scope: WorkspaceScope, key: string): Promise<string | null> {
  const conversation = await getOrCreateAgentConversation({ projectId:scope.projectId, scope, worldGroupId:null, purpose:`short-author-draft:${key}`, title:'短篇编辑草稿' })
  const rows = await readAgentEvents(conversation.id!, scope)
  return rows.length ? rows[rows.length-1].content : null
}
export async function saveShortAuthorDraft(scope: WorkspaceScope, key: string, content: string) {
  const conversation = await getOrCreateAgentConversation({ projectId:scope.projectId, scope, worldGroupId:null, purpose:`short-author-draft:${key}`, title:'短篇编辑草稿' })
  await appendAgentEvent({projectId:scope.projectId,scope,conversationId:conversation.id!,kind:'message',role:'user',content})
}
