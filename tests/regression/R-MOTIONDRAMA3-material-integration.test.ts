import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {createWorkspace} from '../../src/lib/workspace/create-workspace'
import {createAdaptation,listActiveSourceUnits} from '../../src/lib/adaptation/source-manifest'
import {db} from '../../src/lib/db/schema'
import type {MotionDramaPromptStageV1,MotionDramaTargetSpecV1,WorkspaceScope} from '../../src/lib/types'
import {adoptMotionDramaCandidateV1,loadMotionDramaStudioV1,removeMotionMaterialSubject} from '../../src/lib/motion-drama/service'
import {adoptMotionDramaProfessionalCandidateV1,generateMotionDramaCandidateV1,readPendingMotionDramaCandidateV1} from '../../src/lib/motion-drama/durable-production'
import {compileMotionDramaPromptPackV1} from '../../src/lib/motion-drama/prompt-pack'
import {inspectMotionDramaQualityV1} from '../../src/lib/motion-drama/quality'
import {publishMotionDramaReleaseV1} from '../../src/lib/motion-drama/release'
import * as eventStore from '../../src/lib/agent/run/event-store'
import {readMotionAuthorDraft,saveMotionAuthorDraft} from '../../src/lib/motion-drama/author-drafts'
import {flushPendingEditsV1} from '../../src/lib/authoring/pending-edit-coordinator'
const targetSpec: MotionDramaTargetSpecV1 = {
  format: 'motion-drama', language: 'zh-CN', episodeCount: 12, targetSecondsPerEpisode: 20,
  aspectRatio: '9:16', narrativeMode: 'animated-comic', audience: '成年悬疑观众', rating: 'PG-13',
  dialogueDensity: 'balanced', artDirection: '雨夜霓虹、冷暖对撞、电影化条漫动效',
  providerTargets: ['seedance', 'runway', 'ltx'],
}

const seriesBible = {
  version: 1 as const,
  titlePromise: '每一张被撕掉的车票，都能改写一个人的告别。',
  logline: '能听见遗憾回声的检票员必须在末班车消失前，决定是否改写妹妹的死亡。',
  coreTheme: '接受失去不是背叛记忆。', emotionalPromise: '悬疑推进中的克制治愈。',
  audiencePromise: '每集解开一张车票背后的遗憾，同时逼近主角自己的真相。',
  storyEngine: '一张异常车票触发一段可见回声；主角帮助陌生人选择，也付出记忆被抹去的代价。',
  worldRules: ['回声只在末班车进站前出现。', '改写一次选择会抹去主角一段私人记忆。'],
  seasonArc: '从利用能力逃避妹妹之死，到放弃最后一次改写并真正告别。',
  protagonistArc: '林岚从控制一切走向承认有些失去无法修正。',
  relationshipArcs: ['林岚与妹妹的误解通过车票回声逐层反转。'],
  episodeArchitecture: '3 秒异常冷开场，12 秒追逼与选择，5 秒代价显现并留下尾钩。',
  hookPatterns: ['物件异常', '身份反转', '倒计时中断'],
  visualLanguage: ['冷蓝现实与琥珀回声分层', '近景微表演承担心理转折'],
  soundLanguage: ['检票钳声作为能力触发音', '列车低频承担倒计时'],
  continuityRules: ['林岚左眉旧伤固定。', '银色检票钳始终在右手。'],
  productionConstraints: ['单镜头不超过 10 秒。', '避免复杂群像和画面内文字。'],
}

async function fixture() {
  const source = await createWorkspace({
    name: '末班车回声', genres: ['suspense'], status: 'drafting',
    description: '检票员林岚能从废弃车票中听见未完成的告别。', targetWordCount: 8_000, enableMultiWorld: false,
  }, { kind: 'novel', novelProfile: 'short' })
  const chapter = await db.chapters.where('projectId').equals(source.scope.projectId).filter(row => row.workId === source.scope.workId).first()
  await db.chapters.update(chapter!.id!, {
    content: '<p>午夜前，检票员林岚在封闭站台捡到一张写着妹妹名字的旧车票。检票钳自行合拢，隧道里传来三年前那句没有说完的告别。</p>',
    summary: '林岚拾到妹妹的旧车票，能力被迫启动。', updatedAt: Date.now(),
  })
  const created = await createAdaptation({
    sourceScope: source.scope, sourceWorkId: source.scope.workId, title: '末班车回声·漫剧',
    sourceSelection: { mode: 'entire-work' }, medium: 'motion-drama', targetSpec,
  })
  const unit = (await listActiveSourceUnits(created.adaptation.id!)).find(row => row.sourceKind === 'chapter')!
  return { ...created, source, unit, sourceChapter: chapter! }
}

async function adopt(scope: WorkspaceScope, stage: MotionDramaPromptStageV1, payload: unknown) {
  const snapshot = await loadMotionDramaStudioV1(scope)
  await adoptMotionDramaCandidateV1({
    scope, stage, payload, episodeNumber: 1,
    expectedAdaptationRevision: snapshot.adaptation.revision,
    expectedProductionRevision: snapshot.production.revision,
  })
}

function assetBible(sourceUnitKey: string) {
  return [{
    stableKey: 'character.linlan', kind: 'character', label: '林岚', identity: '28 岁夜班检票员，左眉有旧伤。',
    appearance: '黑色短发，疲惫但警觉的眼神，克制的微表情。', palette: ['炭黑', '冷蓝'], materials: ['哑光皮肤', '湿呢料'],
    continuityLocks: ['左眉旧伤', '黑色短发', '右手持银色检票钳'], prohibitedChanges: ['改变年龄', '交换持钳手'],
    basePrompt: '林岚，28 岁东亚女性检票员，黑色短发，左眉旧伤，克制神情，电影化二维漫剧角色设定。',
    negativePrompt: '身份漂移，左右翻转，额外肢体，画面文字，水印。',
    referenceBrief: '正面、左右侧面、全身比例、六种克制表情与右手持钳动作。', sourceUnitKeys: [sourceUnitKey],
  }, {
    stableKey: 'voice.linlan', kind: 'voice', label: '林岚音色', identity: '低沉克制的成年女声，职业性冷静下藏着疲惫。',
    appearance: '中低音区，气息轻，咬字清楚。', palette: [], materials: [], continuityLocks: ['普通语速', '情绪不外放'], prohibitedChanges: ['夸张哭腔', '卡通幼态'],
    basePrompt: '28 岁女性，中低音区，轻气声，普通话，克制而警觉。', negativePrompt: '播音腔，过度表演，机械音，背景噪声。',
    referenceBrief: '同一段中性、怀疑、恐惧三种强度的干声试听。', sourceUnitKeys: [sourceUnitKey],
  }, {
    stableKey: 'voice.announcer', kind: 'voice', label: '站内广播音色', identity: '遥远、失真的中性广播声。',
    appearance: '窄频、长混响。', palette: [], materials: [], continuityLocks: ['距离感固定'], prohibitedChanges: ['贴耳近讲'],
    basePrompt: '废弃地铁站的中性广播声。', negativePrompt: '播音棚干声。',
    referenceBrief: '两句站内广播试听；未出场时不得绑定给角色对白。', sourceUnitKeys: [sourceUnitKey],
  }, {
    stableKey: 'sound.ticket-punch', kind: 'sound', label: '检票钳触发音', identity: '清脆金属咔哒后拖出极轻的低频回声。',
    appearance: '短促近场金属瞬态与远处隧道低频。', palette: [], materials: ['金属', '隧道混响'], continuityLocks: ['每次能力触发使用相同音色'], prohibitedChanges: ['喜剧卡通音效'],
    basePrompt: '近场老式金属检票钳咔哒，尾部连接幽深地铁隧道低频回声。', negativePrompt: '爆音，白噪，音乐旋律，卡通音效。',
    referenceBrief: '无对白、无音乐、峰值不过载的 2 秒干净试听。', sourceUnitKeys: [sourceUnitKey],
  }]
}

function episode(sourceUnitKey: string) {
  return {
    stableKey: 'episode.1', episodeNumber: 1, title: '妹妹的车票',
    logline: '林岚在末班车到站前听见死去妹妹的回声。',
    synopsis: '车票唤醒回声；林岚试图追问真相，却发现列车正在驶向早已封闭的站台。',
    openingHook: '检票钳在无人触碰时咔哒合拢。',
    beats: [
      { stableKey: 'episode.1.beat.1', order: 0, function: 'hook', visibleAction: '检票钳自行咬穿旧车票。', conflict: '林岚想丢掉车票，妹妹的声音却从隧道传来。', turn: '车票浮出妹妹姓名。', targetSeconds: 10, sourceUnitKeys: [sourceUnitKey] },
      { stableKey: 'episode.1.beat.2', order: 1, function: 'cliffhanger', visibleAction: '熄灭三年的站台灯依次亮向隧道。', conflict: '末班车倒计时只剩十秒。', turn: '封闭轨道传来列车灯。', targetSeconds: 10, sourceUnitKeys: [sourceUnitKey] },
    ],
    endHook: '列车窗内坐着三年前的妹妹。', continuityIn: [], continuityOut: ['林岚保留旧车票。', '神秘列车已经进站。'], sourceUnitKeys: [sourceUnitKey],
  }
}

function script(sourceUnitKey: string) {
  return [{
    stableKey: 'episode.1.scene.1', episodeNumber: 1, sceneNumber: 1, order: 0,
    heading: '内景·封闭站台·午夜', location: '废弃地铁站台', timeOfDay: '午夜', dramaticPurpose: '用异常物件启动能力并抛出妹妹回归的钩子。',
    entryState: '站台黑暗，林岚独自巡检。', exitState: '神秘列车冲出隧道，妹妹出现在车窗内。',
    visibleAction: '检票钳自行合拢；灯带逐盏亮起；林岚抬头看向驶来的列车。',
    dialogue: [{ speakerKey: 'character.linlan', text: '这张票……不可能。', delivery: '压住颤抖，几乎是气声', estimatedSeconds: 3 }],
    narration: '', soundCues: [{ kind: 'sfx', cue: '清脆检票钳声后接列车低频', timing: '0s 起，10s 增强', subjectKey: null }],
    emotionalTurn: '职业性冷静被失而复得的恐惧击穿。', estimatedSeconds: 20,
    characterKeys: ['character.linlan'], sourceUnitKeys: [sourceUnitKey],
  }]
}

function shots(sourceUnitKey: string) {
  const base = {
    episodeNumber: 1, sceneKey: 'episode.1.scene.1', narrativeFunction: '用可见异常推动悬疑', targetSeconds: 10,
    cameraAngle: 'eye-level' as const, cameraMovement: 'dolly' as const, performance: '呼吸变浅，目光先落车票再抬向隧道。',
    lighting: '冷蓝顶灯与隧道琥珀逆光对撞。', transitionIn: 'cut', transitionOut: 'match-cut', narration: '',
    soundPlan: [{ kind: 'sfx' as const, cue: '检票钳咔哒声与列车低频', timing: '动作点同步', subjectKey: 'sound.ticket-punch' }],
    subjectKeys: ['character.linlan'], sourceUnitKeys: [sourceUnitKey], imagePrompt: '', negativeImagePrompt: '', firstFramePrompt: '', keyFramePrompt: '', lastFramePrompt: '', videoPrompt: '', negativeVideoPrompt: '',
  }
  return [
    { ...base, stableKey: 'episode.1.shot.1', shotNumber: 1, order: 0, shotSize: 'close-up' as const, composition: '手与车票占画面下三分之一，林岚虚焦在后景。', visibleAction: '银色检票钳自行合拢并咬穿旧车票。', dialogue: '林岚：这张票……不可能。' },
    { ...base, stableKey: 'episode.1.shot.2', shotNumber: 2, order: 1, shotSize: 'medium' as const, composition: '林岚位于左侧三分线，隧道光从右后方逼近。', visibleAction: '林岚抬头，站台灯依次亮起，列车窗里显出妹妹。', dialogue: '' },
  ]
}



async function ready() {
    const item = await fixture()
    await adopt(item.scope, 'series-bible', seriesBible)
    await adopt(item.scope, 'asset-bible', assetBible(item.unit.sourceUnitKey))
    await adopt(item.scope, 'episode-outline', episode(item.unit.sourceUnitKey))
    await adopt(item.scope, 'episode-script', script(item.unit.sourceUnitKey))
    await adopt(item.scope, 'shot-design', shots(item.unit.sourceUnitKey))
    let studio = await loadMotionDramaStudioV1(item.scope)
    await adopt(item.scope, 'image-prompts', studio.shots.map(shot => ({
      shotKey: shot.stableKey, expectedRevision: shot.revision,
      imagePrompt: `${shot.visibleAction}，${shot.composition}，冷蓝与琥珀电影光，二维精品漫剧定帧。`,
      negativeImagePrompt: '身份漂移，左右翻转，额外肢体，糊脸，画面文字，水印。',
      firstFramePrompt: `${shot.visibleAction}发生前的稳定起始姿态。`, keyFramePrompt: `${shot.visibleAction}的决定性动作峰值。`, lastFramePrompt: `${shot.visibleAction}完成后的明确停点。`,
    })))
    studio = await loadMotionDramaStudioV1(item.scope)
    await adopt(item.scope, 'video-prompts', studio.shots.map(shot => ({
      shotKey: shot.stableKey, expectedRevision: shot.revision,
      videoPrompt: `初始静止；${shot.visibleAction}；环境光作出响应；摄影机缓慢推进；动作落在明确停点。`,
      negativeVideoPrompt: '抽搐，融化，身份切换，穿模，瞬移，镜头乱摆，循环动作。',
    })))


    studio = await loadMotionDramaStudioV1(item.scope)
    const pack = await compileMotionDramaPromptPackV1({ scope: item.scope, episodeNumber: 1, provider: 'seedance', expectedProductionRevision: studio.production.revision })
    return {item, pack}
}

describe('MOTIONDRAMA3 material integration safety', () => {
  beforeEach(async () => { await db.delete(); await db.open() })
  afterEach(() => { vi.restoreAllMocks(); db.close() })
  it('invalidates old packs after a series revision and blocks delivery', async () => {
    const {item, pack} = await ready()
    const before = await inspectMotionDramaQualityV1({scope:item.scope, episodeNumber:1,providers:['seedance']})
    expect(before.ready).toBe(true)
    await adopt(item.scope,'series-bible',{...seriesBible,coreTheme:'AUDIT changed theme requiring downstream review'})
    const after = await inspectMotionDramaQualityV1({scope:item.scope,episodeNumber:1,providers:['seedance']})
    expect(after.ready).toBe(false)
    expect(await db.motionDramaPromptPacks.get(pack.id!)).toBeUndefined()
    const studio = await loadMotionDramaStudioV1(item.scope)
    await expect(publishMotionDramaReleaseV1({scope:item.scope,episodeNumbers:[1],providers:['seedance'],tier:'prompt-only',expectedProductionRevision:studio.production.revision})).rejects.toThrow('缺少 seedance')

  })
  it('invalidates packs while keeping explicit incremental material updates', async () => {
    const {item, pack} = await ready()
    const changed = assetBible(item.unit.sourceUnitKey).slice(0,1).map(row=>({...row,appearance:'AUDIT changed appearance',basePrompt:'AUDIT changed character design'}))
    await adopt(item.scope,'asset-bible',changed)
    const studio = await loadMotionDramaStudioV1(item.scope)
    expect(studio.assets.length).toBe(4)
    expect(await db.motionDramaPromptPacks.get(pack.id!)).toBeUndefined()
    expect((await inspectMotionDramaQualityV1({scope:item.scope,episodeNumber:1,providers:['seedance']})).ready).toBe(false)
  })
  it('exposes interrupted adoption and resumes the frozen author edits', async () => {
    const item = await fixture()
    const generated = await generateMotionDramaCandidateV1({scope:item.scope,stage:'series-bible',episodeNumber:1,runAI:async()=>JSON.stringify(seriesBible)})
    const original = eventStore.appendAgentRunEventV1
    const spy = vi.spyOn(eventStore,'appendAgentRunEventV1').mockImplementation(async input => {
      const result = await original(input)
      if(input.type === 'adoption.started') throw new Error('AUDIT simulated interruption after durable intent')
      return result
    })
    await expect(adoptMotionDramaProfessionalCandidateV1({scope:item.scope,runId:generated.snapshot.run.id,authorPayload:{...seriesBible,coreTheme:'作者手动修改'}})).rejects.toThrow('AUDIT simulated')
    spy.mockRestore()
    expect((await eventStore.readAgentRunV1(item.scope,generated.snapshot.run.id)).projection.state).toBe('running')
    expect(await readPendingMotionDramaCandidateV1(item.scope)).toMatchObject({resuming:true,authorPayload:{coreTheme:'作者手动修改'}})
    const recovered = await adoptMotionDramaProfessionalCandidateV1({scope:item.scope,runId:generated.snapshot.run.id})
    expect(recovered.snapshot.projection.state).toBe('completed')
    expect((await loadMotionDramaStudioV1(item.scope)).seriesBibleRecord?.bible.coreTheme).toBe('作者手动修改')
  })
 it('persists author edits in order and isolates drafts between works',async()=>{
  const first=await fixture();const second=await fixture()
  const writes=['first','second','last'].map(text=>saveMotionAuthorDraft(first.scope,'candidate:1',text))
  await Promise.all(writes);await flushPendingEditsV1()
  expect(await readMotionAuthorDraft(first.scope,'candidate:1')).toBe('last')
  expect(await readMotionAuthorDraft(second.scope,'candidate:1')).toBeNull()
 })

 it('refuses deletion of referenced material and removes unbound material without changing the source',async()=>{
  const {item}=await ready()
  const originalSource=await db.chapters.get(item.sourceChapter.id!)
  let studio=await loadMotionDramaStudioV1(item.scope)
  await expect(removeMotionMaterialSubject({scope:item.scope,subjectKey:'character.linlan',expectedRevision:studio.production.revision})).rejects.toThrow('仍被')
  await removeMotionMaterialSubject({scope:item.scope,subjectKey:'voice.announcer',expectedRevision:studio.production.revision})
  studio=await loadMotionDramaStudioV1(item.scope)
  expect(studio.assets.some(a=>a.stableKey==='voice.announcer')).toBe(false)
  expect(await db.chapters.get(item.sourceChapter.id!)).toMatchObject({content:originalSource!.content})
 })

})
