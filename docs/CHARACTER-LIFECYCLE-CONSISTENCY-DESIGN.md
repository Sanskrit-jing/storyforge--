# CONSISTENCY-4 · 角色存亡时序设计

> 状态：已按冻结边界交付  
> 范围：`R-CANON-timeline-1`，不提前建设 Phase 39 故事线表

## 1. 目标与不变量

- 判定“目标章开始前已死亡的角色，在目标章作为存活角色正常活动”。
- Canon 唯一来源仍是 `temporalFacts` 的 `aliveStatus`，不把故事年表、
  `characters.ending` 或自由文本推测升级为硬事实。
- 章序只从规范大纲遍历实时计算，绝不缓存或信任可漂移的 `chapter.order`。
- `confirmed` 是当前 Canon；`superseded` 是有截止章的历史 Canon，投影早期章节时仍须有效。
- 正文语义不使用正则猜测。AI 只能从“目标章开始前已死亡角色”的闭集中返回
  `characterId + normal-activity + 逐字 quote`，代码再做状态与时点硬比对。
- 检测结果只进入 ReviewPanel advisory，不自动修改正文或事实。

## 2. 投影边界

`projectCharacterLifecycles()` 对目标章开始前投影：

1. 只读同项目、当前世界或全局的 `aliveStatus`；
2. 只读 `confirmed | superseded`，按 `validFrom/validTo` 和规范章序判断有效区间；
3. 目标章自身的新事实严格排除，避免把章末死亡提前到章首；
4. 后续已确认复活会关闭旧死亡区间，复活后的章节不再报死亡活动；
5. 缺失章节、歧义角色名、非法枚举和跨世界事实不参与硬判决。

章内“先死亡、后活动”、借尸、附身、时间倒叙等复杂语义仍由 Deep Audit 处理，
本阶段不冒充确定性覆盖。

## 3. 输入闭集与出口

- 事实抽取提示明确枚举值；写入前由 `normalizeFactValue()` 把登记别名归一到
  `alive | dead | missing | unknown`，未登记值拒绝进入账本。
- 审校提示新增 `lifecycleReferences`。尸体、回忆、梦境、幻象、他人转述和明确复活
  不得标为 `normal-activity`。
- `checkCharacterLifecycleBoundary()` 只对闭集、逐字可回查的活动引用判决；
  命中后生成带 Canon fact ID 与死亡证据的 hard finding。

## 4. 验证边界

- `R-CANON-timeline-1` 必须直接执行真实投影、解析器和判决器。
- 回归覆盖：规范章序优先于 `chapter.order`、目标章自身排除、世界隔离、
  superseded 历史区间、复活关闭死亡区间、非法/幻觉引用拒绝。
- 完整 TypeScript、Vitest coverage、生产构建、浏览器 E2E 与真实项目 UI 走查后，
  才能把覆盖地图改为绿色。
