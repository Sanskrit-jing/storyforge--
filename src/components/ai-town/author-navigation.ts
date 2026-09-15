export const TOWN_SETUP_PAGES = [['vision','结局与生活'],['residents','居民与地点'],['rhythm','日程与生活规则'],['media-plan','视听方案'],['confirm','确认制作方案']] as const;
export const TOWN_BUILD_PAGES = [['production','制作流程'],['characters','居民档案'],['schedule','日程与事件'],['media','小镇与设施'],['media-all','素材管理'],['review','检查与试玩']] as const;
export const TOWN_PLAY_PAGES = [['play','进入小镇'],['relationships','邻里与变化'],['history','小镇档案']] as const;
export const TOWN_PRIMARY = [['library','作品库','library'],['source','世界引擎','source'],['workbench','制作台','vision'],['release','发布与版本','release'],['player','游玩','play'],['community','社区与发行','community']] as const;
export const TOWN_PAGES = [['library','作品库'],['source','世界引擎'],...TOWN_SETUP_PAGES,['agent','方案会谈'],...TOWN_BUILD_PAGES,['release','发布与版本'],...TOWN_PLAY_PAGES,['community','社区与发行']] as const;
export const townPrimary=(page:string)=>TOWN_PLAY_PAGES.some(p=>p[0]===page)?'player':['library','source','release','community'].includes(page)?page:'workbench';
