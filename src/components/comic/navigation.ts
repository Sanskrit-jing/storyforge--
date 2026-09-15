export const COMIC_PAGES = [
  ['library', '作品库'], ['source', '原作与目标'], ['facts', '原作事实'], ['causal', '因果关系'], ['brief', '改编方案'], ['decisions', '删改决定'],
  ['script', '漫画脚本'], ['rhythm', '分页节奏'], ['layout', '页格分镜'], ['lettering', '对白与排字'],
  ['visual', '视觉设定'], ['references', '参考图与主体'], ['media', '格图与候选'], ['review', '质量审查'], ['preview', '阅读预览'], ['versions', '版本记录'], ['settings', '通用设置'],
] as const
export const COMIC_GROUPS: Array<{id:string;label:string;pages:string[]}> = [
  {id:'library',label:'作品库',pages:['library']},
  {id:'source',label:'原作与方案',pages:['source','facts','causal','brief','decisions']},
  {id:'script',label:'漫画脚本',pages:['script','rhythm']},
  {id:'layout',label:'页格与排版',pages:['layout','lettering']},
  {id:'visual',label:'视觉与素材',pages:['visual','references','media']},
  {id:'review',label:'审校与阅读',pages:['review','preview']},
  {id:'versions',label:'版本记录',pages:['versions']},
  {id:'settings',label:'通用设置',pages:['settings']},
]
export const comicPageDescription:Record<string,string>={
 source:'确认原作范围、阅读方向、篇幅与画风。漫画与源小说分别保存。',facts:'核对原作事实及其证据，明确哪些内容来自小说。',causal:'整理事实之间的原因、条件与人物动机。',brief:'确定主题、读者与改编边界。',decisions:'逐项记录保留、删去、合并、重排与新增的理由。',script:'以视觉动作、对白意图和情绪组织漫画节拍。',rhythm:'安排每页目标、格数、文字预算与翻页揭示。',layout:'编排页格、镜头、主体状态与阅读顺序。',lettering:'编辑对白、旁白、气泡与拟声，保留可编辑的文字层。',visual:'固定画风、人物、场景和道具的视觉特征。',references:'管理主体参考图、使用范围与来源。',media:'为具体页格制作、上传和挑选画面。',review:'检查叙事、阅读顺序、文字、连续性与媒资完整性。',preview:'按照作品的阅读方向查看真实页面。',versions:'查看分镜版和视觉成品版，按指定版本导出。',
}
