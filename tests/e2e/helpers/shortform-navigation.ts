import type { Page } from '@playwright/test'
const labels:Record<string,string>={premise:'故事前提',coreChange:'核心变化',dominantEmotion:'主导情绪',pointOfView:'叙事视角',tense:'叙事时态',audience:'目标读者',storyPromise:'阅读承诺',mustKeep:'必须保留（每行一项）',forbidden:'避免内容（每行一项）',targetWordCount:'目标字数',chapterCount:'章节数量',protagonist:'主人公',desire:'主人公的欲望',pressure:'开场压力',escalation:'逐次升级（每行一项）',irreversibleTurn:'不可逆转折',climaxChoice:'高潮选择',endingImage:'结尾画面',aftertaste:'余韵',thematicQuestion:'主题问题',title:'章节标题',purpose:'叙事目标',viewpoint:'本章视角',openingPressure:'开场压力',conflict:'本章冲突',turn:'本章转折',exitState:'离场状态',summary:'审校结论',strengths:'优点（每行一项）'}
export async function fillShortFields(page:Page,text:string){
  const data=JSON.parse(text)
  const fill=async(value:Record<string,unknown>,prefix='')=>{
    for(const [key,item] of Object.entries(value)){
      if(!labels[key])continue
      const locator=page.getByLabel(prefix+(prefix&&key==='targetWordCount'?'字数预算':labels[key]),{exact:true})
      if(key==='pointOfView'||key==='tense')await locator.selectOption(String(item))
      else await locator.fill(Array.isArray(item)?item.join('\n'):String(item))
    }
  }
  if(Array.isArray(data))for(const [index,item] of data.entries())await fill(item,`第${index+1}章 `)
  else await fill(data)
}
