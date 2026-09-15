import { useState } from 'react'
import type { AdaptationProject, AdaptationSourceUnit, WorkspaceScope } from '../../lib/types'
import { readAdaptationSourceContent } from '../../lib/adaptation/source-manifest'
export default function ComicSource({scope,root,units}:{scope:WorkspaceScope;root:AdaptationProject;units:AdaptationSourceUnit[]}){
 const [selected,setSelected]=useState(''),[content,setContent]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const read=async(key:string)=>{setSelected(key);setBusy(true);setError('');setContent('');try{const result=await readAdaptationSourceContent({targetScope:scope,adaptationProjectId:root.id!,manifestVersion:root.activeSourceManifestVersion,sourceUnitKeys:[key]});setContent(result.units.map(u=>u.content).join('\n\n'))}catch(c){setError(String(c))}finally{setBusy(false)}}
 return <section className="cp-source"><h3>本次改编的原作范围</h3><p>固定来源 v{root.activeSourceManifestVersion} · {units.length} 个单元。原小说与漫画分别保存。</p><div className="cp-source-layout"><nav aria-label="原作来源单元">{units.map(unit=><button className={selected===unit.sourceUnitKey?'active':''} disabled={busy} key={unit.sourceUnitKey} onClick={()=>void read(unit.sourceUnitKey)}>{unit.label}<small>{unit.wordCount} 字</small></button>)}</nav><article>{error&&<p role="alert">{error}</p>}{busy?'读取原文…':content?<pre>{content}</pre>:<p>选择左侧来源，查看原文证据。原作已变化时，请先核对更新提示。</p>}</article></div></section>
}
