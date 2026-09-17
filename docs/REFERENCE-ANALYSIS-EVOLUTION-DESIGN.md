# IDEA-1 参考资料分析演化

> 状态：**已完成（2026-07-25）**  
> 唯一归属：IDEA-1；复用既有 `references` / `referenceChunkAnalysis` 和“引用手法”
> 上下文，不恢复已删除的 `master-study`。

## 1. 用户故事与问题

作者会反复补充、修订或更换同一份参考资料。重新分析不能先删除上一份可用报告，也不能在
作者尚未确认时把新结果直接注入创作 Prompt。每个结果还需要回答“来自哪个文件、什么来源
声明、哪一版分析”，并在失败、刷新、导出导入和删除时保持可解释。

旧链路存在四个会破坏这一目标的问题：

1. 重新上传先清空全部 `referenceChunkAnalysis`，取消或失败会丢掉最后可用结果。
2. 分块没有分析版本，断点集合、全书总结和角色聚合会跨轮次混用或残留。
3. 原文只存在页面内存；刷新后无法继续，直接上传的 EPUB 还会被 `file.text()` 当作普通文本。
4. “引用手法”读取某参考的全部分块，没有“作者已激活版本”的边界。

## 2. 完整功能边界

### 本阶段交付

- 每次上传创建独立 `ReferenceAnalysisRun`，绑定文件名、哈希、深度、来源声明和使用范围。
- 原文保存在本地 `referenceAnalysisSources`，只服务断点续跑，不进入项目 JSON 备份。
- 新版本分析写入自己的分块集合；首版自动激活，后续版本先进入 `ready`。
- 作者可查看维度差异、显式激活、回滚历史版本或删除非激活版本。
- `buildRefAnalysisContext()` 只读取唯一 `active` 版本。
- AI 的 `rawExcerpt` 必须能在对应原文块中逐字核对（允许空白差异），否则不落库。
- 删除参考时原子清理版本、分块、断点原文和 `creativeRules.citedReferenceIds`。
- 版本和分块随项目 JSON 便携重映射；本地断点原文明确不导出。
- 旧项目不在 DB upgrade 中猜测来源；首次使用时把旧分块无损桥接为未确认来源的 active v1。

### 明确非范围

- 不生成剧情连续性胶囊，不把方法论分析冒充角色终态、事件因果或 Canon。
- 不开放原稿续写，不默认模仿参考作者的可识别声音。
- 来源声明是作者记录，不是 StoryForge 的版权或法律核验。
- `continuation-authorized` 只作为未来闸门所需的可追溯声明，本阶段不会因此出现续写按钮。
- EPUB、DOCX、PDF 等格式继续走统一“导入”解析；作品分析页只直接读取 TXT / Markdown。

## 3. 数据模型与约束

```text
references
  └─ referenceAnalysisRuns (projectId + referenceId + version)
       ├─ referenceChunkAnalysis (analysisRunId + chunkIndex)
       └─ referenceAnalysisSources (analysisRunId 主键，本地且不导出)
```

每份参考最多保留 6 个 run。超过上限时只允许裁剪最旧的 `failed`、`cancelled` 或
`superseded`；`active`、`ready` 和 `analyzing` 不会被静默删除。任一参考至多一个
`active` run；激活和回滚在同一 Dexie 事务中把旧 active 降为 `superseded`，再同步
`Reference` 上的旧兼容投影字段。

来源类别为本人原创、已获授权、公版/明确许可、研究资料和待确认。研究资料与待确认来源的
使用范围强制收窄为“仅分析”，即使调用方提交更宽范围也不会落库。

## 4. 状态机

```text
upload → analyzing → ready ──activate──→ active
            │                    ▲          │
            ├─failed             │          └─activate another→ superseded
            └─cancelled          └────rollback───────────────┘
```

没有旧 active 的首版在分析完成后由 `ready` 自动激活。已有 active 时，新版保持 `ready`，
因此失败、取消和未经确认的 AI 结果都不会改变创作上下文。失败/取消版本若仍有本地原文，可
从已完成 chunk 继续；已写分块按 `analysisRunId + chunkIndex` 去重。

## 5. 三注册表

- 读：仍由 `CONTEXT_SOURCES.references` 调用 `buildRefAnalysisContext()`；读取实现只解析
  active run，不新增平行 Prompt 入口。
- 写：run 状态/派生总结和新分块分别登记到 `FIELD_REGISTRY` /
  `ADOPTION_SCHEMAS`；创建、激活、旧数据桥接和级联删除登记为有审查日期的领域扩展。
- 生命周期：`references → referenceAnalysisRuns → chunks/source` 的引用、项目导出导入、
  项目删除和 FK 重映射都由 `PROJECT_TABLES` 声明。

DB v46 只新增两张表并给分块增加索引，不在升级事务中修改旧 `Reference` 或旧分块内容。

## 6. 验收

- 旧 v45 数据升级后逐字段不变，运行时桥接不改变分块主键与分析文本。
- 新版 ready 前后分别验证上下文不可见/可见，回滚后恢复旧上下文。
- 取消、全失败、部分失败、刷新续跑、幻觉引文、来源范围降级均有反例。
- 项目 JSON 往返验证 reference/run/chunk 三层 ID 重映射；断点原文不出现在 JSON。
- 删除参考和删项目验证分块、run、断点原文、引用数组无孤儿且不影响其他参考/项目。
- 真实浏览器使用作者自有或合成 TXT，完成两轮 Agnes 分析、差异、激活、刷新和回滚。

### 真实验收记录

- 使用两份合成 TXT 在隔离项目中运行 Agnes：v1 自动激活，v2 分析期间 v1 报告和上下文持续可用。
- v2 完成后保持 `ready`，差异显示新增/变化/删除/未变维度；作者激活后刷新页面仍保留两版和各自报告。
- UI 完成 v2 → v1 → v2 双向回滚，来源与使用范围随版本正确切换，最终恢复 v2 为 active。
- 浏览器控制台无 error；专项回归覆盖旧数据桥接、active-only 上下文、部分失败、版本上限、删除级联和便携导入导出。
