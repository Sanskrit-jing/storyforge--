import { appendAgentEvent, getOrCreateAgentConversation, readAgentEvents } from '../agent/conversations'
import { coordinatePendingEditV1 } from '../authoring/pending-edit-coordinator'
import type { WorkspaceScope } from '../types'

export async function readMotionAuthorDraft(scope: WorkspaceScope, key: string): Promise<string | null> {
  const conversation = await getOrCreateAgentConversation({ projectId: scope.projectId, scope, worldGroupId: null, purpose: `motion-author-draft:${key}`, title: '漫剧素材编辑草稿' })
  const rows = await readAgentEvents(conversation.id!, scope)
  return rows[rows.length-1]?.content ?? null
}
export function saveMotionAuthorDraft(scope: WorkspaceScope, key: string, content: string) {
  return coordinatePendingEditV1({ key: `motion:${scope.projectId}:${scope.workId}:${key}`, persist: async () => {
    const conversation = await getOrCreateAgentConversation({ projectId: scope.projectId, scope, worldGroupId: null, purpose: `motion-author-draft:${key}`, title: '漫剧素材编辑草稿' })
    await appendAgentEvent({ projectId: scope.projectId, scope, conversationId: conversation.id!, kind: 'message', role: 'user', content })
  } })
}
