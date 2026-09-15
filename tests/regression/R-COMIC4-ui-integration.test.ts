import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import ComicFields from '../../src/components/comic/ComicFields'
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {db} from '../../src/lib/db/schema'
import {createWorkspace} from '../../src/lib/workspace/create-workspace'
import {createAdaptation,listActiveSourceUnits} from '../../src/lib/adaptation/source-manifest'
import {defaultComicTargetSpec,readComicAuthorDraft,saveComicAuthorDraft,updateComicTargetSpecV1} from '../../src/lib/comic/authoring'
import {claimComicImageRequestV1} from '../../src/lib/comic/image-request-guard'
import {generateComicProfessionalCandidateV1,adoptComicProfessionalCandidateV1,readPendingComicProfessionalCandidateV1} from '../../src/lib/comic/durable-production'
import {assertComicLetteringV1} from '../../src/lib/comic/contracts'
import {renderComicPageSvgV1} from '../../src/lib/comic/renderers'
const targetSpec={...defaultComicTargetSpec(),targetPagesPerChapter:1}
async function fixture() {
  const source = await createWorkspace({ name: '漫画专业来源', genres: ['other'], status: 'drafting', description: '暴雨旧站', targetWordCount: 10_000, enableMultiWorld: false }, { kind: 'novel', novelProfile: 'short' })
  const chapter = await db.chapters.where('projectId').equals(source.scope.projectId).filter(row => row.workId === source.scope.workId).first(); await db.chapters.update(chapter!.id!, { content: '<p>暴雨中，林岚走进旧车站。停摆的时钟在黎明前重新走动，她决定留下。</p>', summary: '旧站抉择', updatedAt: Date.now() })
  const created = await createAdaptation({ sourceScope: source.scope, sourceWorkId: source.scope.workId, title: '旧站页漫', sourceSelection: { mode: 'entire-work' }, medium: 'comic', targetSpec })
  const unit = (await listActiveSourceUnits(created.adaptation.id!)).find(row => row.sourceKind === 'chapter')!
  return { ...created, source, unit }
}

describe('COMIC-4 漫画真实页面保存、重入和未知请求保护',()=>{
 beforeEach(async()=>{await db.delete();await db.open()});afterEach(()=>db.close())
 it('采纳已开始后仍展示恢复入口，保留作者修改且不重复写正式内容',async()=>{
  const item=await fixture()
  const payload=[{stableKey:'fact_a',kind:'event',statement:'候选到站。',subjectKeys:[],sourceUnitKeys:[item.unit.sourceUnitKey],confidence:1}]
  const generated=await generateComicProfessionalCandidateV1({scope:item.scope,adaptationProjectId:item.adaptation.id!,stage:'source-analysis',sourceUnitKeys:[item.unit.sourceUnitKey],runAI:async()=>JSON.stringify(payload)})
  await expect(adoptComicProfessionalCandidateV1({scope:item.scope,runId:generated.snapshot.run.id,authorPayload:[{...payload[0],kind:'event',statement:'作者确认的到站内容。'}],onDurableBoundary:b=>{if(b==='adoption.started')throw new Error('interrupted')}})).rejects.toThrow('interrupted')
  const pending=await readPendingComicProfessionalCandidateV1(item.scope)
  expect(pending?.recovering).toBe(true)
  expect(pending?.authorPayload).toMatchObject([{statement:'作者确认的到站内容。'}])
  await adoptComicProfessionalCandidateV1({scope:item.scope,runId:generated.snapshot.run.id})
  expect((await db.adaptationSourceFacts.toArray()).map(f=>f.statement)).toEqual(['作者确认的到站内容。'])
  expect(await readPendingComicProfessionalCandidateV1(item.scope)).toBeNull()
 })
 it('编辑稿按作品隔离，规格 CAS 拒绝旧修改并使下游重新确认',async()=>{
  const a=await fixture(),b=await fixture()
  await saveComicAuthorDraft(a.scope,'test','作者草稿')
  expect(await readComicAuthorDraft(a.scope,'test')).toBe('作者草稿')
  expect(await readComicAuthorDraft(b.scope,'test')).toBeNull()
  await expect(saveComicAuthorDraft({...a.scope,workId:b.scope.workId},'test','跨作品')).rejects.toThrow()
  await updateComicTargetSpecV1({scope:a.scope,expectedRevision:a.adaptation.revision,targetSpec:{...targetSpec,readingDirection:'rtl'}})
  await expect(updateComicTargetSpecV1({scope:a.scope,expectedRevision:a.adaptation.revision,targetSpec})).rejects.toThrow('变化')
  const root=await db.adaptationProjects.get(a.adaptation.id!)
  expect(root?.targetSpec).toMatchObject({readingDirection:'rtl'})
  expect(root?.planSourceManifestVersion).toBeNull()
 })
 it('同一图片请求并发和刷新后都只允许一次提交，显式新请求可执行',async()=>{
  const a=await fixture(),hash='a'.repeat(64)
  const results=await Promise.allSettled([claimComicImageRequestV1(a.scope,hash),claimComicImageRequestV1(a.scope,hash)])
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  db.close();await db.open()
  await expect(claimComicImageRequestV1(a.scope,hash)).rejects.toThrow('不会自动重发')
  await claimComicImageRequestV1(a.scope,'b'.repeat(64))
  expect(await db.agentEvents.count()).toBe(2)
 })
})

it('可接受的长竖排文本不会被渲染器静默截断',()=>{
 const lettering:any={id:'caption-audit',kind:'caption',text:'甲'.repeat(200)+'尾',frame:{x:.05,y:.05,width:.9,height:.9},direction:'vertical',fontFamily:'storyforge-serif',fontSize:6,textColor:'#111111',fillColor:'#ffffff',strokeColor:'#111111',strokeWidth:1,tail:null,zIndex:1};
 expect(()=>assertComicLetteringV1([lettering])).not.toThrow();
 const panel:any={stableKey:'panel_audit',order:0,frame:{x:0,y:0,width:1,height:1},shot:{size:'wide',angle:'eye-level',movement:'static',composition:''},moment:'空镜',action:'空镜',lettering:[lettering],imageTransform:{fit:'cover',offsetX:0,offsetY:0,scale:1,rotation:0},selectedMediaAssetKey:null};
 const svg=renderComicPageSvgV1({page:{stableKey:'page_audit'} as any,panels:[panel],targetSpec:{readingDirection:'ltr',colorMode:'color',pageSize:{width:1200,height:1700,unit:'px',bleed:0}} as any,assetDataUrls:{},mode:'storyboard'});
 expect((svg.match(/>甲<\/text>/g)??[]).length).toBe(200);expect(svg).toContain('>尾</text>');
});


it('候选中的同名 kind 字段分别使用事实、视觉主体与排字契约',()=>{
 const render=(value:unknown)=>renderToStaticMarkup(createElement(ComicFields,{value,onChange:()=>{}}))
 const fact=render({kind:'event',statement:'到站'})
 const subject=render({kind:'character',design:{description:'旅人'}})
 const lettering=render({kind:'speech',fontFamily:'storyforge-serif',text:'你好'})
 expect(fact).toContain('value="event"');expect(fact).not.toContain('value="speech"')
 expect(subject).toContain('value="prop"');expect(subject).not.toContain('value="event"')
 expect(lettering).toContain('value="caption"');expect(lettering).not.toContain('value="character"')
})
