import {useEffect,useState} from 'react'
import type {AdaptationProject,AdaptationSourceUnit,ComicTargetSpecV1,WorkspaceScope} from '../../lib/types'
import {updateComicTargetSpecV1,readComicAuthorDraft,saveComicAuthorDraft} from '../../lib/comic/authoring'
import {queueCandidateDraftV1,flushCandidateDraftsV1} from '../../lib/agent/candidate-draft-coordinator'
import {registerPendingDraftFlusherV1,flushPendingEditsV1} from '../../lib/authoring/pending-edit-coordinator'
import ComicSource from './ComicSource'
import ComicTargetFields from './ComicTargetFields'
export default function ComicSourcePanel({scope,root,units,onChanged}:{scope:WorkspaceScope;root:AdaptationProject & {medium:'comic'};units:AdaptationSourceUnit[];onChanged:()=>Promise<void>}) {
 const [spec,setSpec]=useState<ComicTargetSpecV1>(root.targetSpec),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const key=`target:r${root.revision}`,prefix=`comic:${scope.workId}:`
 useEffect(()=>{let cancelled=false;void readComicAuthorDraft(scope,key).then(text=>{if(!cancelled)setSpec(text?JSON.parse(text):root.targetSpec)}).catch(c=>setError(String(c)));return()=>{cancelled=true}},[scope,key,root.targetSpec])
 useEffect(()=>registerPendingDraftFlusherV1(()=>flushCandidateDraftsV1(prefix)),[prefix])
 const change=(v:ComicTargetSpecV1)=>{setSpec(v);queueCandidateDraftV1({key:prefix+key,draft:JSON.stringify(v),persist:text=>saveComicAuthorDraft(scope,key,text),onError:c=>setError(c.message)})}
 return <><ComicSource scope={scope} root={root} units={units}/><section className="cp-planning"><h3>作品规格</h3><p>修改后需要重新确认改编方案和视觉设定，并重新审校受影响的页面。已有内容和发布版本保留。</p>{error&&<p role="alert">{error}</p>}<fieldset disabled={busy||root.status==='complete'}><div className="cp-fields"><ComicTargetFields value={spec} onChange={change}/></div><button className="primary" onClick={()=>void(async()=>{setBusy(true);setError('');try{await flushPendingEditsV1();await updateComicTargetSpecV1({scope,expectedRevision:root.revision,targetSpec:spec});await onChanged()}catch(c){setError(String(c))}finally{setBusy(false)}})()}>保存制作规格</button></fieldset></section></>
}
