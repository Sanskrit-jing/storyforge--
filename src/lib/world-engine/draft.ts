import { db } from '../db/schema'
import { resolveScopeLike, scopeTransactionTables } from '../workspace/scope'
import type { WorkspaceScope } from '../types'
import { isShareableWorld } from './world-identity'

/** World identity metadata belongs to the World root, never its narrative Work. */
export async function updateWorldDraftMetadata(scope:WorkspaceScope, input:{name:string;description:string}, expectedUpdatedAt:number):Promise<void> {
  const name=input.name.trim()
  if (!name || name.length>200 || input.description.length>20000) throw new Error('世界名称需为 1～200 字，简介不得超过 20,000 字')
  await db.transaction('rw',scopeTransactionTables(),async()=>{
    await resolveScopeLike(scope)
    const world=await db.worlds.get(scope.worldId)
    if (!world || !isShareableWorld(world)) throw new Error('请选择可编辑的世界草稿')
    if (world.updatedAt!==expectedUpdatedAt) throw new Error('世界信息已变化，请重新打开后修改')
    await db.worlds.update(world.id!,{name,description:input.description.trim(),updatedAt:Math.max(Date.now(),world.updatedAt+1)})
  })
}
