import { ASSET_KEYS, EPISODE_KEYS, SCENE_KEYS, SERIES_KEYS, SHOT_KEYS } from './contracts'
import type { MotionDramaStudioSnapshotV1 } from './service'
import type { MotionDramaPromptStageV1 } from '../types'

const pick=(row:object,keys:readonly string[])=>Object.fromEntries(keys.map(key=>[key,structuredClone((row as Record<string,unknown>)[key])]))
const empty=(keys:readonly string[])=>Object.fromEntries(keys.map(key=>[key,'']))
/** Editable candidate shapes share the exact closed contracts used by adoption. */
export function motionStageDraft(studio:MotionDramaStudioSnapshotV1,stage:MotionDramaPromptStageV1,sourceKeys:string[]):unknown{
 const n=studio.production.currentEpisodeNumber
 const episode=studio.episodes.find(row=>row.episodeNumber===n)
 const scenes=studio.scenes.filter(row=>row.episodeNumber===n)
 const shots=studio.shots.filter(row=>row.episodeNumber===n)
 if(stage==='series-bible')return studio.seriesBibleRecord?.bible??{...empty(SERIES_KEYS),version:1,worldRules:[''],relationshipArcs:[],hookPatterns:[''],visualLanguage:[''],soundLanguage:[''],continuityRules:[''],productionConstraints:[]}
 if(stage==='asset-bible')return studio.assets.length?studio.assets.map(row=>pick(row,ASSET_KEYS)):[{...empty(ASSET_KEYS),stableKey:'character.1',kind:'character',palette:[],materials:[],continuityLocks:[''],prohibitedChanges:[],sourceUnitKeys:sourceKeys.slice(0,1)}]
 if(stage==='episode-outline')return episode?pick(episode,EPISODE_KEYS):{...empty(EPISODE_KEYS),stableKey:`episode.${n}`,episodeNumber:n,beats:[{stableKey:`episode.${n}.beat.1`,order:0,function:'hook',visibleAction:'',conflict:'',turn:'',targetSeconds:10,sourceUnitKeys:sourceKeys.slice(0,1)}],continuityIn:[],continuityOut:[],sourceUnitKeys:sourceKeys.slice(0,1)}
 if(stage==='episode-script')return scenes.length?scenes.map(row=>pick(row,SCENE_KEYS)):[{...empty(SCENE_KEYS),stableKey:`episode.${n}.scene.1`,episodeNumber:n,sceneNumber:1,order:0,dialogue:[{speakerKey:'',text:'',delivery:'',estimatedSeconds:3}],soundCues:[],estimatedSeconds:30,characterKeys:[],sourceUnitKeys:sourceKeys.slice(0,1)}]
 if(stage==='shot-design')return shots.length?shots.map(row=>pick(row,SHOT_KEYS)):[{...empty(SHOT_KEYS),stableKey:`episode.${n}.shot.1`,episodeNumber:n,sceneKey:scenes[0]?.stableKey??'',shotNumber:1,order:0,targetSeconds:10,shotSize:'medium',cameraAngle:'eye-level',cameraMovement:'static',transitionIn:'cut',transitionOut:'cut',soundPlan:[],subjectKeys:[],sourceUnitKeys:sourceKeys.slice(0,1)}]
 if(stage==='image-prompts')return shots.map(row=>({shotKey:row.stableKey,expectedRevision:row.revision,imagePrompt:row.imagePrompt,negativeImagePrompt:row.negativeImagePrompt,firstFramePrompt:row.firstFramePrompt,keyFramePrompt:row.keyFramePrompt,lastFramePrompt:row.lastFramePrompt}))
 if(stage==='video-prompts')return shots.map(row=>({shotKey:row.stableKey,expectedRevision:row.revision,videoPrompt:row.videoPrompt,negativeVideoPrompt:row.negativeVideoPrompt}))
 return []
}
