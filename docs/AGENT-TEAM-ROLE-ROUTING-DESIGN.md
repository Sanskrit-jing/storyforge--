# AGENT-1 Phase 27.1-e · 主 Agent 团队角色模型路由

> 状态：首个增量已完成并通过完整交付验证（2026-07-27）。本增量只解决主 Agent 团队
> per-role 模型 / API 选择，不宣称并行自治、输入权重、Canon 自动打回或长期后台 Agent
> 已完成。

## 1. 用户故事与边界

- **稳定 ID**：`AGENT-1-27.1-e-role-routing`。
- 作者仍然只面对工作区右栏的唯一主 Agent；不会出现世界、角色、大纲或正文分 Agent
  标签页。
- 作者可在既有 AI 设置中先保存多个连接预设，再分别绑定主 Agent 编排、世界、角色、
  灵感、大纲和正文六个幕后角色。
- 未绑定角色继续使用当前全局模型；预设被删除或缺少可用 API Key 时，沿用既有安全回退，
  不阻断老配置。

## 2. 路由单一入口

```text
主 Agent 请求
  → agent.orchestrator
  → agent-orchestrator 预设

领域任务
  → agent.world-origin / character / inspiration / outline / prose
  → 对应 agent-* 预设
  → 用实际 provider/model 装配正式上下文
  → 调模型并记录实际 provider/model/taskKind
```

- 路由继续只由 `resolveAIConfigForTask()` 在共享 AI client 边界解析；没有在各领域自建
  HTTP 客户端或复制密钥。
- 五个领域的 `prepare*Copilot()` 在读取 `CONTEXT_SOURCES` 前先解析角色配置，使上下文
  预算、裁剪和实际请求使用同一个 provider/model，而不是按全局模型装配后再偷偷换模型。
- 手工世界观、角色、大纲、正文和灵感入口仍使用原来的 `creation` 等四类通用路由；
  `agent.*` 角色路由只影响主 Agent 幕后调用。

## 3. 配置与数据生命周期

- 复用已有 AI 预设和 `storyforge-ai-task-routes` 本地配置，不新增 IndexedDB 表、schema、
  迁移、项目导出格式或内容写入字段。
- 旧四类 route JSON 可直接加载；未知未来键由 `sanitizeAITaskRoutes()` 丢弃。
- 删除预设会同步清除所有通用与 Agent 角色绑定。
- API Key 的持久化、session-only 和空 key 本地提供商规则完全复用现有配置 store。
- 使用量仍写标准 `aiUsageLog`，记录实际 provider、model 和六类 Agent taskKind。

## 4. 当前非范围

- 不让无依赖任务并行请求，避免默认提高 BYOK 并发、速率限制和成本。
- 不开放任意自定义 Agent 名称；只有已闭环且有正式读写边界的五个领域。
- 不实现输入权重调节、跨 Agent Canon 自动打回、自动重试或模型投票。
- 不实现事件触发、打开补算、NPC 演进或任何后台自动写入。
- 不改变所有候选可见、作者确认后才写入的现有安全线。

## 5. 验证入口

- `R-CF20260702-10-task-routing`：十类路由识别、六角色独立预设、旧配置兼容、删除清理和
  真实 client 用量记录。
- `R-AUDIT6-ai-config-sections`：四类通用任务与六个团队角色分区显示和交互。
- `R-AGENT2-main-orchestrator`：主 Agent 规划实际使用编排预设并记录真实模型。
- `R-AGENT1-chat-copilot-prose`：正文角色按专用 provider/model 生成，正式正文仍零写入
  直到作者采纳。
- Chromium：设置两个已有预设，分别绑定通用任务、主 Agent 编排和正文角色，刷新后完整
  恢复。

## 6. 交付验证

- 完整 `npm run ci` 通过：233 个 Vitest 文件 / 844 项测试，coverage
  statements/lines 73.53%、branches 73.22%、functions 72.47%；55 required tables、
  AI Manual、architecture、source reachability、roadmap、agent context、canon coverage、
  project metrics、production dependency audit、ESLint、TypeScript、生产 build 与 bundle
  budget 全绿。
- 完整 Chromium E2E 24/24 通过；设置用例验证主 Agent 编排和正文角色绑定独立预设并在
  刷新后恢复。
- 真实 Agnes 隔离项目中，用户只面对一个主 Agent；编排模型规划恰好 1 个角色任务，
  角色模型返回可见 JSON 候选。使用量恰好新增 2 次 `Agent 团队` 调用，分别记录
  `agent-orchestrator` 和 `agent-character` 的实际 Agnes provider/model。
- 候选被拒绝后角色正式数据仍为 0 行；两条测试路由已恢复为“使用当前全局模型”，隔离
  项目随后通过完整删除安全门清理。
