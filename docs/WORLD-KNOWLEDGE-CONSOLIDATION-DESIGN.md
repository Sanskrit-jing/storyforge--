# WORLD-1 / Phase 35-b 世界知识归并设计

> 状态：已交付（2026-07-25）  
> 前置：Codex 世界隔离、Phase 37-a、Phase 34 已完成  
> 本阶段不包含：Phase 35-c 导入 AI 分类、`ENH-WORLDMAP-2`

## 一、现状裁决

当前不是“词条系统尚未实现”，而是新旧入口并存：

- 自然/人文面板已经嵌入 18 类 Codex，并保留旧自由文本；
- `factions`、`itemSystems` 已在 v29 无损并入 `codexEntries`；
- 历史同时存在 `Worldview.historyLine/worldEvents`、`histories`、
  `historicalTimelineEvents` 和 `humEra/humEvent`，属于真实重复；
- 政治、经济、文化仍挤在 `politicsEconomyCulture` 一个字段和 `humSociety` 一类；
- `city` 词条的地理位置仍是普通文本，没有关联唯一的 `importantLocations`；
- 地理旧面板虽已不可达，但 `ImportantLocation` 与城池词条尚未建立生命周期关系。

本阶段不删除任何旧文本，也不把自由文本自动猜成实体。目标是明确每类信息的唯一主入口，
并用显式 FK 连接仍需协作的实体。

## 二、唯一归属矩阵

| 信息 | 唯一主入口 / 表 | 旧数据处理 |
|---|---|---|
| 自然、历史、人文宏观概述 | `worldviews` 的对应概述字段 | 原文保留 |
| 矿物、草药、异兽、种族、势力、城池、器物 | `codexEntries` | 旧自由文本折叠为“兼容资料”，不自动拆词条 |
| 政治 / 经济 / 文化概述 | `politicsOverview/economyOverview/cultureOverview` | `politicsEconomyCulture` 原文折叠保留，不自动拆分 |
| 政治制度 / 经济制度 / 文化制度实体 | 新内置类 `humPolitics/humEconomy/humCulture` | `humSociety` 作为旧版兼容分类，不自动重分类 |
| 历史总述 / 纪年 | `histories` | v43 只在目标为空时逐字复制旧 `historyLine/worldEvents` |
| 历史事件 / 关键词 | `historicalTimelineEvents/historicalKeywords` | `humEra/humEvent` 作为旧版兼容词条，不自动改写事件 |
| 地点层级、空间位置 | `importantLocations` | 旧 Geography 数据不自动猜测合并 |
| 城池人文属性 | `codexEntries(city)` | 用 `importantLocationId` 显式链接地点 |
| 器物定义 | `codexEntries(artifact)` | 与物品流水的实例状态继续分层 |
| 角色实际持有/消耗 | `itemLedger` | 不用器物词条的“当前持有者”文本冒充实时账本 |

## 三、数据契约

### 3.1 Worldview 拆分概述

新增三个非索引可选字段：

```ts
politicsOverview?: string
economyOverview?: string
cultureOverview?: string
```

`politicsEconomyCulture` 保留为 legacy 字段。程序不做语义拆分；作者可参考旧原文分别整理。

### 3.2 Codex 分类

新增三个稳定内置 key：

- `humPolitics`
- `humEconomy`
- `humCulture`

旧 `humSociety` 保留、继续可查看和编辑，但只出现在“旧版兼容资料”区，不再作为新建制度
实体的默认分类。

### 3.3 城池与地点显式关联

`CodexEntry` 新增非索引软 FK：

```ts
importantLocationId?: number | null
```

只在 `city` 类 UI 展示。选择器只能列当前项目的 `importantLocations`。删除地点树时，
所有指向树内节点的城池词条在同一事务置空；词条本身和人文资料不删除。导出导入使用
`importantLocations` 的便携 ID 重映射，不复用原数据库数字。

## 四、历史归并

- 人文面板只保留一个“历史”入口卡，明确跳转到正式“历史年表”。
- `histories.overview/eraSystem` 是历史总述与纪年的主来源。
- `historicalTimelineEvents/historicalKeywords` 是结构化历史事件和时代细节的主来源。
- `buildHistoricalContext()` 同时读取上述三者并按当前世界严格隔离。
- `formatWorldviewBlock()` 不再把新项目的历史内容重复注入；仅当正式历史表完全为空时，
  才回退读取旧 `historyLine/worldEvents`。
- v43 升级只做确定性桥接：同项目同世界没有 `histories` 行或其 overview 为空时，逐字
  搬入旧文本；已有正式历史内容绝不覆盖。源字段保留，便于人工复核与回滚。

## 五、AI 与写回边界

- 新增字段和三类 Codex 继续走 `FIELD_REGISTRY + adopt()`。
- 城池地点只能由作者选择或受 FK 校验的结构化采纳写入；AI 不得直接写数据库数字。
- 正文生成读取 `worldview + historical + codex + locations` 时，每种信息只有一份主语义；
  旧资料只作主来源为空时的兼容回退。
- Phase 35-c 才处理外部导入文本的 AI 分类，本阶段不扩张导入写回。

## 六、生命周期与兼容

- 项目、世界、词条、地点和导出导入继续由 `PROJECT_TABLES` 派生。
- 地点删除递归收集子树后，先清城池软 FK，再删地点；新增引用方必须进入派生事务。
- 老备份没有新字段时保持 `undefined/null`；新备份完整重映射。
- `humSociety/humEra/humEvent` 和所有旧 Worldview 字段均不删除、不清空。
- 迁移失败必须回滚 v43，不允许半搬历史总述。

## 七、验收

1. v42 → v43：空目标逐字桥接，已有正式历史不覆盖，多世界不串；
2. 政治/经济/文化三个概述和三类词条独立保存、刷新恢复、AI 上下文不重复；
3. 城池可链接地点；删父地点会清其全部子树引用；项目隔离、导出导入重映射正确；
4. 人文历史入口只指向正式历史年表，旧资料仍可展开查看；
5. 相关组件测试、Dexie 生命周期、全表往返、全量 Vitest、真实浏览器、构建与架构门禁通过。
