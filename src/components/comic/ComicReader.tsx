import {useState} from 'react'
import type {ComicTargetSpecV1} from '../../lib/types'
import type {ComicPageGroup} from './studio-model'
import {renderComicPageSvgV1} from '../../lib/comic/renderers'
export default function ComicReader({groups,spec,assetUrls}:{groups:ComicPageGroup[];spec:ComicTargetSpecV1;assetUrls:Record<string,string>}) {
 const [index,setIndex]=useState(0);const i=Math.min(index,Math.max(0,groups.length-1)),g=groups[i]
 if(!g)return <section className="cp-planning"><h3>尚无可阅读页面</h3><p>在漫画脚本中确认分页，并在页格与排版中建立分镜后，这里会出现真实页面。</p></section>
 let svg='',error='';try{svg=renderComicPageSvgV1({page:g.page,panels:g.panels,targetSpec:spec,assetDataUrls:assetUrls,mode:'storyboard'})}catch(c){error=String(c)}
 return <section className="cp-reader"><header><span>当前草稿 · {spec.readingDirection==='rtl'?'从右到左':'从左到右'} · 第 {i+1} / {groups.length} 页</span><div><button disabled={i===0} onClick={()=>setIndex(i-1)}>上一页</button><button disabled={i===groups.length-1} onClick={()=>setIndex(i+1)}>下一页</button></div></header>{error?<p role="alert">{error}</p>:<div className="cp-reading-page" dangerouslySetInnerHTML={{__html:svg}}/>}</section>
}
