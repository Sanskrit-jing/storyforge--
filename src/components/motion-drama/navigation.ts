export const MOTION_PAGES = [
  ['library', '作品库'], ['source', '小说来源'], ['series', '系列设定'], ['episodes', '分集规划'],
  ['assets', '物料库'], ['beats', '单集节拍'], ['script', '单集剧本'], ['shots', '分镜'],
  ['frames', '参考帧'], ['image', '画面提示词'], ['video', '运动提示词'],
  ['pack', '工具适配包'], ['review', '质量审查'], ['versions', '版本与交付'], ['prompts', '提示词设置'], ['settings', '通用设置'],
] as const
export const MOTION_CONTENT_GROUPS = [
  {id:'library',label:'作品库',pages:['library']}, {id:'source',label:'小说来源',pages:['source']},
  {id:'series',label:'系列设定',pages:['series','episodes']}, {id:'assets',label:'物料库',pages:['assets']},
  {id:'beats',label:'单集内容',pages:['beats','script','shots','frames','image','video']},
  {id:'pack',label:'工具适配包',pages:['pack']}, {id:'review',label:'质量审查',pages:['review']},
  {id:'versions',label:'版本与交付',pages:['versions']}, {id:'settings',label:'通用设置',pages:['settings','prompts']},
]
export const MOTION_GROUPS = [
  {id:'library',label:'作品库',pages:['library']},
  {id:'source',label:'漫剧制作台',pages:['source','series','episodes','assets','beats','script','shots','frames','image','video','review']},
  {id:'versions',label:'版本与交付',pages:['pack','versions']},
  {id:'settings',label:'通用设置',pages:['settings','prompts']},
]
export const motionDescription: Record<string,string> = {
 source:'从一句话、本地小说或导入正文开始，明确原著范围与冻结版本。',
 series:'确认主题、人物弧线、整季叙事动力和视觉声音语言。', episodes:'逐集维护开场、转折、尾钩与承接状态，不一次生成整季。',
 assets:'画风、角色、服装、场景、道具、音色与声音，按版本准备参考素材。',
 beats:'确定本集开场、冲突、节拍、转折与尾钩。',script:'编写场景、动作、对白、旁白、声音与时长。',
 shots:'安排镜头职责、构图、表演、转场和时长。',frames:'为每个镜头选择起始帧、关键帧和结束帧。',
 image:'编辑画面、首帧、关键帧、尾帧及负向约束。',video:'编辑动作起点、变化、摄影机运动、结束状态及负向约束。',
 pack:'逐镜整理 Seedance 输入槽位、参考素材和可复制提示词；后续在外部工具生成视频。',
 review:'检查完整性、连续性、物料权利与目标工具约束。',versions:'保存并导出提示词和参考素材包，交付止于外部视频生成之前。',
 prompts:'维护八个专业岗位的默认提示词、单集覆盖和编辑历史。',
}
