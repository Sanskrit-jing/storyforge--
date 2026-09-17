# AGENT-1 · Tool Registry 地基设计

> 状态：Phase 27.1-a 已完成（2026-07-25）。本文覆盖只读工具层；后续
> AgentRunner 与 ChatCopilot 的实际边界分别见 `AGENT-RUNNER-DESIGN.md` 和
> `CHAT-COPILOT-MVP-DESIGN.md`；27.1-d 四个领域扩展分别见 `CHAT-COPILOT-*` 设计文档。
> 仍不宣称多 Agent 或后台 Agent 已完成。

## 1. 为什么先做这一层

对话副驾需要“看懂项目”，但不能为了 Agent 再造一条直接扫描各 store/全库的 AI 路径。StoryForge 已有 `CONTEXT_SOURCES → assembleContext()` 作为上下文读取单一入口，因此 Agent 工具只负责：

1. 校验工具参数；
2. 锁定当前项目/世界作用域；
3. 选择已登记的上下文源；
4. 返回有预算、有截断元数据的结果。

旧版 `AI-COPILOT-DESIGN.md` 中“直接复用各 store state”的描述以本文为准修正为“复用 `CONTEXT_SOURCES` 的业务读取适配器”。工具不是第四个数据注册表，也不保存业务数据。

## 2. Phase 27.1-a 边界

注册表当前实现 14 个只读工具。Phase 27.1-a 首批 13 个为：

- `read_project_status`
- `read_worldview`
- `read_story_core`
- `read_characters`
- `read_outline`
- `read_chapter`
- `read_history`
- `read_world_rules`
- `read_foreshadows`
- `read_inventory`
- `read_story_timeline`
- `read_world_groups`
- `search_text`

Phase 27.1-d 为灵感反推独立闭环追加：

- `read_inspiration_workspace`：只接作者明确选择的 1–24 个当前项目碎片 ID 与单/多世界
  模式，底层仍走 `inspirationWorkspace → assembleContext()`；未选择和跨项目碎片不返回。

工具层明确不做：

- 不调用模型，不实现 `AgentRunner`；
- 不写数据库，不实现生成/采纳工具；
- 不新增聊天历史表；
- 不开放网络搜索、shell、任意 URL 或任意工具执行；
- 不实现后台常驻、多 Agent 分工或 NPC 自动演化。

## 3. 不变量

### 3.1 作用域不能由模型覆盖

`projectId` 与 `worldGroupId` 只来自 `AgentToolExecutionContext`。工具 JSON 参数中不接受这两个字段：

- 单世界项目在需要世界作用域时归一为 `worldGroupId=null`；
- 多世界项目必须由工作区先明确选择世界；
- 章节、大纲节点、角色 ID 均要验证属于当前项目；
- 角色过滤还要验证当前世界可见性；
- 任何跨项目 ID 都返回失败，不给模型空结果伪装成成功。

### 3.2 所有 AI 可见读取都登记

原有世界观、角色、Canon、物品等继续复用既有 source。Agent 新增的四类读取也进入 `CONTEXT_SOURCES`：

- `projectStatus`：仅统计摘要；
- `worldGroups`：有界世界目录与连接；
- `outlineTree`：按当前世界过滤的有界树；
- `searchResults`：本地包含匹配的有界短摘。

Tool Registry 在模块初始化时验证每个 `sourceKey` 已登记，防止以后出现绕过注册表的静默读取。

### 3.3 输入预算公开

每个工具有独立 `inputBudgetTokens`。返回元数据必须包含：

- 实际 included / omitted / trimmed source；
- 估算输入 tokens；
- 预算；
- 裁剪前后是否超预算。

章节正文工具虽然允许较大预算，也只读作者明确指定的一章；项目搜索最多 10 条、每条最多 180 字短摘，不返回全库命中原文。

### 3.4 读、生成、写分离

Tool 定义声明 `risk: read | generate | write`。Phase 27.1-a 注册表只有 `read`。

后续生成工具必须落到现有 `GenerationNode`；写工具必须走 `adopt()` / `FIELD_REGISTRY` 或现有等价业务入口，并在前台显式确认。AgentRunner 只能编排这些既有执行单元，不能直接改表。

## 4. 后续顺序

1. **27.1-a（已完成）**：只读工具、作用域/预算/泄漏反例测试。
2. **27.1-b（已完成）**：使用严格、可验证的单步动作协议跑纯只读任务；原生 tools
   保留为后续优化。
3. **27.1-c（已完成）**：ChatCopilot UI；只接
   “当前世界来源候选 → 用户确认 → GenerationNode gate → adopt”的最小写闭环。
4. **27.1-d（已完成）**：灵感反推、角色、大纲和正文四个独立候选闭环均已逐领域
   设计和验收；写入继续由各领域 GenerationNode 与 adoption 边界负责。
5. **27.1-e（当前范围完成）**：已完成主 Agent 与五领域 per-role 模型/API 路由、五领域
   精简/均衡/完整上下文档位、候选实际输入证据、跨调用团队总预算和整轮一次受控
   确定性 Canon 打回；并行自治、模型投票与常驻后台仍不提前开放。

## 5. 验证要求

- 14 个工具集合稳定，全部为只读风险；
- 任何工具参数不能注入 `projectId/worldGroupId`；
- 跨项目章节/节点/角色/世界组不可读；
- 多世界未选世界不得执行世界级工具；
- 搜索命中数与短摘长度受限；
- 工具执行前后所有 `PROJECT_TABLES` 行数不变；
- `CONTEXT_SOURCES`、AI Manual、架构门禁、类型、回归测试全部通过。
