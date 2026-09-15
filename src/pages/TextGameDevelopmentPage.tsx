import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { liveQuery } from 'dexie'
import ProductFrame from '../components/navigation/ProductFrame'
import { db } from '../lib/db/schema'
import { useWorldGroupStore } from '../stores/world-group'
import { TEXT_GAME_PRODUCT_KINDS_V1, type TextGameProductKindV1, type Project, type WorkspaceScope, type ProductProductionHandoffV1 } from '../lib/types'
import { parseProductProductionHandoffV1 } from '../lib/product-production/handoff'
import { currentExperimentalProductOptInV1, currentProductCatalogChannelV1, evaluateProductEntryV1 } from '../lib/product/product-catalog'
import { currentAiGmBetaGatePassedV1, currentProductPlatformEnvironmentV1, evaluateProductPlatformCapabilityV1 } from '../lib/product-platform/capability-status'
import { updateWorkspace } from '../lib/workspace/works'
const AdventureGamePlayer = lazy(() => import('../components/text-game/AdventureGamePlayer'))
const AvgGamePlayer = lazy(() => import('../components/text-game/AvgGamePlayer'))
const TextOpenWorldPlayer = lazy(() => import('../components/text-game/TextOpenWorldPlayer'))
const ProductProductionStudio = lazy(() => import('../components/product/ProductProductionStudio'))

/** Temporary access to existing engines while these two products are developed separately. */
export default function TextGameDevelopmentPage({openWorld=false}:{openWorld?:boolean}) {
  const routeProduct = openWorld ? 'text-open-world' : 'text-adventure'
  const [product, setProduct] = useState<TextGameProductKindV1>(routeProduct)
  const allowedProducts = useMemo(()=>TEXT_GAME_PRODUCT_KINDS_V1.filter(kind => evaluateProductEntryV1({productId:kind==='avg'?'upper.avg':kind==='text-open-world'?'upper.text-open-world':'upper.text-adventure',channel:currentProductCatalogChannelV1(),experimentalOptIn:currentExperimentalProductOptInV1()}).enterable),[])
  const base = openWorld ? 'openworld' : 'adventure', title = openWorld ? '文字开放世界' : '文字冒险'
  const [params, setParams] = useSearchParams(), navigate = useNavigate()
  const [projects,setProjects]=useState<Project[]>([]), [error,setError]=useState('')
  const [mode,setMode]=useState<'play'|'production'>(()=>params.has('worldHandoff')?'production':'play')
  const [session,setSession]=useState<number|null>(Number(params.get('session'))||null)
  const [handoff,setHandoff]=useState<ProductProductionHandoffV1|null>(null)
  const activeWorldGroupId=useWorldGroupStore(state=>state.activeGroupId)
  useEffect(()=>{const sub=liveQuery(()=>db.projects.toArray()).subscribe({next:setProjects,error:e=>setError(String(e))});return()=>sub.unsubscribe()},[])
  const project=projects.find(p=>p.id===Number(params.get('project')))
  const projectId=project?.id, workId=Number(params.get('work'))||project?.activeWorkId, worldId=project?.activeWorldId
  const scope=useMemo<WorkspaceScope|undefined>(()=>projectId!=null&&workId!=null&&worldId!=null?{projectId,worldId,workId}:undefined,[projectId,worldId,workId])
  const decision=evaluateProductEntryV1({productId:openWorld?'upper.text-open-world':'upper.text-adventure',channel:currentProductCatalogChannelV1(),experimentalOptIn:currentExperimentalProductOptInV1()})
  const encoded=params.get('worldHandoff')
  useEffect(()=>{let active=true;setHandoff(null);if(encoded)void(async()=>{const parsed=parseProductProductionHandoffV1(JSON.parse(encoded));if(parsed.productType!==routeProduct)throw new Error('交接产品不匹配');const release=await db.worldReleases.get(parsed.worldReleaseId);if(!release||release.contentHash!==parsed.worldContentHash)throw new Error('交接世界版本不存在或已变化');if(active){setHandoff(parsed);setMode('production');setParams(current=>{if(current.has('project'))return current;const next=new URLSearchParams(current);next.set('project',String(release.projectId));return next},{replace:true})}})().catch(e=>{if(active)setError(String(e))});return()=>{active=false}},[encoded,routeProduct,setParams])
  const productionDecision=evaluateProductPlatformCapabilityV1('product-production-v3',{environment:currentProductPlatformEnvironmentV1(),experimentalProject:false,authorOptIn:project?.productPlatformOptIns?.productProductionV3===true,onlineServiceConfigured:false,aiGmBetaGatePassed:currentAiGmBetaGatePassedV1()})
  return <ProductFrame product={base} title={title} page="开发体验" navigation={[{label:'页面预览',path:`/${base}/library`},{label:'开发体验',path:`/${base}/runtime?${params}`,active:true},{label:'通用设置',path:'/home/settings'}]}>
    <section className="lf-paper"><h3>尚在开发完善中，目前非正式功能</h3><p>{decision.entry.maturityNote}</p>{!decision.enterable?<p>当前环境未开放开发体验。</p>:<><label>选择开发工作区<select aria-label="开发工作区" value={projectId??''} onChange={e=>{setSession(null);navigate(`/${base}/runtime?project=${e.target.value}`)}}><option value="">请选择</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><nav className="lf-subtabs" aria-label="开发体验模式"><button aria-current={mode==='play'?'page':undefined} onClick={()=>setMode('play')}>玩家</button><button aria-current={mode==='production'?'page':undefined} onClick={()=>setMode('production')}>制作</button></nav></>}</section>
    {error&&<p role="alert">{error}</p>}{decision.enterable&&scope&&project&&!error&&<section className="lf-paper"><Suspense fallback={<p>正在读取…</p>}>{mode==='production'?productionDecision.enabled?<ProductProductionStudio scope={scope} worldGroupId={project.enableMultiWorld?activeWorldGroupId:null} allowedProducts={allowedProducts} initialProduct={product} onProductSelected={next=>{if(TEXT_GAME_PRODUCT_KINDS_V1.includes(next as TextGameProductKindV1))setProduct(next as TextGameProductKindV1)}} initialSource={handoff} onPublished={()=>{setSession(null);setMode('play')}} onPreviewStarted={(_,id)=>{setSession(id);setMode('play')}}/>:<div><h3>自动游戏制作需要项目授权</h3><p>{productionDecision.blockers.join('；')}</p><button className="lf-action" onClick={()=>void updateWorkspace(project.id!,{productPlatformOptIns:{...project.productPlatformOptIns,productProductionV3:true}}).catch(e=>setError(String(e)))}>为当前项目显式启用</button></div>:product==='avg'?<AvgGamePlayer key={`${scope.workId}:${session}`} project={project} scope={scope} worldGroupId={project.enableMultiWorld?activeWorldGroupId:null} initialSessionId={session}/>:product==='text-open-world'?<TextOpenWorldPlayer key={`${scope.workId}:${session}`} project={project} scope={scope} worldGroupId={project.enableMultiWorld?activeWorldGroupId:null} initialSessionId={session}/>:<AdventureGamePlayer key={`${scope.workId}:${session}`} project={project} scope={scope} worldGroupId={project.enableMultiWorld?activeWorldGroupId:null} initialSessionId={session}/>}</Suspense></section>}
  </ProductFrame>
}
