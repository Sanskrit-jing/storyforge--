# Phase 39 · 故事线动态进度与交叉设计

> 状态：COMPLETE（2026-07-25）  
> 静态注册表：`StoryArc` / `StoryStage`  
> 动态层：`StorylineProgress` / `StorylineCrossing`

## 1. 概念边界

- `StoryArc` 是作者规划的主线/支线蓝图，继续作为唯一故事线注册表，不复制名称、
  类型和阶段定义。
- `StorylineProgress` 是每条 Arc 一行的作者已确认动态投影：当前阶段、活跃状态、
  一句话进度、最近活跃章和相关实体。
- `StorylineCrossing` 是两条已登记 Arc 在某章发生互相影响的确认记录。
- `storyTimelineEvents` 仍是扁平剧情事件流，不承担故事线归类和阶段指针。

## 2. 作者在环

AI 追踪由作者手动选择已写章节触发。模型只能对给定的 `arcId` 和该 Arc 的
`stageId` 闭集提出：

- 已有线推进候选；
- 两条已有线的交叉候选；
- 无法映射时的新故事线候选。

候选只保存在当前 UI 会话。作者点击采纳后，已有线进度和交叉才分别通过
`FIELD_REGISTRY + ADOPTION_SCHEMAS + adopt()` 落库；新线候选由作者明确创建为
`StoryArc`，不会由模型静默扩张注册表。

## 3. 数据与生命周期

- DB v40 新增两张空表，不从历史散文猜测进度。
- `storylineProgress.arcId` 唯一；删除 Arc 时删除其进度及任一端交叉。
- 删除章节时保留动态记录，但把 `lastActiveChapterId/chapterId` 置空并保留冗余章名，
  避免把作者确认的进度说明一起丢失。
- 项目删除、JSON 导出导入、Arc/章节 FK 重映射均由 `PROJECT_TABLES` 声明。
- 导入缺失必填 Arc 映射时拒绝并回滚整个导入，避免静默丢失动态行；缺失可选章节
  映射时置空。

## 4. 追踪闭集

输出必须是严格 JSON，并满足：

- `arcId` 存在于当前项目；
- `currentStageId` 为空或存在于该 Arc 的 `StoryStage[]`；
- 状态仅为 `dormant | active | climax | resolved | abandoned`；
- `quote` 必须逐字来自待分析章节；
- 交叉两端不同、都在注册表内，并在同章有逐字证据；
- 新线候选不得复用现有 Arc 名称。

解析失败、越权 ID、虚构 stage、虚构引文全部丢弃，不写数据库。

## 5. 回报通道与诚实边界

`storylineProgress` 作为注册表上下文源，将已确认当前进度和最近交叉注入章节生成、
大纲与一致性审校，用于减少已收束线被无意重启、长期支线忘记推进等问题。目标章
存在时按规范大纲章序过滤未来进度；若某条线的唯一最新投影来自未来章，则宁可不注入，
也不把未来信息泄漏给前章。

确定性保证只覆盖数据结构、身份闭集、阶段闭集、来源逐字引用和生命周期。正文是否
“真的推进了某条线”仍由 LLM 提议、作者确认；不会宣称任意故事线语义已被代码证明。
