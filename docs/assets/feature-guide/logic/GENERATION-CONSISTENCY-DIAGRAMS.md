# StoryForge · 生成逻辑与长期一致性图集

> 基于《StoryForge · 生成逻辑与长期一致性运作 · 全局梳理》（2026-07-07）。
> 这份图集用于快速说明：正文怎么生成、长期一致性如何嵌入生成闭环、AI 与代码的职责边界、以及系统用哪些护栏稳住生成。

---

## 图 1 · 主生成管线

> 一条内容的一生：AI 写（软）→ AI 抽成结构（软）→ 作者确认（变硬 = canon）→ 代码核对新内容不违反它 + 它一变就传播失效（硬）。

```mermaid
flowchart LR
  start(("开始"))

  s1["① 触发<br/>用户点生成正文 / 续写<br/><b>入口：</b>ChapterEditor"]
  s2["② 上下文装配<br/><b>assembleContext(need)</b><br/>CONTEXT_SOURCES 按需拉取、分层、预算裁剪<br/><b>一致性的读入口</b>"]
  s3["③ Prompt 渲染<br/>renderPrompt(模板)<br/>chapter-adapter 连续性保护块"]
  s4["④ 生成<br/><b>软 / AI</b><br/>streamChat → LLM 流式产出正文"]
  s5["⑤ 采纳落库<br/><b>硬 / 结构化写回</b><br/>adopt() + FIELD_REGISTRY + ADOPTION_SCHEMAS<br/>类型 / 枚举 / FK / 去重校验"]
  s6["⑥ 反写记忆<br/><b>软抽取</b><br/>从新正文抽取结构<br/>沉淀进四层记忆"]
  s7["⑦ 校验<br/><b>软 + 硬混合</b><br/>LLM 一致性审校 + 确定性硬校验<br/>ReviewPanel 提示作者"]
  s8["⑧ 修改传播<br/><b>硬</b><br/>正文 hash 失效 + 影响分析<br/>派生记忆 stale / 后续章待复核"]

  start --> s1 --> s2 --> s3 --> s4 --> s5 --> s6 --> s7 --> s8
  s8 -. "下一章 / 下一轮生成" .-> s2

  classDef soft fill:#dbeafe,stroke:#2563eb,color:#111827
  classDef hard fill:#fee2e2,stroke:#dc2626,color:#111827
  classDef mixed fill:#fef3c7,stroke:#d97706,color:#111827
  classDef heart fill:#ecfccb,stroke:#65a30d,color:#111827

  class s2,s6 heart
  class s4 soft
  class s5,s8 hard
  class s7 mixed
```

---

## 图 2 · 四层记忆闭环

> 四层记忆都有写入点和读取点。第 ② 步装配负责读，第 ⑥ 步反写负责把新正文里的事实沉淀回记忆，下一轮再读回来。

```mermaid
flowchart TB
  read["② 读：上下文装配<br/>assembleContext + CONTEXT_SOURCES"]
  gen["④ 生成：正文 / 续写<br/>LLM 流式产出"]
  write["⑥ 写：反写记忆<br/>结构化抽取 + roll-up + 切块"]
  next["下一章 / 下一次生成"]

  subgraph memory["四层长期记忆"]
    A["A 章节交接<br/><b>写：</b>chapter.memory 抽取 continuityHandoff<br/><b>读：</b>chapterContinuityHandoff / previousChapterEnding<br/><b>性质：</b>抽取软，溯源硬"]
    B["B 层级摘要<br/><b>写：</b>narrativeSummaryNodes roll-up<br/><b>读：</b>recentChapterSummaries / 检索源内<br/><b>性质：</b>半硬，确定性 roll-up"]
    C["C 双层事实账本<br/><b>写：</b>fact-extract → temporalFacts 候选；作者确认 → canon<br/><b>读：</b>currentFacts + heldItems<br/><b>性质：</b>抽取软，投影 / 守卫硬"]
    D["D 原文检索<br/><b>写：</b>retrievalChunks + 可选 embedding<br/><b>读：</b>retrievedPassages 混合检索召回<br/><b>性质：</b>召回软，过滤硬"]
  end

  read --> gen --> write
  write --> A
  write --> B
  write --> C
  write --> D

  A --> read
  B --> read
  C --> read
  D --> read
  read --> next
  next -. "带着更新后的记忆继续" .-> read

  classDef core fill:#ecfccb,stroke:#65a30d,color:#111827
  classDef layerA fill:#e0f2fe,stroke:#0284c7,color:#111827
  classDef layerB fill:#fef9c3,stroke:#ca8a04,color:#111827
  classDef layerC fill:#fee2e2,stroke:#dc2626,color:#111827
  classDef layerD fill:#ede9fe,stroke:#7c3aed,color:#111827

  class read,gen,write,next core
  class A layerA
  class B layerB
  class C layerC
  class D layerD
```

---

## 图 3 · 软硬分界

> AI 负责创造和抽取；代码负责核对、簿记、结构、失效。作者确认是软 → 硬的闸门。

```mermaid
flowchart LR
  subgraph ai["AI 造零件 · 软 / 不确定"]
    ai1["正文生成 / 续写<br/>LLM chat / completions"]
    ai2["事实抽取<br/>正文 → 候选 temporalFacts"]
    ai3["状态 / 物品抽取"]
    ai4["摘要 / 交接抽取<br/>summary + handoff"]
    ai5["一致性审校<br/>找矛盾，提示作者"]
    ai6["语义检索向量<br/>embedding 可选"]
  end

  gate{"作者确认<br/>候选 → Canon"}

  subgraph code["代码车床 + 质检 · 硬 / 确定"]
    c1["章序解析<br/>resolveCanonicalChapterSequence"]
    c2["未来不泄漏 + 世界隔离<br/>retrieval.ts 硬过滤"]
    c3["当前有效事实投影<br/>readCurrentFacts"]
    c4["物品持有投影 + 硬校验<br/>consistency/held-items.ts"]
    c5["受控谓词守卫<br/>fact-predicate-registry.ts"]
    c6["写回校验<br/>adopt.ts + FIELD_REGISTRY + ADOPTION_SCHEMAS"]
    c7["引文逐字回查<br/>证据不存在则丢弃"]
    c8["hash / CAS 溯源<br/>正文变更 → 派生记忆 stale"]
    c9["上下文预算 / 分层裁剪<br/>保护块不删"]
    c10["影响传播<br/>consistency/impact-analysis.ts"]
  end

  ai1 --> gate
  ai2 --> gate
  ai3 --> gate
  ai4 --> gate
  ai5 --> gate
  ai6 --> gate
  gate --> c1
  gate --> c2
  gate --> c3
  gate --> c4
  gate --> c5
  gate --> c6
  gate --> c7
  gate --> c8
  gate --> c9
  gate --> c10

  classDef soft fill:#dbeafe,stroke:#2563eb,color:#111827
  classDef hard fill:#fee2e2,stroke:#dc2626,color:#111827
  classDef gate fill:#fef3c7,stroke:#d97706,color:#111827

  class ai1,ai2,ai3,ai4,ai5,ai6 soft
  class c1,c2,c3,c4,c5,c6,c7,c8,c9,c10 hard
  class gate gate
```

---

## 图 4 · 稳固生成护栏栈

> 护栏不是单一模块，而是沿着生成线分布：读之前过滤，写之前校验，写之后溯源，改动后传播。

```mermaid
flowchart BT
  fail["想防的失败<br/>剧透 / 串台 / 漂移 / 幻觉 / 重复获得 / 旧记忆污染 / 超窗乱截"]

  g1["上下文预算与保护块<br/>分层裁剪，L0 保护块不删<br/><b>防：</b>超窗乱截"]
  g2["hash / CAS 溯源<br/>来源正文变更即 stale<br/><b>防：</b>旧记忆继续当真"]
  g3["物品持有硬校验<br/>held-items 判定重复首次获得<br/><b>防：</b>物品重复获得"]
  g4["受控谓词 + adopt 校验<br/>表外字段丢弃，类型 / FK / 去重<br/><b>防：</b>自由造字段 / 谓词"]
  g5["引文逐字回查<br/>证据必须在原文中出现<br/><b>防：</b>幻觉证据"]
  g6["混合检索召回<br/>retrievedPassages<br/><b>防：</b>远距离矛盾"]
  g7["当前有效事实 + 持有物注入<br/>currentFacts + heldItems<br/><b>防：</b>状态漂移"]
  g8["worldGroupId 世界隔离<br/>只读同世界内容<br/><b>防：</b>多世界串台"]
  g9["未来章硬过滤<br/>只召回当前章之前内容<br/><b>防：</b>剧透"]

  stable["更稳的正文生成<br/>读得准，写得住，改得动"]

  fail --> g1 --> g2 --> g3 --> g4 --> g5 --> g6 --> g7 --> g8 --> g9 --> stable

  classDef risk fill:#f3f4f6,stroke:#6b7280,color:#111827
  classDef guard fill:#ecfccb,stroke:#65a30d,color:#111827
  classDef result fill:#dbeafe,stroke:#2563eb,color:#111827

  class fail risk
  class g1,g2,g3,g4,g5,g6,g7,g8,g9 guard
  class stable result
```

