# AGENT-1 Phase 27.1-e · 跨调用团队预算与确定性 Canon 打回

> 状态：已完成并通过完整交付验证（2026-07-27）。
> 稳定 ID：`AGENT-1-27.1-e-team-budget-canon-retry`。

## 1. 目标与非范围

角色级上下文档位只能约束单个领域读多少，不能阻止一次请求连续调用主 Agent、五个领域和
返工模型而累计失控。本增量把整轮执行放进同一个预算账本，并让现有确定性 gate 可以把
不合格候选携带具体证据打回原领域一次。

本增量做：

- 主 Agent 编排、五个领域生成和 Canon 返工共享跨调用 token / 次数预算；
- 每次调用前按冻结消息估算输入，并预留该领域最大输出；最坏预算不足时调用前停止；
- 模型实际返回后用冻结输入与真实输出文本更新本轮估算；
- GenerationNode gate 与已有物品持有连续性判决可触发一次整轮级受控打回；
- 候选与对话显示本轮估算 token、调用次数和 Canon 打回次数。

本增量不做：

- 不并行调用、不投票、不启用无限或逐任务重试；
- 网络、协议、解析和普通模型错误不自动重试；
- 不把 LLM 自评、向量相似度或软审校冒充 Canon 硬判决；
- 不自动采纳，不改变候选确认、并发快照或 `adopt()` 写回边界；
- 不新增业务表、迁移、项目导出字段或 API Key 生命周期。

## 2. 三档团队总预算

| 档位 | 单轮估算上限 | 模型调用上限 | Canon 打回上限 |
|---|---:|---:|---:|
| 节省 | 80K tokens | 7 | 1 |
| 均衡（默认） | 160K tokens | 7 | 1 |
| 充分 | 240K tokens | 7 | 1 |

配置键为 `storyforge-agent-team-budget-profile`，只属于当前设备 AI 执行偏好。未知值自动回退
均衡。七次调用覆盖一次主 Agent、最多五个互异领域和一次受控返工；规划器仍会把同领域
批量目标合并，不能通过拆任务绕过次数上限。

调用前判定：

```text
已用估算 + 冻结消息估算输入 + 本领域最大输出预留 <= 本轮上限
```

不满足时不会发起该请求，因此不会产生该次 API 费用。候选显示的是本地一致口径估算；
provider 返回的精确 usage 继续由 `aiUsageLog` 保存和展示，两者不混称。

## 3. 确定性打回

```text
领域生成
  → GenerationNode gate
  → 可直接复用的零 token Canon validator
  → 通过：形成可见候选
  → 阻断：冻结 issue code + message
      → 领取整轮唯一返工机会
      → 团队预算再次预检
      → 原消息 + 明确冲突证据回到同一领域模型
      → 再次确定性校验
```

当前纳入：

- 五领域原有结构、空值、重复、无变化和边界 gate；
- 大纲 / 正文对 `itemLedger` 当前持有投影的“再次获得”确定性检查，复用
  `readProjectHeldItems()` 与 `checkHeldItemAcquisition()`。

当前没有纳入自动硬判：

- 需要额外 LLM 提取逐字引用的角色认知、存亡活动与世界宪法 claim；
- 缺少规范章节边界的卷纲级物品时序；
- 无法由闭集和逐字证据确定的风格、动机与剧情质量判断。

这些能力仍可进入后续一致性 Agent 或作者审校，但不能在本轮伪装成零 token 硬门。

## 4. 持久化与恢复

- 团队档位保存在 localStorage，不跟项目走；
- 每个候选保存最终 `teamBudgetEvidence`，随 `agentEvents` 进入项目备份；
- evidence 只含档位、上限、估算量、调用和打回计数，不复制提示词、项目上下文或密钥；
- 候选刷新恢复后仍可解释本轮成本；确认仍对作者眼前的可编辑候选重新跑原 gate。

## 5. 验证结果

- 纯函数反例覆盖三档闭集、调用前预算阻断、调用次数和整轮唯一打回；
- 运行器反例证明第一版被 gate / 外部 validator 打回，第二版通过后才形成候选；
- 设置存储与 Chromium 刷新恢复团队档位；
- Chromium 主 Agent 闭环强制第一版失败，验证 3 次调用、1 次打回、候选可见和拒绝零写入；
- 完整 `npm run ci` 通过：235 个 Vitest 文件 / 857 项测试，coverage statements/lines
  73.55%、branches 73.30%、functions 72.47%；55 张 required tables、AI Manual、
  architecture、502 个可达源码文件、roadmap、agent context、canon、project metrics、
  production dependency audit 0 vulnerabilities、ESLint、TypeScript、生产 build 与
  bundle budget 全绿；
- 完整 Chromium E2E 24/24 通过；
- 真实 Agnes 隔离项目使用节省团队档位与精简世界上下文：主 Agent + 世界 Agent 恰好
  2 次调用，候选显示 `4,545 / 80,000 tokens`、`2/7` 次调用、`Canon 打回 0/1`，
  上下文证据为 `≈93 tokens`。拒绝后世界来源仍为空；设置已恢复默认，隔离项目已删除。
