/**
 * PHRASE-1 全局常用语（commonPhrases）· 作者的快捷语料便签。
 *
 * 作者手写的常用写作提示：每条 = 标题（title）+ 内容（content），例如
 * 标题「情感不足」、内容「这段内容缺乏情感，要怎么写：先给人物一个具体的
 * 身体反应，再让台词说反话…」。常用语不注入 AI 上下文，只在各创作输入场景
 * 由作者点击常用语图标打开弹层查找，点击条目填入当前输入框或一键复制。
 * 表生命周期登记在 PROJECT_TABLES：owner='global'，删项目/删世界不影响；
 * 增删改统一在设置页「常用语」卡片管理；备份走常用语页独立的 JSON 往返
 * （format: storyforge-common-phrases，见 lib/phrases/common-phrases.ts）。
 */

export interface CommonPhraseEntry {
  id?: number
  /** 标题：查找时的主要匹配词，列表主显示名（如「情感不足」） */
  title: string
  /** 内容：点击填入/复制的正文 */
  content: string
  createdAt: number
  updatedAt: number
}
