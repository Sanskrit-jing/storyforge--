export const AVG_PAGES = [
  ["library", "作品库", "作品库"],
  ["source", "世界引擎", "世界引擎"],
  ["vision", "故事与体验", "S2 · 产品定向"],
  ["routes", "路线与结局目标", "S2 · 产品定向"],
  ["agent", "方案会谈", "S2 · 产品定向"],
  ["confirm", "确认制作方案", "S2 · 产品定向"],
  ["production", "制作流程", "S3 · 产品执行"],
  ["narrative", "叙事图与对白", "S3 · 产品执行"],
  ["variables", "变量与结局", "S3 · 产品执行"],
  ["visual", "背景与立绘", "S3 · 产品执行"],
  ["audio", "音频与演出", "S3 · 产品执行"],
  ["media-all", "素材管理", "S3 · 产品执行"],
  ["review", "检查与试玩", "S3 · 产品执行"],
  ["release", "发布与版本", "S3 · 产品执行"],
  ["play", "玩家舞台", "游玩"],
  ["history", "存档与路线", "游玩"],
] as const;

/** Product operations are primary; authoring pages belong to the workbench. */
export const AVG_PRIMARY_NAV = [
  ['library', '作品库', 'library'],
  ['source', '世界引擎', 'source'],
  ['workbench', '制作台', 'vision'],
  ['release', '发布与版本', 'release'],
  ['player', '游玩', 'play'],
] as const;
export const AVG_WORKBENCH_GROUPS = [
  { label: 'S2 · 产品定向', pages: AVG_PAGES.filter(page => page[2] === 'S2 · 产品定向') },
  { label: 'S3 · 产品执行', pages: AVG_PAGES.filter(page => page[2] === 'S3 · 产品执行' && page[0] !== 'release') },
];
export const AVG_PLAYER_PAGES = AVG_PAGES.filter(page => page[2] === '游玩');
export function avgPrimaryForPage(pageId: string): string {
  if (AVG_WORKBENCH_GROUPS.some(group => group.pages.some(page => page[0] === pageId))) return 'workbench';
  if (AVG_PLAYER_PAGES.some(page => page[0] === pageId)) return 'player';
  return pageId;
}
