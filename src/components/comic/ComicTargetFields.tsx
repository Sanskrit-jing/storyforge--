import type { ComicTargetSpecV1 } from '../../lib/types'
export default function ComicTargetFields({value:v,onChange}:{value:ComicTargetSpecV1;onChange:(value:ComicTargetSpecV1)=>void}) {
 const set=(patch:Partial<ComicTargetSpecV1>)=>onChange({...v,...patch})
 return <>
 <label>阅读方向<select value={v.readingDirection} onChange={e=>set({readingDirection:e.target.value as 'ltr'|'rtl'})}><option value="ltr">从左到右</option><option value="rtl">从右到左</option></select></label>
 <label>漫画章节数<input type="number" min={1} max={100} value={v.chapterCount} onChange={e=>set({chapterCount:Number(e.target.value)})}/></label>
 <label>每章页数<input type="number" min={1} max={100} value={v.targetPagesPerChapter} onChange={e=>set({targetPagesPerChapter:Number(e.target.value)})}/></label>
 <label>色彩模式<select value={v.colorMode} onChange={e=>set({colorMode:e.target.value as ComicTargetSpecV1['colorMode']})}><option value="color">彩色</option><option value="grayscale">灰阶</option><option value="monochrome">黑白</option></select></label>
 <label>目标读者<input value={v.audience} onChange={e=>set({audience:e.target.value})}/></label>
 <label>每格候选数<select value={v.renderCandidatesPerPanel} onChange={e=>set({renderCandidatesPerPanel:Number(e.target.value) as 2|3|4})}>{[2,3,4].map(n=><option key={n}>{n}</option>)}</select></label>
 <label className="cp-wide">画风要求<textarea value={v.artStyleBrief} onChange={e=>set({artStyleBrief:e.target.value})}/></label>
 {(['width','height','bleed'] as const).map((key,i)=><label key={key}>{['页面宽度','页面高度','出血'][i]}<input type="number" min={key==='bleed'?0:1} value={v.pageSize[key]} onChange={e=>set({pageSize:{...v.pageSize,[key]:Number(e.target.value)}})}/></label>)}
 <label>尺寸单位<select value={v.pageSize.unit} onChange={e=>set({pageSize:{...v.pageSize,unit:e.target.value as 'px'|'mm'}})}><option value="px">像素</option><option value="mm">毫米</option></select></label>
 </>
}
