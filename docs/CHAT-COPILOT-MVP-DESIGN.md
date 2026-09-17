# AGENT-1 · ChatCopilot 世界来源 MVP

> 状态：Phase 27.1-c 已完成（2026-07-25）。

## 1. 交付边界

本期只交付一条可独立使用和验收的真实闭环：

```text
工作区当前项目/世界
  → read_project_status + read_worldview
  → worldview.dimension 生成候选
  → 作者查看并可编辑确认卡
  → GenerationNode 确定性 gate
  → adopt(worldviews.worldOrigin)
  → worldview store 重载，面板同步
```

明确不做：

- 不做泛化意图识别和任意写工具；
- 不做聊天历史持久化，不加数据表和迁移；
- 不做多 Agent、per-role 模型、后台常驻、NPC 演进；
- 不自动修改用户手稿，也不在生成完成时自动写入；
- 不把原生 `tool_calls` 当作本期前置条件。

## 2. 三注册表与数据生命周期

| 四问 | 本期答案 |
|---|---|
| AI 读什么 | `read_project_status` 与 `read_worldview`，统一经 `CONTEXT_SOURCES → assembleContext()`；不扫描整库 |
| AI 写什么 | 只写当前世界 `worldviews.worldOrigin` |
| 哪些表参与生命周期 | 沿用既有 `worldviews`，不新增表；项目/世界删除、导入导出仍走既有 `PROJECT_TABLES` |
| 注册表影响 | 读取源、`worldviews.worldOrigin` 字段和 `worldviews` 表均已登记，无需新增平行注册表 |

写回只允许：

```text
GenerationNode.adopt
  → adopt({ target: "worldviews", mode: "replace" })
  → FIELD_REGISTRY 校验 worldOrigin
  → worldviews 已登记表
  → Canon 来源状态刷新
```

用于并发保护的当前行 ID、`updatedAt` 和原字段值只做本地写前快照核对，不进入模型上下文，
也不是第四条 AI 读取路径。

## 3. 确认与并发不变量

`runGenerationNode()` 仍默认只生成、不采纳。新增
`adoptGenerationNodeOutput(node, visibleCandidate)`，专门采纳作者眼前已经确认的候选：

1. 不再次调用模型；
2. 对作者编辑后的最终文本重新执行 gate；
3. 没有 `adopt` 或 gate 阻断时保持只读；
4. 候选生成后若来源 ID、更新时间或字段值变化，拒绝覆盖；
5. `adopt()` 未产生且仅产生一条合法写回时，不伪报成功。

确定性 gate 拒绝：

- 空候选；
- 少于 4 个字符；
- 超过 12,000 个字符；
- 与当前字段完全相同。

## 4. 作用域与 UI

- 工作区标题栏新增对话副驾开关，与属性面板互斥，避免双右栏挤压主区；
- 顶部显示真实项目和当前世界；
- 多世界项目未选择世界时在读取和模型调用前停止；
- 切换项目/世界会取消进行中的请求并作废旧候选；
- 一次只允许一个待确认候选，必须采纳或拒绝后才能发起下一次；
- 采纳成功后调用同一个 `useWorldviewStore.loadAll()`，世界来源面板通过 Zustand 同步。

聊天消息与候选只保存在面板内存中。关闭面板会清除会话，这是本期有意边界，不伪装成已提供
聊天恢复能力。

## 5. 提示词、模型与输入预算

- 复用 `worldview.dimension` 的当前激活模板和字段边界，不新增不可配置提示词体系；
- 调用仍走统一 `chat()`、任务路由、provider 配置和 `aiUsageLog`；
- 单次输出上限覆盖为 3,000 tokens；
- 协议型候选生成要求 `contextOverflowPolicy=reject`，不静默裁掉已登记项目上下文；
- 项目输入只有紧凑概况与当前世界观关联闭包，不把章节、角色全文或整个仓库送入模型。

## 6. 验收要求

- 专项测试覆盖：生成只读、可见候选精确采纳、作者编辑、gate 四类反例、过期候选、
  注册表异常、多世界未选作用域、真实 IndexedDB adopt 链和确认卡 UI；
- 完整 Vitest/coverage、TypeScript、lint、build、bundle、架构、三注册表、AI Manual、
  source reachability、roadmap、agent context、canon coverage 全部通过；
- 浏览器真实项目使用当前已配置提供商生成候选，确认前内容表零写入；
- 作者采纳后只有当前世界 `worldOrigin` 变化，面板同步；拒绝路径零写入；
- 临时探针与测试数据清理，独立提交，工作区干净。

## 7. 已完成验收

- 专项：4 个文件、17 项测试通过；正式 Playwright 增加拒绝/编辑/采纳/无二次调用闭环；
- 全量：222 个文件、777 项测试通过，coverage
  71.18% statements/lines、72.88% branches、72.8% functions；
- TypeScript、lint、生产构建、bundle、三注册表、架构、AI Manual、source reachability、
  roadmap、agent context、canon coverage 和实时项目指标均通过；
- 真实浏览器项目先生成并拒绝一份候选，`worldviews` 保持 0 行；第二份候选由作者侧编辑为
  固定文本后采纳，`aiUsageLog` 在生成时从 8 增至 9，采纳时保持 9，证明确认没有二次生成；
- 写回后 `worldviews.worldOrigin` 与可见编辑文本逐字一致，世界来源面板即时显示同一内容；
  临时世界观行已按精确标记删除，内容表恢复验收前计数；两条真实生成 usage 作为标准运营
  成本日志保留。
