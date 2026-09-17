# 贡献指南 · Contributing to StoryForge

感谢你愿意为 StoryForge 贡献!

---

## 🔒 第一要务:按任务读取项目约束

先读短入口 [`AGENTS.md`](./AGENTS.md)，再按
[`docs/CONTEXT-ROUTING.md`](./docs/CONTEXT-ROUTING.md) 定位本次任务所需的宪法、
路线图、Blueprint 段落、源码和测试。不要把文档地图当作全文预载清单。

详细宪法 [`CLAUDE.md`](./CLAUDE.md) 包含:

- **三注册表铁律**:所有 AI 读写与数据生命周期必须走三个单一事实源
  - `CONTEXT_SOURCES` + `assembleContext()` —— AI 读什么
  - `FIELD_REGISTRY` + `adopt()` —— AI 写什么
  - `PROJECT_TABLES` —— 表的生命周期(导出/导入/删除/迁移)
- **动手前的「四问」**:读什么 / 写什么 / 涉及哪些表的生命周期 / 注册表里没登记怎么办
- **反面教材**:不要"头疼医头"

这套机制由 CI 自动守护(`npm run check:architecture`),违反则 PR 无法合并。

---

## 🚀 本地开发

```bash
npm install
npm run dev          # 启动开发服务器
```

数据全在浏览器 IndexedDB(纯前端,无后端)。

---

## ✅ 提交前必跑(本地 CI)

```bash
npm run ci
```

它会依次跑:

| 步骤 | 作用 |
|---|---|
| `check:required-tables` | 表注册与 schema 一致 |
| `check:ai-manual` | AI 说明书与代码一致(防 prompt key 漂移) |
| `check:architecture` | 三注册表铁律(防"屎山复发") |
| `check:agent-context` | 短入口与按任务路由防回退 |
| `check:canon-coverage` | 一致性覆盖地图与反例状态对齐 |
| `check:source-reachability` | 生产源码可达性 |
| `check:roadmap` | 路线图归属与历史快照 |
| `check:project-metrics` | Blueprint 实时指标 |
| `check:dependencies` | 生产依赖安全审计 |
| `tsc --noEmit` | TypeScript 严格类型 |
| `test:coverage` | 测试 + 覆盖率门槛 |
| `build` | 生产构建 |

任意一项失败,GitHub Actions 同样会红,PR 不予合并。

---

## 📐 加新功能的标准流程

按 CLAUDE.md「四问」走:

1. **加新表** → 在 `src/lib/registry/project-tables.ts` 加一行(生命周期自动覆盖)
2. **加新 AI 可写字段** → 在 `src/lib/registry/field-registry.ts` 加一行(adopt 自动校验)
3. **加新上下文源** → 在 `src/lib/registry/context-sources.ts` 加一行(并写测试)
4. **加新 AI 动作** → 走 `assembleContext()` 读 + `adopt()` 写,不直接调 `db.xxx.add/update`
5. **改 AI 行为** → 改 prompt 后跑 `npm run gen:ai-manual` 重新生成说明书

> ⚠️ 任何"直接调底层 db / 手挑上下文组合 / 手写字段映射"的写法,code review 会拒绝。

---

## 🧪 测试约定

- 数据正确性关键路径必须有测试:`tests/regression/`(反例测试,一个 bug 一条断言)+ `tests/registry/`(注册表/解析器单测)。
- 覆盖率门槛聚焦核心逻辑层(registry/db/export/import/ai 解析装配);UI 组件不强制单测。
- 修 bug 时,先写一条会失败的反例测试,再修到它变绿(测试驱动)。

---

## 🌳 分支与提交

- 分支命名:`feat/xxx` / `fix/issue-N` / `refactor/xxx`
- **不要直接 push `main`**(纯前端 + 自动部署,main 即生产)
- 一个 PR 只解决一件事
- Commit message 写清楚:做了什么 + 为什么 + 验证结果

---

## ⚠️ 这是有真实用户的生产项目

- 用户数据全在浏览器 IndexedDB
- 任何 DB schema 变更 / 删除逻辑 = 可能损坏用户手稿
- 改动数据相关代码时务必有反例测试 + 真实数据实测

---

## 📚 文档地图

| 文档 | 用途 |
|---|---|
| `AGENTS.md` | 自动加载的短入口 |
| `docs/CONTEXT-ROUTING.md` | 按任务选择上下文 |
| `CLAUDE.md` | 详细项目宪法 |
| `docs/MASTER-BLUEPRINT.md` | 有对应任务 ID 时读取相关施工段落 |
| `docs/AI-FUNCTIONS-MANUAL.generated.md` | AI 行为清单(自动生成) |
| `docs/DATA-FLOW-DIAGRAM.md` | 数据流可视化 |
| `docs/roadmap/README.md` | 当前与未来路线图 |
| `docs/roadmap/CAPABILITY-BASELINE.md` | 当前能力基线（新功能读取对应体系） |
| `docs/roadmap/COMPLETED.md` | 已完成开发索引 |

---

## 🐛 报告 Bug / 提需求

走 GitHub Issue,或加 QQ 群 `1082374587` 交流。Bug 报告请尽量附:复现步骤、浏览器版本、IndexedDB 截图(若涉及数据)。

谢谢你让 StoryForge 变得更好 🙏
