export const CHAT_PAGES = [
    ['library', '作品库', '作品库'], ['source', '世界引擎', '世界引擎'],
    ['vision', '互动目标', 'S2 · 产品定向'], ['cast', '角色与场景', 'S2 · 产品定向'], ['memory', '记忆与边界', 'S2 · 产品定向'], ['agent', '方案会谈', 'S2 · 产品定向'], ['confirm', '确认制作方案', 'S2 · 产品定向'],
    ['production', '制作流程', 'S3 · 产品执行'], ['characters', '人物快照', 'S3 · 产品执行'], ['scenes', '场景与规则', 'S3 · 产品执行'], ['media', '人物与场景素材', 'S3 · 产品执行'], ['review', '检查与试玩', 'S3 · 产品执行'], ['release', '发布与版本', 'S3 · 产品执行'],
    ['play', '开始对话', '游玩'], ['memory-review', '关系与记忆', '游玩'], ['history', '会话与分支', '游玩']
] as const;
export const CHAT_PRIMARY = [['library', '作品库', 'library'], ['source', '世界引擎', 'source'], ['workbench', '制作台', 'vision'], ['release', '发布与版本', 'release'], ['player', '游玩', 'play']] as const;
export const chatPrimary = (id: string) => id === 'source' || id === 'library' || id === 'release' ? id : ['play', 'memory-review', 'history'].includes(id) ? 'player' : 'workbench';
