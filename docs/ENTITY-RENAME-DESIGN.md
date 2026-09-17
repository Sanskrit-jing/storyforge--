# EDITOR-5 安全实体改名设计

## 1. 开发登记

- 稳定 ID：`EDITOR-5`
- 主归属：`AUTHOR-1 长篇编辑与作者风格智能`
- 用户故事：作者选择一个已有实体后，可以在一次可预览、可恢复的操作中同步修改主档、全书正文和有稳定外键的冗余显示名。
- 复用能力：`EDITOR-1` 的 canonical 章节选择、富文本 text-node 查找替换、项目快照、三注册表 `adopt()` 写回。
- 取代关系：不取代普通文字查找替换；新增“智能实体改名”模式，不建立第二套编辑器。

## 2. 范围与非范围

第一阶段只支持有独立稳定 ID 的：

- 角色 `characters.id`
- 重要地点 `importantLocations.id`
- 词条 `codexEntries.id`

物品不进入智能改名。当前 `itemLedger` 以“持有人 + `itemName`”聚合，没有独立物品实体 ID。不同角色的同名物品不能证明是同一个对象，按名称批量修改可能串账或合并流水。

自由文本不做语义猜测。大纲标题/摘要、档案描述、状态字段值、事实值与证据引文只进入人工复核清单；角色驱动方案等历史快照保留当时名称。普通实体表单里的名称编辑仍是单记录编辑，跨项目全量改名必须使用“章节 → 查找替换 → 智能实体改名”。

## 3. 数据读写边界

### 读取

- 主实体：`characters`、`importantLocations`、`codexCategories/codexEntries`
- 正文与顺序：`outlineNodes`、`chapters`
- 稳定冗余名：`stateCards`、`temporalFacts`、`knowledgeLedger`、`cultivationProgress`、`itemLedger`
- 人工复核：`storyCores`、`detailedOutlines` 以及上述表中的自由文本

### 自动写入

| 实体 | 主档 | 稳定冗余名 |
|---|---|---|
| 角色 | `characters.name` | `stateCards(character).entityName`、`temporalFacts.characterId → subjectName`、`knowledgeLedger.characterId → characterName`、`cultivationProgress.characterId → characterName`、`itemLedger.characterId → heldByName` |
| 地点 | `importantLocations.name` | `stateCards(location).entityName`、`temporalFacts.locationId → subjectName` |
| 词条 | `codexEntries.name` | `temporalFacts.codexEntryId → subjectName`；仅内置势力分类可证明映射到 `stateCards(faction)` |

角色关系、细纲角色数组、事实客体和词条引用使用稳定 ID，不改 ID。词条非势力分类与状态卡之间没有可靠类型映射，因此同名状态卡只提示复核。

所有受 `FIELD_REGISTRY` 管理的字段走 `adopt()`。`temporalFacts` 继续使用既有 `fact-ledger` 领域扩展，并把 `src/lib/editor/entity-rename.ts` 登记为受控入口。

## 4. 安全协议

1. 名称使用 NFKC、去首尾空白和不区分大小写的键做冲突判断。
2. 旧名称若同时属于其他角色、地点、词条或物品，阻断执行，因为正文命中无法判定归属。
3. 新名称若已被任何其他稳定实体或物品使用，阻断执行。
4. 正文只处理 canonical 章节，使用 `EDITOR-1` 的 DOM text-node 替换并保护更长的已知实体名；重复/孤儿章节仅列入复核。
5. 预览保存完整变更基线。执行前重建预览；创建快照后在事务内再次重建并校验，过期预览拒绝写入。
6. 快照成功后，主档、正文和结构化冗余名在一个 Dexie 宽事务中提交；任一写入失败整批回滚。
7. 会话撤销先逐字段确认当前值仍等于本次改名结果，再反向原子写回；记录已被修改或名称被占用时拒绝局部撤销，提示使用项目快照。

本功能没有新增表或字段，因此不需要 schema 迁移，也不改变导入导出格式和删除生命周期。

## 5. UI

`FindReplacePanel` 提供两个并列模式：

- 文字替换：保留原 `EDITOR-1` 行为。
- 智能实体改名：选择稳定实体与新名称 → 预览正文命中、结构化同步、阻断项和人工复核项 → 二次确认 → 创建快照并执行 → 本次会话原子撤销。

界面明确说明物品暂不支持的身份原因，不用模糊的“开发中”状态掩盖数据风险。

## 6. 验收证据

- `tests/regression/R-EDITOR5-entity-rename.test.ts`
  - 角色、地点、势力词条
  - 富文本与更长实体名保护
  - 状态卡、事实、认知、修炼和物品持有人同步
  - 改名后状态召回使用新名称
  - 跨类型同名与物品同名阻断
  - 快照失败零写入
  - 事务中途失败全回滚
  - 过期预览与过期撤销拒绝
- 真实浏览器项目 `EDITOR-5 实体改名真实验证`
  - 角色“顾临川”与一章已保存正文
  - 预览得到正文 2 处 / 主档 1 条
  - 执行后主档选项和正文均为“沈照野”
  - 原子撤销后主档选项和正文均恢复为“顾临川”
