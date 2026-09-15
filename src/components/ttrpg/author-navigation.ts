export const TTRPG_SETUP_PAGES = [
  ["instruction", "世界与指令"],
  ["vision", "战役愿景"],
  ["rules", "规则与村规"],
  ["seats", "主持与席位"],
  ["cards", "车卡策略"],
  ["structure", "剧情结构"],
  ["boundaries", "信息与共识"],
  ["media-plan", "媒资方案"],
  ["confirm", "确认制作方案"],
] as const;
export const TTRPG_BUILD_PAGES = [
  ["production", "制作流程"],
  ["scenes", "战役与场景"],
  ["characters", "角色卡"],
  ["media", "地图与手册"],
  ["media-all", "素材管理"],
  ["review", "检查与试玩"],
] as const;
export const TTRPG_PLAY_PAGES = [
  ["play", "跑团桌面"],
  ["inventory", "角色、物品与规则"],
  ["tabletop", "桌面与地图"],
  ["room", "在线房间"],
  ["history", "团局与续团"],
] as const;
export const TTRPG_PRIMARY = [
  ["library", "作品库", "library"],
  ["source", "世界引擎", "source"],
  ["workbench", "制作台", "vision"],
  ["release", "发布与版本", "release"],
  ["player", "游玩", "play"],
  ["community", "社区与发行", "community"],
] as const;
export const TTRPG_PAGES = [
  ["library", "作品库"],
  ["source", "世界引擎"],
  ...TTRPG_SETUP_PAGES,
  ["agent", "方案会谈"],
  ...TTRPG_BUILD_PAGES,
  ["release", "发布与版本"],
  ...TTRPG_PLAY_PAGES,
  ["community", "社区与发行"],
] as const;
export function ttrpgPrimary(page: string) {
  return TTRPG_PLAY_PAGES.some((p) => p[0] === page)
    ? "player"
    : ["library", "source", "release", "community"].includes(page)
      ? page
      : "workbench";
}
