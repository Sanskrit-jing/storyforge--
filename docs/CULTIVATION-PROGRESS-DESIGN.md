# Phase 34 修炼进度设计

> 状态：已完成（2026-07-25）  
> 依赖：Phase 37-a `cultivationSystems` 已完成  
> 归属：WORLD-1 下游产物

## 一、职责边界

- `Character.cultivationSystemId / cultivationStageId` 是作者填写的上游设定。
- `cultivationProgress` 是从已写正文中提取、经作者确认的下游事件流。
- 两者可以不同：角色卡表示预设或人物档案，进度表只表示正文已经发生且有逐字证据的
  到达、突破、倒退或明确改道。
- 临时压制、封印、跨世界规则削弱、伪装和短时爆发都不改变真实境界，不写进度事件。
- AI 只能把正文映射到角色、体系和境界 ID 闭集；候选先驻留内存，作者确认后才写库。

## 二、数据模型

`cultivationProgress` 每行是一条作者确认的正文事件，而不是可被覆盖的“当前值”：

```ts
interface CultivationProgress {
  id?: number
  projectId: number
  worldGroupId?: number | null
  characterId?: number | null
  characterName: string
  cultivationSystemId?: number | null
  cultivationSystemName: string
  stageId?: string | null
  stageName: string
  transition: 'enter' | 'advance' | 'regress' | 'switch'
  sourceChapterId?: number | null
  sourceChapterTitle: string
  sourceQuote: string
  sourceOffset: number
  trigger: string
  status: 'confirmed' | 'stale' | 'source-missing'
  createdAt: number
  updatedAt: number
}
```

当前境界、实际走过的路径和晋升时间线都从事件流实时投影，不另存第二份易漂移状态。
同章事件按 `sourceOffset` 排序；跨章一律使用规范大纲章序，不使用 `chapter.order` 或 ID。

## 三、确定性校验

模型结果必须同时通过：

1. `characterId` 属于当前项目且角色已关联该 `cultivationSystemId`；
2. `systemId / stageId` 属于同一体系闭集，且体系作用域与来源章节世界兼容；
3. `quote` 是正文唯一的逐字连续片段；位置由代码计算，模型不能自报顺序；
4. `transition` 与当前 DAG 关系一致：
   - `enter`：时间线上第一条事件；
   - `advance`：目标是当前阶段的后代；
   - `regress`：目标是当前阶段的祖先；
   - `switch`：目标不在直接祖先/后代路径上，只允许正文明确改道且作者确认；
5. 采纳前重新读取章节、角色和体系，再次执行全部校验，防止分析后正文或设定已变化；
6. 把候选插入历史位置后校验整条时间线，支持先确认后章、再补确认前章。

同一角色、同一章节、同一阶段、同一逐字证据重复时跳过。解析失败、闭集外 ID、
含糊重复引文或无可靠变化时宁可返回空候选。

## 四、生命周期

- 删除章节：保留冗余章节标题和证据，断开 FK，标记 `source-missing`。
- 删除角色：保留角色名，断开 FK，标记 `source-missing`。
- 删除体系：保留体系名和境界名，断开体系/境界引用，标记 `source-missing`。
- 删除境界：保留境界名，清空 `stageId`，标记 `source-missing`。
- 境界名称或父子关系改变：受影响事件标记 `stale`，不能继续进入 AI 上下文。
- 删除世界：随世界数据级联删除；删除项目由 `PROJECT_TABLES` 自动级联。
- 导出导入：世界、角色、体系、章节四类 FK 均使用便携 ID 重映射；不可映射的软引用
  置空并降级，不把旧数字 ID 误连到新项目。

## 五、AI 上下文

- 新增 `cultivationProgress` 世界级 L1 源，只读取 `confirmed` 投影。
- 项目开关 `includeCultivationProgressInAI` 默认 `false`。
- 开启后，写目标章只注入目标章之前的确认事件；目标章自身和未来章一律不注入。
- 上下文只包含角色、体系、当前境界、已确认路径与最近证据章节，不包含候选、
  `stale` 或 `source-missing` 行。

## 六、产品入口

创作区新增“修炼进度”（下游）：

- 选择有正文的章节并执行分析；
- 候选逐条确认或忽略；
- 按角色显示当前境界、DAG 已走路径和确认时间线；
- 可删除误确认事件；
- 明示“角色卡设定境界”与“正文确认进度”的差异；
- 提供默认关闭的“反哺后续写作”开关。

## 七、验收

- v42 空迁移不猜旧自由文本；
- 闭集解析、逐字证据、DAG 前进/倒退/改道和逆序补录均有单测；
- 角色、章节、体系、阶段、世界和项目生命周期有真实 Dexie 回归；
- 全表导出导入验证四类 FK；
- 真实浏览器完成章节分析候选（mock API）、作者确认、刷新恢复和上下文开关；
- 全量 Vitest、E2E、三注册表、AI manual、构建和 bundle 门禁通过。
