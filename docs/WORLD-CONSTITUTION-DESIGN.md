# CONSISTENCY-3 · 世界宪法与设定互斥实施设计

> 状态：2026-07-25 已按冻结边界交付。归属 `CANON-1`，依赖
> `CONSISTENCY-0/2`。目标是把作者确认的关键设定断言变成可追溯 Canon，并在确认新断言
> 之前确定性拦出“同一主体、同一主题、不同值”的互斥。

## 1. 复用裁决：不新建第二张 Canon 表

历史路线草案写过“断言库新表”，但当前代码审计证明 `temporalFacts` 已完整表达：

- `candidate` Observation → 作者确认 → `confirmed` Canon；
- `sourceType:'setting'`、`sourceRecordTable/sourceRecordId/sourceQuote`；
- 受控谓词、世界作用域、主体分类型 FK、导出导入、项目/世界/角色/章节生命周期；
- 事实库候选确认、异常复核与 `currentFacts` 回报通道。

再建一张表会产生两个 Canon 来源、两套确认状态机和两套导出/生命周期。因此
CONSISTENCY-3 复用 `temporalFacts`，新增的是**宪法主题策略与设定来源完整性**，不是平行账本。

## 2. 受控宪法主题

在 `FACT_PREDICATE_REGISTRY` 的谓词上增加 `constitution: true` 标记。首版只登记可以精准
比较、且能覆盖现有反例的单值主题：

| predicate | 主体 | 含义 | 首版来源 |
|---|---|---|---|
| `magicSource` | worldGroup | 超自然力量的根本来源 | worldviews.worldOrigin/powerHierarchy、powerSystems.description/rules |
| `creationOrigin` | worldGroup | 世界如何形成 | worldviews.worldOrigin |
| `deityAuthority` | worldGroup | 神明权柄/对力量的支配规则 | worldviews.worldOrigin/divineDesign/powerHierarchy |
| `technologyLevel` | worldGroup | 世界技术基线 | worldviews.worldOrigin/worldStructure/politicsEconomyCulture |
| `powerCeiling` | worldGroup | 可达到的最高力量层级 | worldviews.powerHierarchy、powerSystems.levels/rules |
| `parentStatus` | character | 角色父母/监护人的存亡与存在状态 | storyCores.logline/concept/mainPlot、characters.background/relationships |
| `characterOrigin` | character | 角色身世来源 | storyCores.logline/concept/mainPlot、characters.background/identity |
| `trueIdentity` | character | 角色真实身份 | storyCores.concept/mainPlot、characters.background/identity |

这些主题均为 `state + single + temporal:false + conflictPolicy:'manual'`。未登记主题不能进入
宪法硬判决；多值、自然语言同义和复杂条件规则仍属于软审计，不伪装成硬保证。

## 3. 设定来源必须可移植、可失效

现有多态 `sourceRecordId` 不能单独承担来源 FK：导出导入后原数据库 ID 会失效，而且注册表
无法知道它应映射到哪张表。为 `TemporalFact` 增加显式可选来源引用：

```ts
sourceWorldviewId?: number | null
sourcePowerSystemId?: number | null
sourceStoryCoreId?: number | null
sourceCharacterId?: number | null
sourceField?: string
sourceFingerprint?: string
```

- 四类 FK 进入 `PROJECT_TABLES.exportRemap`，往返后指向新项目记录。
- `sourceField` 必须来自 `CANON_ASSERTION_SOURCE_REGISTRY` 的白名单，不允许模型自造路径。
- `sourceFingerprint` 对提取时的字段全文做规范化哈希；来源字段保存后不一致则将断言标
  `stale`，确认前重新提取。
- 角色合并同时重映射 `sourceCharacterId`；角色删除、来源记录/FK 丢失进入
  `source-missing`，不再作为宪法注入。
- 旧 `sourceRecordTable/sourceRecordId` 保持兼容，不作为新宪法断言的权威 FK。

本阶段不新增表、不改索引，因此不需要把 Dexie schema 从 v39 人为抬到 v40；新增字段由
现有 JSON 导出原样携带，显式 FK 由注册表重映射测试锁定。

## 4. 软抽取、硬冲突与确认闸门

### 4.1 软抽取

`buildSettingAssertionExtractPrompt()` 只提供：

- 当前项目内已登记的主题闭集；
- 当前世界/角色闭集；
- 带稳定 `sourceKey` 的字段原文闭集。

模型输出 `{subjectId, predicate, value, sourceKey, quote}`。解析器逐项验证：

1. predicate 在宪法主题注册表；
2. subject 类型、ID、项目和世界归属正确；
3. sourceKey 在本次提供的来源闭集；
4. quote 是该来源字段逐字引文；
5. 写入永远是 `candidate`，模型不能输出 confirmed。

### 4.2 硬冲突

`checkSettingAssertionClashes(candidate, confirmed)` 只比较：

```text
同 project + 同 world + 同分类型主体 + 同 constitution predicate
+ 规范化 value 不相等
= hard clash
```

值规范化只做 Unicode、空白、标点和受控枚举归一，不做语义猜测。“月亮潮汐”与
“血脉觉醒”必定不同；“月亮 潮汐”与“月亮潮汐”视为同值。

`confirmFactCandidate()` 对 constitution 候选先跑硬冲突：

- 无冲突：确认并锁定为世界宪法；
- 有冲突：保持 candidate，返回冲突列表，由作者选择否决、修改或明确取代旧断言；
- 不静默 supersede，不允许两个互斥 confirmed 单值宪法并存。

硬检测只保证已结构化且已确认的主题；抽取遗漏的散文仍可能漏。

## 5. 读取、写回与用户出口

- 新增 `canonAssertions` `CONTEXT_SOURCES`，无需 chapterId，按项目/世界读取 confirmed +
  非 stale 的宪法断言；正文和设定生成共用。
- 事实库增加“世界宪法”视图：查看候选/已确认/异常，显示来源字段与逐字证据；运行设定
  抽取；确认前显示硬冲突。
- 世界来源、力量体系、故事核心和角色生成把 `canonAssertions` 加入正式
  `assembleContext()`；不再用面板内截断字符串冒充唯一上游约束。
- 首版 finding 仍为 advisory/确认阻断，不自动改写作者设定。

`PowerSystemPanel` 与 `worldviews.powerHierarchy` 的产品迁移不在本阶段静默执行。先让两者
都成为可追溯来源并能互相报冲突；双入口合并归后续 WORLD-1 数据迁移，避免本阶段擅自
删除用户可能仍在使用的旧数据。

## 6. 生命周期与完成判据

1. 主题/来源注册表、显式来源 FK、导出导入、角色生命周期和来源 stale 测试全绿。
2. 闭集抽取、逐字回查、候选强制、冲突硬判与确认阻断全绿。
3. `canonAssertions` 回注正文/设定生成；事实库世界宪法视图能完成抽取、确认和冲突复核。
4. `R-CANON-setting-clash-1`（魔法来源互斥）与
   `R-CANON-setting-clash-2`（孤儿 ↔ 父母健在）从 todo 转活动测试。
5. 真实隔离项目复现两组反例并显示冲突；同值不误报；旧备份、当前全表往返、生产 build、
   E2E 和覆盖地图全部通过。

## 7. 明确不承诺

- 未抽取、未确认或未登记主题的散文不会获得硬保证。
- 不用字符串差异判定复杂条件规则、价值观、动机或文风冲突。
- 不在本阶段自动删除旧力量体系入口、自动改设定或自动选择哪条 Canon 正确。
