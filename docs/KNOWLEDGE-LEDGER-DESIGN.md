# CONSISTENCY-2 · 认知 / 知识账本实施设计

> 状态：2026-07-25 已按冻结边界交付。归属 `CANON-1`，依赖 `INV-1` 与
> `CONSISTENCY-0`。目标是把“角色知道 / 不知道 / 误以为”做成可追溯事件投影，
> 为开天眼检测提供确定性判决底座。

## 1. 核心取舍

不复用 `temporalFacts` 存认知事件。`temporalFacts` 表达作品世界中的 Canon 真相；
角色可以不知道真相，也可以相信错误内容。把二者塞进同一事实状态机会让角色误认污染
`currentFacts`，并使 supersede、锁定和事实确认语义冲突。

新增 `knowledgeLedger` 事件表：

```ts
interface KnowledgeLedgerEntry {
  id?: number
  projectId: number
  worldGroupId?: number | null
  characterId?: number | null
  characterName: string
  knowledgeKey: string
  statement: string
  factId?: number | null
  action: 'learn' | 'mislearn' | 'forget' | 'correct'
  belief?: string | null
  sourceType: 'chapter' | 'manual' | 'import'
  sourceChapterId?: number | null
  sourceQuote?: string
  status: 'candidate' | 'confirmed' | 'rejected' | 'source-missing' | 'invalid-range'
  createdAt: number
  updatedAt: number
}
```

- `knowledgeKey` 是同一知识命题的稳定身份；AI 只能从已提供的闭集 key 中选择，新 key
  必须由作者确认。
- `statement` 是命题的 Canon 文本；`belief` 只在 `mislearn` 时保存角色的错误认知。
- `factId` 可关联 `temporalFacts`，但允许为空，以支持暂未结构化成 Canon fact 的人工命题。
- 事件只追加；作者确认的事件不被后续事件改写。当前认知由章节时点投影实时计算。

## 2. 投影语义

`projectCharacterKnowledge()` 使用 `resolveCanonicalChapterSequence()`，绝不缓存章节
`order`。验证第 N 章时只读取 N 章之前的 confirmed 事件：

- `learn` / `correct` → `known`
- `mislearn` → `mistaken`，保留 `belief`
- `forget` → `unknown`
- 没有历史事件 → `unknown`

同角色、同 `knowledgeKey` 取规范章序中最后一条；无章节的 manual/import 事件作为开篇
基础认知，排在有章节事件之前。按 `worldGroupId` 隔离，`null` 作为跨世界/默认基础。

首版不判同一章内“先听说再说出”的句内顺序；这是显式未覆盖边界，不能伪装成硬保证。

## 3. 软抽取与硬判决边界

自然语言中“某角色是否引用了某知识”不能靠任意正则可靠判定。完整链路分两层：

1. 软抽取：AI 从正文提取 `{ characterId, knowledgeKey, quote }`，只能映射作者已确认的
   角色和知识 key，quote 必须逐字回查。
2. 硬判决：`checkCognitionBoundary()` 对结构化引用与章节前投影做确定性比较；
   `unknown` / `mistaken` 引用 Canon statement 时产生 finding。

因此 CONSISTENCY-0 的 `R-CANON-omniscient-1` 只有在“抽取 → 逐字回查 → 投影 →
finding → 作者可见出口”端到端完成后才从 `todo` 转为活动测试。只测投影 API 不算覆盖。

## 4. 三注册表与生命周期

- 读：新增 `characterKnowledge` `CONTEXT_SOURCES`，按目标角色和目标章节注入已知/
  误认边界。
- 写：`knowledgeLedger` 字段登记 `FIELD_REGISTRY`，集合写回登记
  `ADOPTION_SCHEMAS`；AI 抽取只写 `candidate`，确认后才参与投影。
- 表：`knowledgeLedger` 登记 `PROJECT_TABLES`，可导出，世界作用域，FK/remap 包含
  character、chapter、temporalFact。

生命周期：

- 删项目、删世界、开启多世界、导出导入由 `PROJECT_TABLES` 派生。
- 角色合并重映射 `characterId` 和显示名；角色删除保留事件、清 ID 并标
  `source-missing`，不静默丢作者记录。
- 章节删除清 `sourceChapterId` 并标 `source-missing`；不把事件挪到相邻章节，也不把它误当
  成开篇基础认知。
- 导入未映射的 character/chapter/fact 引用置空并进入复核，不形成跨项目悬空 FK。

## 5. 用户出口

复用现有“事实库”正式入口，增加“角色认知”视图：

- 按角色查看当前已知、误认和事件流水。
- 人工新增候选，确认/否决候选或异常事件。
- 章节编辑器的检测结果仍走现有 ReviewPanel；不自动改正文、不自动把抽取结果升为权威。

## 6. 分阶段完成判据

1. 数据地基：v39 新表、三注册表、迁移、项目/世界/角色/章节/导入导出生命周期全绿。
2. 投影与上下文：规范章序、世界隔离、known/unknown/mistaken、`characterKnowledge`
   上下文源全绿。
3. 检测闭环：闭集软抽取、逐字回查、确定性判决、ReviewPanel 可见，
   `R-CANON-omniscient-1` 转活动测试。
4. 真实项目：隔离测试项目录入“第 5 章获知 / 第 3 章提前引用”，检测命中；正常已知不误报；
   导出导入与角色删除/合并不丢事件。

## 7. 交付边界

- 已完成数据地基、投影、生成上下文、事实库角色认知视图、闭集抽取协议、
  ReviewPanel advisory finding 和 `R-CANON-omniscient-1`。
- 确定性保证只覆盖“已经进入作者确认闭集且被抽取器识别出的引用”；LLM 没提取到的自然语言
  仍可能漏检。同章内获知顺序也仍不判。
- 下一阶段归 `CONSISTENCY-3` 世界宪法，不在本表复刻通用设定断言系统。
