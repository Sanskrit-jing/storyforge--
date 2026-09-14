export type Page = {id:string;label:string;kind:string;group:string;desc:string;cover:string[];fields?:string[];items?:string[];action?:string;stage?:string};
export type Product = {id:string;name:string;short:string;en:string;book:string;tagline:string;image:string;upper?:boolean;pages:Page[]};
const p=(id:string,label:string,kind:string,group:string,cover:string,desc:string,fields:string[]=[],items:string[]=[],action='保存修改'):Page=>({id,label,kind,group,desc,cover:cover.split(' ').filter(Boolean),fields,items,action});
const home:Product={id:'home',name:'首页',short:'首页',en:'YOUR CREATIVE SPACE',book:'雾港纪事',tagline:'让故事，在此生长。',image:'mist-harbor.webp',pages:[
p('today','今天','home','创作空间','G01','从一个念头，到一个完整的世界。'),
p('library','作品总览','library','创作空间','G02','故事的每一种形态，都在这里。'),
p('detail','作品详情','detail','创作空间','G03','潮水记得一切，也会带走一切。'),
p('cover','封面与装帧','cover','创作空间','G04','为你的故事，选一件合身的书衣。'),
p('worlds','我的世界','world','创作空间','G05','那些尚未被讲完的世界。'),
p('results','最近成果','library','创作空间','G06','已完成的故事，和它们新的旅程。'),
p('tasks','任务中心','tasks','全局工具','G07','每一份等待，都有清晰的去向。'),
p('search','搜索','search','全局工具','G08','找回一个人物、一段文字，或一个灵感。'),
p('settings','设置','settings','全局工具','Z01 Z02 Z03 Z04','让工具适应你的创作习惯。'),
p('data','数据与备份','backup','全局工具','Z05 Z08 Z09 Z10 Z11 Z12 Z14 Z15','为每一份创作，留下可以回来的路。'),
p('styles','视觉规范','styles','全局工具','','本次样式初版的配色、字体、形状与状态。')
]};
const world:Product={id:'world',name:'世界引擎',short:'世界引擎',en:'WORLD ENGINE',book:'雾海群岛',tagline:'让世界成为故事的土壤。',image:'mist-bg-harbor.webp',pages:[
p('worlds','我的世界','world','世界引擎','W01 W02','在一片雾海里，安放你的世界。'),
p('basics','规则与起源','form','内容组件','W03','世界如何诞生，又遵循怎样的秩序。',['世界名称|雾海群岛','世界类型|低魔 · 海洋文明|select','现实与幻想边界|潮汐遵循自然规律。唯有潮声可以携带过去的记忆。|area','起源与创世|大退潮之后，昔日的山峰成为岛屿。人们在灯塔之间重新连接航路。|area','不可违背的规则|记忆不会凭空出现；每一次聆听都有代价。|area','力量体系|听潮者 · 铜铃与记忆回声|select']),
p('nature','自然与地理','form','内容组件','W04','山海、气候与路径，构成世界的骨架。',['世界结构|群岛与深海','大陆与海域|北屿、雾港、白鹭海、沉钟湾|area','气候与季节|漫长雨季 / 温和的潮汐季|select','自然资源|海盐、铜矿、潮生草、灰鲸|area','空间与位面|现实海域与潮间记忆层|area']),
p('society','人文与社会','form','内容组件','W05','从日常生活中，读懂一个世界。',['主要文明|海港共同体','组织与势力|灯塔议会、航海公会、旧邮局|area','政治与制度|岛屿自治，航路共治|area','经济与贸易|海盐、信件与船票；以港币结算|area','文化与信仰|退潮祭、守灯人誓言、铜铃送别|area']),
p('characters','人物与关系','characters','内容组件','W06','每个人，都有尚未说出口的故事。'),
p('history','历史与事实','timeline','内容组件','W07','把传说放回时间里。'),
p('map','世界地图','map','内容组件','W04','远处的灯塔，连接着未竟的航路。'),
p('versions','版本与封存','versions','封存与出口','W08','确认这一刻的世界，让新的故事由此出发。'),
p('outlet','数据出口','source','封存与出口','W10','查看、选择并调整产品可以读取的世界内容。'),
p('sharing','分享与导入','import','封存与出口','W09','分享世界的语义，保留每个故事的独立归属。')
]};
const long:Product={id:'long',name:'长篇创作',short:'长篇',en:'LONGFORM FICTION',book:'雾港纪事',tagline:'在长久的叙述里，发现人物的命运。',image:'mist-harbor.webp',pages:[
p('library','我的长篇','library','作品','L01','每一部长篇，都从第一页开始。'),
p('overview','作品概况','form','分步骤创作','L02 L30','属于这部作品的方向与承诺。',['作品名称|雾港纪事','题材与类型|悬疑 / 海洋幻想|select','目标篇幅|300,000 字','作品简介|一个归乡的年轻人，在失去声音的海港寻找父亲留下的信。|area','创作承诺|以日常生活中的细节，讲述记忆、失去与和解。|area']),
p('inspiration','灵感与参考','inspiration','分步骤创作','L03 L04','从一个画面，长出故事的可能。'),
p('worldbuilding','世界与设定','form','分步骤创作','L05','小说自己的设定，可以在写作中慢慢生长。',['故事发生地|雾港与北屿','时代与技术|近代海港 / 电气与蒸汽并存|select','自然与人文|潮汐、港口、邮局、灯塔与夜航者|area','世界规则|退潮会带回被遗忘的信件。|area','背景历史|二十年前的沉船事件仍未结案。|area']),
p('story','故事设计','form','分步骤创作','L06 L08','先找到故事最想抵达的地方。',['主题|记忆与告别','核心矛盾|寻找真相，还是守住共同的秘密？|area','主角欲望|找到父亲最后一封信|area','阻力与代价|每接近真相一步，就失去一段自己的记忆。|area','创作规则|避免全知解释；让环境与动作承担信息。|area']),
p('characters','人物与关系','characters','分步骤创作','L07','先认识他们，再陪他们走进故事。'),
p('relations','关系网络','relations','分步骤创作','L07','关系变化，是情节的另一条河流。'),
p('outline','大纲与章纲','outline','分步骤创作','L09 L10','从故事的骨架，走向每一章的呼吸。'),
p('scenes','场景细纲','scenes','分步骤创作','L11','一个场景，一次无法撤回的改变。'),
p('editor','正文','editor','分步骤创作','L12 L13','第三章 · 海水退去以后'),
p('impact','改稿影响','review','写作辅助','L14','让一次修改，妥帖地抵达它影响的地方。'),
p('arcs','故事线','timeline','写作辅助','L15','主线与支线，在相遇的地方改变方向。'),
p('characterplot','角色驱动','form','写作辅助','L16','从人物的选择，推演故事的转折。',['当前方案|林舟的归乡|select','规划方式|中途重规划|select','起始状态|逃避父亲的失踪，拒绝与故人交谈。|area','目标状态|接受未完成的告别，选择继续守灯。|area','关键选择|是否将父亲的最后一封信交给邮局？|area']),
p('foreshadow','伏笔看板','board','写作辅助','L17','每一个细节，都可以在远处得到回应。'),
p('facts','事实与认知','ledger','写作辅助','L18','区别世界的事实，与人物知道的事情。'),
p('state','状态与物品','ledger','写作辅助','L19','记录正文已经发生的变化。'),
p('timeline','故事年表','timeline','写作辅助','L20','让时间成为可靠的叙事线索。'),
p('places','地点与地图','map','写作辅助','L21','让每一次抵达，都有清晰的位置。'),
p('growth','修炼进度','ledger','写作辅助','L22','核对人物的成长，保持前后有据。'),
p('verify','场景考证','form','写作辅助','L23','给正在发生的场景，多一份可信的细节。',['当前场景|林舟走进海港邮局，煤油灯还未熄灭。|area','时代背景|十九世纪末的沿海小城','地点|港口邮局','考证侧重|生活细节、物品与行动合理性|select']),
p('style','文风学习','style','写作辅助','L24','找到你自己的声音。'),
p('retrieval','资料与检索','ledger','写作辅助','L25','看看这一次创作，参考了哪些内容。'),
p('prompts','提示词与模板','prompts','写作辅助','L26','保留那些能帮你更好表达的提问方式。'),
p('replace','查找与替换','review','写作辅助','L27','先看清修改范围，再一次完成替换。'),
p('nodes','节点模式','nodes','创作模式','N01 N02 N03 N04 N05 N06','把创作的每一步，自由连接。'),
p('agent','Agent 对话','agent','创作模式','A01 A02 A03','说出目标，让协作从这里开始。'),
p('versions','版本与导出','versions','作品管理','L28 Z07','留下每一次重要修订。'),
p('derive','派生世界','source','作品管理','L29','从已确认的故事中，提取一个独立的世界。'),
p('import','文档导入','import','作品管理','Z06','把旧稿、参考与设定，安放到正确的位置。')
]};
const short:Product={id:'short',name:'短篇创作',short:'短篇',en:'SHORT FICTION',book:'春日来信',tagline:'有些话，只能在春天才敢说。',image:'mist-cg-home.webp',pages:[
p('library','我的短篇','library','作品','S01','短短一篇，也能容纳完整的余韵。'),
p('intent','创作意图','form','创作','S02','确定这篇故事，想留下怎样的感觉。',['作品名|春日来信','目标字数|8,000 字','期望章节|4 章|select','叙事视角|第三人称限知|select','阅读承诺|一个未寄出的秘密，和一次迟来的告别。|area','主题与余味|克制、明亮，带一点无法弥补的遗憾。|area','保留与避免|保留春日邮局；避免突然反转与说教。|area']),
p('story','故事设计','form','创作','S03','欲望、压力、转折，最终抵达那个结尾。',['主角与欲望|许知夏，希望在离开前寄出一封信。|area','持续压力|邮局将在月底关闭。|area','不可逆转折|她发现收信人正是每天来修钟的老人。|area','高潮与结尾|信终于送到，却不再需要被拆开。|area']),
p('chapters','章节卡','outline','创作','S04','把短篇的每一次转折，放在合适的位置。'),
p('editor','正文','editor','创作','S05','第二节 · 未寄出的信'),
p('review','全篇审校','review','审校与版本','S06','从开场到余味，完整读一遍。'),
p('versions','版本与导出','versions','审校与版本','S07','把故事固定在你满意的这一版。'),
p('derive','扩展与派生','source','审校与版本','S08','让这篇短篇，拥有继续生长的可能。')
]};
const script:Product={id:'script',name:'小说转剧本',short:'剧本',en:'SCREENPLAY ADAPTATION',book:'雾港纪事 · 剧本',tagline:'让文字成为可以被看见的行动。',image:'mist-bg-archive.webp',pages:[
p('library','我的剧本','library','作品','P01','从原作出发，让故事走向舞台与镜头。'),
p('source','原作与来源','adaptation','改编准备','P02 P03','把原作的核心，带进新的表达。'),
p('brief','改编目标','form','改编准备','P04','每一次取舍，都为新的观看体验服务。',['作品形式|电影长片|select','目标时长|110 分钟','受众|成年观众 / 悬疑剧情','保留内容|邮局、铜铃、父亲的信与归乡主题。|area','改编取舍|合并航海公会人物；以邮局作为主要空间。|area']),
p('structure','结构与节拍','outline','剧本制作','P05','每一次转折，都推动人物做出选择。'),
p('scenes','场次目录','scenes','剧本制作','P06','把故事组织成可以拍摄的场次。'),
p('editor','剧本编辑','script','剧本制作','P07','第 12 场 · 邮局里的陌生人'),
p('grounding','原作一致性','review','审校与交付','P08','保留原作的事实，也明确改编的选择。'),
p('review','戏剧性审校','review','审校与交付','P09','检查行动、对白与冲突的力量。'),
p('versions','版本与导出','versions','审校与交付','P10','Fountain、FDX 与打印排版。')
]};
const comic:Product={id:'comic',name:'小说转漫画',short:'漫画',en:'COMIC ADAPTATION',book:'雾港纪事 · 漫画',tagline:'把故事，留在翻页的一瞬间。',image:'mist-cg-truth.webp',pages:[
p('library','我的漫画','library','作品','C01','让文字成为画面，让翻页产生节奏。'),
p('source','原作与目标','adaptation','改编准备','C02','选择这次要画出来的故事。'),
p('script','漫画脚本','scenes','漫画制作','C03','在画面、动作与对白之间，安排阅读节奏。'),
p('layout','页格与排版','comic','漫画制作','C04 C05 C09','第三页 · 铜铃没有响'),
p('visual','视觉设定','characters','视觉与素材','C06','让人物在每一次出现时，都保持一致。'),
p('references','参考图与主体','media','视觉与素材','C07','用可靠的参考，确定每个视觉主体。'),
p('media','画面制作','media','视觉与素材','C08','选中一格，制作它需要的画面。'),
p('review','质量审查','review','审校与交付','C10','检查连续性、阅读顺序与文字。'),
p('preview','阅读预览','comic','审校与交付','C11','以读者的视角，翻开这一章。'),
p('versions','版本与导出','versions','审校与交付','C11','分镜稿与完成画面，分别留下版本。')
]};
const motion:Product={id:'motion',name:'漫剧工坊',short:'漫剧',en:'MOTION DRAMA STUDIO',book:'潮声未寄',tagline:'从一个念头，到每一个镜头。',image:'mist-bg-lighthouse.webp',pages:[
p('library','我的漫剧','library','作品','M01','为每一集，准备可以执行的镜头方案。'),
p('source','小说来源','adaptation','来源与设定','M02','一句话、已有小说，或一份尚未完成的灵感。'),
p('series','系列设定','form','来源与设定','M03','确定这个系列持久的叙事动力。',['系列名|潮声未寄','集数与时长|12 集 · 每集 90 秒','画幅|9:16 竖屏|select','叙事承诺|每一封信揭开一个秘密，每一次退潮改变一个人。|area','系列风格|克制的悬疑，温暖的人物关系，海港旧物的质感。|area']),
p('assets','物料设定','media','来源与设定','M04','人物、服装、场景、道具与声音，各有自己的版本。'),
p('beats','单集节拍','outline','单集制作','M05','开场钩子、升级、转折与尾钩。'),
p('script','单集剧本','script','单集制作','M06','第 03 集 · 不响的铜铃'),
p('shots','分镜与参考帧','shots','单集制作','M07','把画面与运动，变成清晰的镜头指令。'),
p('pack','工具适配包','pack','交付','M08 M09','将每个镜头，整理成外部视频工具可用的指令。'),
p('review','审查与发布','review','交付','M10','核对物料、连续性、权利和交付完整度。'),
p('versions','版本与导出','versions','交付','M10','交付前期制作包，继续下一次创作。')
]};
const configs:Record<string,{name:string;short:string;en:string;book:string;image:string;tagline:string;setup:Page[];content:Page[];play:Page[]}>= {
ttrpg:{name:'跑团',short:'跑团',en:'TABLETOP ROLEPLAY',book:'雾港失踪案',image:'mist-market.webp',tagline:'让想象，聚在同一张桌上。',setup:[
p('vision','战役愿景','setup','制作台 · S2','T02','你想邀请玩家经历怎样的一场冒险？',['战役名称|雾港失踪案','核心体验|悬疑调查与角色扮演|select','核心冲突|接连失踪的船员，与一封无人认领的信。|area','预计时长|3 场 · 每场 120 分钟','难度与氛围|适中 / 失败推进|select']),
p('rules','规则与村规','setup','制作台 · S2','T03','先约定这张桌上的规则。',['基础规则|StoryForge 2d6 叙事规则|select','判定方式|公开投骰|select','失败处理|推动故事，并付出明确代价。|area','自定义村规|重要线索不因单次失败永久丢失。|area']),
p('seats','主持与席位','seats','制作台 · S2','T04 T05','为每位参与者，留一个位置。'),
p('structure','剧情结构','setup','制作台 · S2','T06','让线索有去处，让选择有后果。',['剧情结构|三幕 · 开放探索|select','场景规模|8 个场景 / 3 个主要地点','线索冗余|每个关键结论至少 3 条线索','角色秘密|每位玩家 1 条私人线索|select','结局方向|真相公开 / 守住秘密 / 共同离港|area']),
p('boundaries','信息与共识','setup','制作台 · S2','T07 T08','把边界说清，才能放心进入故事。',['主持方式|AI 主持，关键后果由人确认|select','公开与私密|私人线索仅本人和主持人可见。|area','避免内容|过度血腥、强制角色控制。|area','地图与媒资|按场景生成地图、令牌与手册|select'])],content:[
p('scenes','战役与场景','scenes','制作台 · S3','T06 T09','从港口的第一场相遇开始。'),p('characters','角色卡与成长','characters','制作台 · S3','T05 T13','身份、目标、秘密，以及他愿意付出的代价。'),p('media','地图与手册','media','制作台 · S3','T08','把玩家需要看见的信息，放到桌上。')],play:[
p('play','跑团桌面','ttrpg','游玩','T10 T11 T12 T14','第二幕 · 潮声中的旧邮局'),p('room','在线房间','seats','游玩','T15','周五夜航 · 4 位玩家已就座'),p('inventory','物品与规则','ledger','游玩','T12 T13','查看角色物品、规则与行动记录。'),p('history','团局与续团','saves','游玩','T16 T17 T18','每一次冒险，都有自己的时间线。')]},
chat:{name:'角色聊天',short:'角色聊天',en:'CHARACTER CONVERSATIONS',book:'与顾晚汐的第七封信',image:'mist-bg-archive.webp',tagline:'每一次对话，都让彼此更近一些。',setup:[
p('vision','互动目标','setup','制作台 · S2','R02','你希望以怎样的身份，与他们相遇？',['互动作品|与顾晚汐的第七封信','用户身份|阔别多年后归乡的旧友','互动方式|单角色 · 场景叙事|select','初始情境|雨后的邮局，一封信正等待被认领。|area','体验目标|在日常交谈里，逐渐揭开过去的秘密。|area']),p('cast','角色与场景','setup','制作台 · S2','R03','决定谁会出现，以及故事从哪里开始。',['主要角色|顾晚汐|select','初始关系|熟悉而疏远的旧友','场景顺序|旧邮局 → 灯塔 → 离港码头|area','转场条件|双方确认最后一封信的去向。|area']),p('memory','记忆与边界','setup','制作台 · S2','R04','让每个人，只知道他们应该知道的事。',['可知范围|公开世界事实与双方已发生的对话|area','私人秘密|父亲的信暂不向用户公开。|area','关系变化|循序渐进，需要明确剧情依据。|area','长期记忆|由用户确认后保留|select'])],content:[p('characters','人物快照','characters','制作台 · S3','R03 R05','确认这一版本中，人物的样子。'),p('scenes','场景与对白','scenes','制作台 · S3','R05','给相遇留出自然发生的空间。'),p('media','人物与场景素材','media','制作台 · S3','R05','让场景陪伴对话，保持阅读的安静。')],play:[p('play','开始对话','chat','游玩','R06 R08','旧邮局 · 雨停之后'),p('memory-review','关系与记忆','review','游玩','R07','那些应该被记住的时刻。'),p('history','会话与分支','saves','游玩','R09','从熟悉的一句话，继续上次相遇。')]},
town:{name:'AI 小镇',short:'AI 小镇',en:'A TOWN AFTER THE ENDING',book:'潮汐镇的日常',image:'town-overview.png',tagline:'故事结束之后，生活才刚刚开始。',setup:[p('vision','结局与生活','setup','制作台 · S2','H02','大冒险结束之后，他们想怎样生活？',['小镇名称|潮汐镇','结局之后|灯塔重新亮起的第 30 天','玩家身份|归乡的造船学徒','居民规模|8 位居民|select','生活目标|修复旧码头，让离开的人有一个回来的地方。|area']),p('residents','居民与地点','setup','制作台 · S2','H03','为每个人安排一个可以被找到的地方。',['初始居民|顾晚汐、林舟、余澜与 5 位邻居','生活地点|盐铃广场、船坊、诊所、邮局|area','关系起点|旧友重逢，新的邻里关系仍在建立。|area','公共项目|重建北岸码头']),p('rhythm','日程与生活规则','setup','制作台 · S2','H04','安排生活的节奏，保留偶然相遇。',['时间节奏|每日六时段|select','资源与货币|港币、木材、食材与互助点','感情边界|允许缓慢发展的感情关系|select','离线推进|最多 3 天|select','重大变化|需要用户确认|select'])],content:[p('characters','居民档案','characters','制作台 · S3','H03 H05','他们会在自己的生活里继续成长。'),p('schedule','日程与事件','timeline','制作台 · S3','H04 H05','晨起、午后、晚灯，生活各有安排。'),p('media','小镇与设施','media','制作台 · S3','H05','让熟悉的地方，有可见的样子。')],play:[p('play','进入小镇','town','游玩','H06 H07 H08','第 12 天 · 午后，微风'),p('relationships','邻里与变化','relations','游玩','H09','关系在每一天的小事中生长。'),p('history','小镇档案','saves','游玩','H10','查看日报、公共建设与长期变化。')]},
avg:{name:'AVG',short:'AVG',en:'VISUAL NOVEL',book:'灯塔来信',image:'mist-cg-sea.webp',tagline:'在选择的尽头，总有一束为你而亮的光。',setup:[p('vision','故事与体验','setup','制作台 · S2','V02','你想让读者经历怎样的选择？',['作品名|灯塔来信','用户身份|回到故乡的年轻守灯人','体验类型|悬疑 / 多路线叙事|select','画幅|16:9 横屏|select','阅读目标|约 90 分钟 / 三条人物路线','演出目标|背景、立绘、关键 CG 与环境声|area']),p('routes','路线与结局目标','setup','制作台 · S2','V03 V04','让每一次选择，通向有意义的回应。',['主要路线|顾晚汐 / 余澜 / 林舟|area','核心变量|信任、记忆、守灯人承诺','结局方向|留下、远行、重逢|area','选项边界|选择体现态度，不诱导无依据的突发坏结局。|area'])],content:[p('narrative','叙事图与对白','nodes','制作台 · S3','V03','把对白、分支和结局连接起来。'),p('variables','变量与结局','ledger','制作台 · S3','V04','让分支条件可以被看见、理解和检查。'),p('visual','背景与立绘','media','制作台 · S3','V05','每一次出场，都有自己的情绪与光线。'),p('audio','音频与演出','shots','制作台 · S3','V06','让声音和画面，在恰好的时刻出现。')],play:[p('play','玩家舞台','avg','游玩','V08 V09','第三幕 · 灯火可亲'),p('history','存档与路线','saves','游玩','V10','在上一次的选择处，继续故事。')]},
adventure:{name:'文字冒险',short:'文字冒险',en:'TEXT ADVENTURE',book:'雾港来信',image:'mist-bg-bell.webp',tagline:'写下你的行动，走进未知的故事。',setup:[p('vision','冒险目标','setup','制作台 · S2','D02','先决定这场冒险的起点与终点。',['冒险名称|雾港来信','玩家身份|受邀来到雾港的信使','起始地点|北岸码头|select','核心目标|在最后一班船离港前，送出那封没有地址的信。|area','规模与时长|12 个地点 / 2 小时','玩法重点|探索、物品解谜与人物互动|select']),p('systems','玩法与资源边界','setup','制作台 · S2','D03 D04 D05','为可执行的行动，划定清晰边界。',['资源|体力、时间、港币','能力|观察、交涉、航海','交互方式|固定行动与自然语言意图|select','失败处理|提供代价与替代路径|select','任务约束|主线可暂缓，关键目标不永久丢失。|area'])],content:[p('map','地点与地图','map','制作台 · S3','D03','每条路，都通向一个可以发生故事的地方。'),p('actions','物品、能力与行动','ledger','制作台 · S3','D04','让“我想做什么”有可理解的执行方式。'),p('quests','任务与结局','outline','制作台 · S3','D05','给探索一个方向，也为绕路留下意义。')],play:[p('play','开始冒险','adventure','游玩','D07 D08 D09 D10','旧邮局 · 黄昏'),p('playmap','探索地图','map','游玩','D11','你已经走过的路，和仍未抵达的地方。'),p('history','冒险与存档','saves','游玩','D11','回到最后一次保存的选择。')]},
openworld:{name:'文字开放世界',short:'文字开放世界',en:'OPEN WORLD STORIES',book:'盐脊之旅',image:'mist-bg-market.webp',tagline:'沿着海岸走，世界会继续发生。',setup:[p('vision','体验与主角','setup','制作台 · S2','O02 O12 O13','先确定你想在这个世界里成为谁。',['作品名|盐脊之旅','主角身份|失去航图的年轻测绘员','近期目标|找到通往北屿的旧航路','长期目标|完成父亲未竟的海岸地图','游戏规模|6 个区域 / 24 个地点','玩法风格|探索与成长，适度战斗|select']),p('systems','玩法系统与边界','setup','制作台 · S2','O03 O04 O05 O11','选择这个世界需要运转的系统。',['开放系统|任务、回合战斗、装备、制作、交易、关系|area','世界时间|世界分钟 / 昼夜与天气|select','成长方式|三属性、等级、技能与装备|select','演化边界|地区事件持续推进，主线核心目标保持稳定。|area','失败与恢复|战前分支重试 / 复活点保留进度|select'])],content:[p('world','区域与地图','map','制作台 · S3','O03 O16','让远处的地名，成为可以抵达的坐标。'),p('quests','主线与任务','outline','制作台 · S3','O04 O18','主线、人物故事与地区机会，共同组成旅程。'),p('rules','角色与规则','ledger','制作台 · S3','O11 O13 O14 O20','把身份和成长，落实为一致的玩法。'),p('economy','物品、制作与交易','ledger','制作台 · S3','O15 O22','材料、装备与交易，在同一套经济里流动。'),p('actors','人物与地区演化','timeline','制作台 · S3','O05 O17 O21','人物有自己的日程，地区也有自己的变化。')],play:[p('play','进入世界','openworld','游玩','O07 O08 O09 O19','盐脊海岸 · 第 6 天，午后'),p('character','角色与背包','inventory','游玩','O13 O14 O15','你的成长，来自旅途中每一次选择。'),p('combat','战斗','combat','游玩','O20','北岸旧道 · 遭遇海雾潜行者'),p('relations','人物与关系','relations','游玩','O17 O21','你留下的行动，会成为别人记住你的方式。'),p('journal','任务与见闻','ledger','游玩','O18 O23','记录已知的世界，与尚未解开的谜。'),p('history','旅程与存档','saves','游玩','O10 O24','保存这一刻，继续下一段旅程。')]}
};
const upper=Object.entries(configs).map(([id,c]):Product=>({id,...c,upper:true,pages:[
p('library','作品库','library','作品库',({ttrpg:'T01',chat:'R01',town:'H01',avg:'V01',adventure:'D01',openworld:'O01'} as Record<string,string>)[id],c.tagline),
p('source','世界引擎','source','世界引擎 · S1','B02','选择世界，查看并调整本产品的数据出口。'),
...c.setup,p('agent','方案会谈','agent','制作台 · S2','B01 B03','与主 Agent 一起，把想法变成清晰的方案。'),
p('confirm','确认制作方案','confirm','制作台 · S2','B04','检查方向、来源与范围，准备开始制作。'),
p('production','制作流程','production','制作台 · S3','B05 B06','每一步如何进行，每一份内容如何产生，都在这里。'),
...c.content,p('review','检查与试玩','review','制作台 · S3','B08','在发布之前，完整走一遍作品。'),
p('media-all','素材管理','media','制作台 · S3','B07','查看本产品使用的素材与版本。'),
p('release','发布与版本','versions','制作台 · S3','B09 B10 B11 '+({ttrpg:'T09',chat:'R05',town:'H05',avg:'V07',adventure:'D06',openworld:'O06 O25'} as Record<string,string>)[id],'让这一版作品，成为可以开始的体验。'),
...c.play
]}));
const community:Product={id:'community',name:'社区与发行',short:'社区',en:'STORIES TO SHARE',book:'雾港失踪案',tagline:'让故事找到它的同路人。',image:'mist-market.webp',pages:[p('discover','发现作品','library','社区','E01 E02','找到下一场想要走进的故事。'),p('groups','组团中心','seats','社区','E03','有些故事，需要一起打开。'),p('submit','提交发行','form','创作者','E04','为你的作品，准备一张公开的名片。',['正式版本|雾港失踪案 v1.0|select','发行标题|雾港失踪案','简介|一座海港，三位失踪者，一封没有地址的信。|area','价格|免费','许可|署名 · 允许合规派生|select']),p('releases','我的发行','versions','创作者','E05','查看审核、版本和发行状态。'),p('moderation','审核与支持','review','管理','E06','每一次处理，都留下清晰的依据。')]};
export const products:Product[]=[home,world,long,short,script,comic,motion,...upper,community];
export const allPages=products.flatMap(product=>product.pages.map(page=>({product:product.id,...page})));
export const stages=['S1 世界封存','S2 产品定向','S3 产品执行'];
export const chapters=['序章　雾中来客','第一章　海雾与灯塔','第二章　失落的地图','第三章　海水退去以后','第四章　邮局的信','第五章　沉默的码头'];
export const prose=['林舟抵达邮局时，门上的铜铃没有响。那扇门比他记忆中矮了一些，或者只是潮水把街道抬高了。柜台后的女人仍在整理信件，手边搁着一杯已经凉透的茶。','她抬起头看了他一眼，像是早就知道他会来，却并不意外。林舟把湿漉漉的外套挂在门边的衣架上。空气里有淡淡的海盐味，混着纸张和木头的气息。邮局里很安静，只有墙上的钟在走，声音轻得几乎听不见。','“我来取一封信。”他说。','女人没有立刻回答，而是在一叠信件中翻找，动作缓慢而专注。过了好一会儿，她才抽出一个没有邮戳的信封，递到他面前：“这封，或许是你要找的。”','林舟接过信，指尖能感觉到纸面的微微潮意。信封很轻，里面似乎没有什么，却让他的手沉了一下。他看着那行熟悉的字，忽然忘了自己一路上准备好的问题。'];
export const people=[{name:'顾晚汐',role:'邮局管理员',image:'guwanxi-pose.png',desc:'守着一间旧邮局，也守着未曾寄出的秘密。',status:'主要角色'},{name:'林舟',role:'归乡的测绘员',image:'mist-actor-lin-neutral.webp',desc:'沿着潮汐的痕迹，寻找父亲留下的航路。',status:'主角'},{name:'余澜',role:'年轻的守灯人',image:'mist-actor-yu-neutral.webp',desc:'相信灯塔亮着，远航的人就能找到回家的方向。',status:'主要角色'}];
