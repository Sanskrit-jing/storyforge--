# STORY-1 / CF-9C 角色驱动设计工作区

> 状态：已完成（2026-07-25）
> 后续阶段：CF-12 已于 2026-07-25 完成，见 `CHARACTER-REVISION-WORKFLOW-DESIGN.md`
> 非范围：自动改写 `storyCore.mainPlot`、既有正文或未经作者确认的未来大纲

## 一、问题与裁决

原角色驱动面板把弧光、作者要求和生成卷纲放在组件 `useState` 中，刷新即丢；采纳后只
剩普通大纲节点，后续生成无法知道哪份角色驱动方案是作者当前认可的参考。

本阶段采用一个项目级、作者显式激活的设计对象：

```text
角色卡（可删除/改名）
  → characterDrivenPlans（输入快照 + 生成结果 + 版本链）
  → projects.activeCharacterDrivenPlanId（作者显式选择）
  → CONTEXT_SOURCES.characterDrivenPlan
  → 普通卷纲 / 章纲 / 场景 / 正文生成

方案生成结果
  → 作者勾选卷
  → adopt(target=outlineNodes)
  → 卷/章大纲
```

方案不绑定世界组，因为它描述项目级主线与角色弧光；多世界专属规划若未来需要，必须
另行立项，不能用当前世界 UI 状态偷偷改变本表语义。

## 二、数据契约

DB v44 新增 `characterDrivenPlans`：

- `arcs`：`CharacterDrivenPlanArc[]` JSON，保存角色软 ID、姓名/身份快照、起点和目标；
- `generatedVolumes`：校验后的卷/章结构 JSON；
- `status`：`draft | generated | adopted`；
- `version / parentPlanId`：复制为新版本时形成可回看的版本链；
- `userHint`、名称和时间戳。

`projects.activeCharacterDrivenPlanId` 是可选软引用。旧项目不迁移、不猜测最近方案；没有
active 时上下文源返回空。

所有 JSON 在读取边界安全解析。坏 JSON 降级为空数组，不让工作区崩溃，也不把未校验
结构继续传播。

## 三、角色与版本生命周期

- 角色改名：UI/上下文优先显示当前名，并保留“方案快照名”提示；
- 角色删除：只把弧光中的 `characterId` 置空，姓名、身份和弧光文本全部保留；
- 角色合并：软 ID 与 canonical 名称一起重映射；
- 删除来源版本：子版本保留，`parentPlanId` 置空；
- 删除 active 方案：项目 active 引用置空，不删除已采纳大纲或正文；
- 删除项目：由 `PROJECT_TABLES` 派生生命周期级联删除方案。

## 四、便携导出

数据库主键不能直接进入备份。注册表导出写三个便携影子引用：

- 项目 active 方案 → `_activeCharacterDrivenPlanExportId`；
- 方案父版本 → `_parentExportId`；
- 每条弧光角色 → `_arcCharacterIndexes`。

导入先创建目标记录，再用新项目 ID 映射回填。旧备份若只有原始 active ID，会安全清空
而不是猜测，以免误绑定新项目中的同号记录。角色未随备份导入时，弧光 ID 置空，快照仍
可读。

## 五、上下文与写回边界

`characterDrivenPlan` 只读取作者明确激活、且属于当前项目的方案。它会输出：

- 方案名、版本、状态和作者要求；
- 当前角色名/已删除快照状态；
- 弧光起点与目标；
- 已生成卷纲、章纲和弧光推进。

普通卷纲、章纲工作坊、细纲、场景和正文生成显式登记此 source key。没有 active 时不
污染上下文。

采纳结果只通过 `adopt({ target: 'outlineNodes' })` 新增卷/章；重复标题遵循已有
`ADOPTION_SCHEMAS` 幂等策略。它不会写 `storyCore`，不会修改或删除任何既有正文。

## 六、完成证据

- `R-CF9C-character-driven-workspace`：CRUD、版本、active、上下文、删除降级、采纳幂等；
- `R-CF9C-export-import`：角色/父版本/active 三类便携引用及旧格式安全降级；
- `R-CF9C-v44-migration`：旧项目与角色原样保留，只新增空表；
- `R-17`：48 张 required table 与 schema 双向一致，生产缺表仍不自动清库；
- Chromium 真实流程：创建项目与角色、保存弧光、重命名、复制 v2、激活、刷新回填。

CF-12 已把 active 方案作为可选输入，完成“已写区 / 过渡区 / 未写区”的影响分析。
所有未来大纲 patch 必须先预览、再由作者选择；正文和主线仍禁止静默改写。
