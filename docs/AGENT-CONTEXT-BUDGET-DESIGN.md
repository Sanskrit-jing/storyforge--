# AGENT-1 Phase 27.1-e · 团队角色上下文预算与输入证据

> 状态：已完成并通过完整交付验证（2026-07-27）。
> 稳定 ID：`AGENT-1-27.1-e-context-budget`。

## 1. 目标与边界

多 Agent 不能把“每个领域都读一遍尽可能多的项目资料”当作项目级理解。世界、角色、灵感、
大纲和正文仍需读取完整关联闭包，但必须让作者决定每个领域的输入强度，并在候选上看见
实际纳入了什么、裁掉了什么、估算用了多少上下文。

本增量只做：

- 五个幕后领域分别保存 `精简 / 均衡 / 完整` 上下文档位；
- 档位在 `CONTEXT_SOURCES → assembleContext()` 内收窄登记源预算；
- 领域候选保存并展示实际 included / omitted / trimmed、上下文 token 估算和上限；
- 默认 `均衡`，`完整` 保持此前登记源上限。

不做并行调用、模型投票、自动重试、Canon 自动打回、长期后台 Agent 或静默写入。

## 2. 档位与上限

| 领域 | 精简 | 均衡（默认） | 完整 |
|---|---:|---:|---:|
| 世界来源 | 9K | 14K | 19.4K |
| 角色 | 13K | 20K | 28.5K |
| 灵感 | 5K | 8K | 11K |
| 大纲 | 18K | 32K | 48K |
| 正文 | 24K | 42K | 64K |

- 精简、均衡、完整分别使用登记源软上限的 45%、72%、100%。
- 上表是领域上限，不是强制消费量；实际预算始终取“领域上限、模型可用输入窗口”的较小值。
- 比例在装配层硬夹到 10%–100%，不能通过本地配置把某个源放大到注册表预算以上。
- L0、protected、scope、世界/章节归属和既有 source enabled 规则不变；预算档位不能绕过
  项目级安全边界。

## 3. 配置生命周期

- 配置键：`storyforge-agent-context-profiles`。
- 与 AI 连接预设和角色模型路由相同，属于当前设备的 AI 执行偏好，不进入项目 Canon、
  IndexedDB、项目 JSON 或 API Key 生命周期。
- 旧配置没有该键时自动补成五个 `balanced`；未知角色和未知档位被 sanitizer 丢弃。
- 手工分步骤面板继续使用原上下文行为；档位只在主 Agent 派发领域任务时生效。

## 4. 执行与证据

```text
AI 设置中的领域档位
  → resolveAgentContextPolicy()
  → Agent tool / assembleContext()
  → 模型窗口 ∩ 领域总上限 ∩ 登记源比例上限
  → 领域模型请求
  → AgentContextEvidence 写入 candidate event payload
  → 主 Agent 候选卡显示实际证据
```

`AgentContextEvidence` 保存：

- profile；
- included / omitted / trimmed source key；
- estimatedInputTokens；
- inputBudgetTokens。

这里显示的是正式上下文装配结果，不冒充 API 返回的精确 prompt token。完整 API 用量仍由
`aiUsageLog` 记录；候选刷新恢复后证据不会丢失，也不会保存 API Key 或复制整段项目资料。

## 5. 验证结果

- sanitizer、三档单调性、领域硬上限、单源比例夹取、同角色多次读取共享总预算和 evidence
  合并均有纯函数反例测试；
- Tool Registry 和五领域仍只从登记源读取；正文领域回归验证精简档真实进入装配、冻结
  evidence 且 Canon 零写入；
- 设置页验证五个领域档位独立保存并刷新恢复；主 Agent Chromium 闭环验证候选卡可见
  档位、token 估算和实际输入证据；
- 完整 `npm run ci` 通过：234 个 Vitest 文件 / 851 项测试，coverage statements/lines
  73.55%、branches 73.30%、functions 72.47%；55 张 required tables、AI Manual、
  architecture、source reachability、roadmap、agent context、canon、project metrics、
  production dependency audit 0 vulnerabilities、ESLint、TypeScript、生产 build 和
  bundle budget 全绿；
- 完整 Chromium E2E 24/24 通过；
- 真实 Agnes 隔离项目只调用主 Agent 和世界 Agent 两次。世界领域选择精简档后，候选卡
  显示 `精简 · ≈93 tokens`，展开证据显示 `93 / 9,000 tokens`、1 个实际输入来源；拒绝
  候选后世界来源正式数据仍为空。验证后角色路由与档位已恢复默认，隔离项目已完整删除。
