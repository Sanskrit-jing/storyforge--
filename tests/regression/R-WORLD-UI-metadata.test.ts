import {afterEach,beforeEach,expect,it} from 'vitest'
import {db} from '../../src/lib/db/schema'
import {createWorkspace} from '../../src/lib/workspace/create-workspace'
import {updateWorldDraftMetadata} from '../../src/lib/world-engine/draft'
import {createWorldRevision,publishWorldRevision} from '../../src/lib/world-engine/releases'
import {openWorldReleaseV1} from '../../src/lib/context-gateway/world-release-client'
import {WORLD_PAGES,worldModulePath} from '../../src/components/world-engine/navigation'
beforeEach(async()=>{await db.delete();await db.open()});afterEach(()=>db.close())
const create=(purpose:'world-engine'|'independent-work'='world-engine')=>createWorkspace({name:'世界原名',description:'原简介',genres:[],status:'drafting',targetWordCount:10000},{purpose,kind:'novel',novelProfile:'long'})
it('renames only world identity; keeps Work owner and immutable published identity',async()=>{
 const w=await create();const revision=await createWorldRevision({scope:w.scope,label:'原版本'});const release=await publishWorldRevision(revision.id!);const before=await db.worlds.get(w.scope.worldId)
 await updateWorldDraftMetadata(w.scope,{name:'新世界',description:'新简介'},before!.updatedAt)
 expect((await db.worlds.get(w.scope.worldId))?.name).toBe('新世界');expect((await db.works.get(w.scope.workId))?.title).toBe('世界原名');expect((await db.worlds.get(w.scope.worldId))?.code).toBe(w.world.code)
 const old=await openWorldReleaseV1({localReleaseRecordId:release.id!,expectedProjectId:w.scope.projectId});expect(old.description.identity.worldName).toBe('世界原名')
 await expect(updateWorldDraftMetadata(w.scope,{name:'陈旧覆盖',description:''},before!.updatedAt)).rejects.toThrow('已变化')
})
it('rejects mismatched scope, non-shareable world and invalid names without writes',async()=>{
 const a=await create(),b=await create(),c=await create('independent-work')
 await expect(updateWorldDraftMetadata({...a.scope,worldId:b.scope.worldId},{name:'错误',description:''},b.world.updatedAt)).rejects.toThrow()
 await expect(updateWorldDraftMetadata(c.scope,{name:'错误',description:''},c.world.updatedAt)).rejects.toThrow('世界草稿')
 await expect(updateWorldDraftMetadata(a.scope,{name:' ',description:''},a.world.updatedAt)).rejects.toThrow('名称')
 expect((await db.worlds.get(b.scope.worldId))?.name).toBe('世界原名')
})
it('routes full semantic content and preserves stable chapter/impact navigation',()=>{
 const ids=WORLD_PAGES.flatMap(page=>page.modules?.map(([id])=>id)??[])
 for(const id of ['world-rules','worldview-natural','worldview-humanity','characters','relations','story-design','story-arc','outline','detailed-outline','chapters-list','world-overview','fact-library','world-map'])expect(ids).toContain(id)
 expect(worldModulePath(7,'version-history')).toBe('/world/versions?project=7')
 expect(worldModulePath(7,'export')).toContain('/world/settings?project=7&module=data-management')
 expect(worldModulePath(7,'chapters-list',new URLSearchParams('chapter=19'))).toContain('chapter=19')
})
