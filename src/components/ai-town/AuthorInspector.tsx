import { useEffect, useState } from "react";
import type { WorkspaceScope, ProductRuntimePackageV1 } from "../../lib/types";
import {
  readProductProductionDetailsV1,
  beginProductProductionEvolutionV1,
} from "../../lib/product-production/service";
import { verifyProductBuildPreviewManifestV1 } from "../../lib/product-production/preview-manifest";
import { createBuildProductMediaResolver } from "../../lib/product-production/media-resolver";
export default function AuthorInspector({
  scope,
  productionId,
  page,
  onProduction,
}: {
  scope: WorkspaceScope | null;
  productionId: number | null;
  page: string;
  onProduction: () => void;
}) {
  const [pkg, setPkg] = useState<ProductRuntimePackageV1 | null>(null),
    [details, setDetails] = useState<Awaited<
      ReturnType<typeof readProductProductionDetailsV1>
    > | null>(null),
    [error, setError] = useState(""),
    [request, setRequest] = useState(""),
    [busy, setBusy] = useState(false),
    [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    const created: string[] = [];
    setPkg(null);
    setDetails(null);
    setError("");
    setUrls({});
    if (scope && productionId)
      void (async () => {
        const d = await readProductProductionDetailsV1(scope, productionId, [
          "ai-town",
        ]);
        if (!active) return;
        setDetails(d);
        if (!d.build?.previewManifestJson) return;
        const p = await verifyProductBuildPreviewManifestV1(
          d.build.previewManifestJson,
        );
        if (!active) return;
        setPkg(p.runtimePackage);
        const resolver = await createBuildProductMediaResolver({
          scope,
          productBuildId: d.build.id!,
          preview: p,
        });
        const result: Record<string, string> = {};
        try {
        for (const asset of p.runtimePackage.presentation?.assets ?? []) {
          const blob = await resolver.read(asset.assetKey);
          if (blob) {
            const url = URL.createObjectURL(blob);
            created.push(url);
            result[asset.assetKey] = url;
          }
        }
        if (active) setUrls(result);
        else created.forEach((u) => URL.revokeObjectURL(u));
        } finally { resolver.dispose(); }
      })().catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [scope, productionId, page]);
  const campaign = pkg?.town;
  const collections: Array<[string, unknown[]]> = campaign ? page==='characters' ? [['居民',campaign.residents],['初始关系',campaign.relationships.map(edge=>({...edge,title:`${campaign.residents.find(r=>r.residentKey===edge.fromResidentKey)?.name??edge.fromResidentKey} → ${edge.toResidentKey==='player'?'玩家':campaign.residents.find(r=>r.residentKey===edge.toResidentKey)?.name??edge.toResidentKey}`}))]] : page==='schedule' ? [['居民日程',campaign.residents.map(r=>({name:r.name,schedule:r.schedule}))],['生活事件',campaign.eventSeeds],['生活线',campaign.lifeThreads]] : page==='media' ? [['地点',campaign.map.locations],['道路',campaign.map.routes],['共同项目',[campaign.economy.sharedProject]]] : [] : [];
  return (
    <>
      <section className="lf-paper">
        <h3>
          {page === "characters"
            ? "居民档案"
            : page === "schedule"
              ? "日程与事件"
              : page === "media"
                ? "小镇与设施"
                : "素材管理"}
        </h3>
        <p>
          这里读取当前制作版本的真实内容。作者检查包含居民设定与知识边界，游玩者只接收自己的可见内容。
        </p>
        {error && <p role="alert">{error}</p>}
        {!campaign ? (
          <>
            <p>
              还没有可检查的制作产物。先准备方案并执行制作；生成失败时可在制作流程查看原始草稿并修复。
            </p>
            <button className="lf-action" onClick={onProduction}>
              查看制作流程
            </button>
          </>
        ) : (
          <>
            {collections.map(([label, list]) => (
              <section key={String(label)}>
                <h4>{String(label)}</h4>
                {(list as unknown as Record<string, unknown>[]).map(
                  (item, i) => (
                    <details key={i} className="town-object">
                      <summary>
                        {String(item.title ?? item.name ?? `条目 ${i + 1}`)}
                      </summary>
                      {Object.entries(item)
                        .filter(
                          ([k]) => !k.endsWith("Key") && !k.endsWith("Keys"),
                        )
                        .map(([k, v]) => (
                          <div key={k}>
                            <strong>
                              {(
                                {
                                  description: "描述", summary:"简介", migrationReason:"来到小镇的原因",identityLocks:"身份约束",voiceRules:"说话风格",schedule:"日程",startingKnowledge:"初始知识（作者可见）",goals:"生活目标",activity:"活动",slot:"时段",category:"类别",cooldownDays:"冷却天数",minimumDay:"最早发生日",eligibleSlots:"可发生时段",intensity:"强度",openSlots:"开放时段",capacity:"容量",tags:"标签",targetProgress:"目标进度",title:"名称", initialStage:"初始阶段", travelSlots:"行程时段", bidirectional:"双向通行",
                                  truth: "真相",
                                  pitch: "梗概",
                                  epilogue: "尾声",
                                  body: "内容",
                                  goal: "目标",
                                  visibility: "可见范围",
                                  controller: "控制者",
                                  attributes: "属性",
                                  resources: "资源",
                                  revealRule: "揭示规则",
                                  sourceRefs: "来源",
                                  role: "角色", name:"姓名", trust:"信任",intimacy:"亲近",wariness:"戒备",reason:"缘由",evidenceRefs:"依据",
                                } as Record<string, string>
                              )[k] ?? k}
                            </strong>
                            <div className="town-object-value">
                              {k==='schedule' && Array.isArray(v) ? <table><thead><tr><th>时段</th><th>地点</th><th>活动</th></tr></thead><tbody>{(v as import('../../lib/types').AiTownScheduleEntryV1[]).map((entry,index)=><tr key={index}><td>{{morning:'早上','late-morning':'上午',noon:'中午',afternoon:'下午',evening:'晚上',midnight:'午夜'}[entry.slot]}</td><td>{campaign.map.locations.find(l=>l.key===entry.locationKey)?.title??'未识别地点'}</td><td>{entry.activity}</td></tr>)}</tbody></table>
                              : k==='startingKnowledge' && Array.isArray(v) ? <ul>{(v as Array<{statement:string;visibility:string}>).map((fact,index)=><li key={index}>{fact.statement} · {{public:'公开',private:'私密',secret:'秘密'}[fact.visibility]??fact.visibility}</li>)}</ul>
                              : typeof v==='boolean' ? (v?'是':'否') : Array.isArray(v)&&v.every(item=>typeof item==='string') ? <ul>{v.map((text,index)=><li key={index}>{text}</li>)}</ul> : typeof v==='string' ? v : JSON.stringify(v,null,2)}
                            </div>
                          </div>
                        ))}
                    </details>
                  ),
                )}
              </section>
            ))}
            {["media", "media-all"].includes(page) && (
              <div className="lf-library-grid">
                {(pkg.presentation?.assets ?? []).map((a) => (
                  <article key={a.assetKey}>
                    <h4>{a.name}</h4>
                    {urls[a.assetKey] && a.mimeType.startsWith("image/") ? (
                      <img src={urls[a.assetKey]} alt={a.name} />
                    ) : null}
                    {urls[a.assetKey] && a.mimeType.startsWith('audio/') && <audio controls src={urls[a.assetKey]}/>}
                    {!urls[a.assetKey] && <p>此素材暂不可用，请到制作流程检查。</p>}
                    <p>
                      {a.kind} · {a.source}
                    </p>
                    <p>许可：{a.license}</p>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>
      {campaign && (
        <section className="lf-paper">
          <h3>修订这一版</h3>
          <p>
            写明需要修改的地点、居民、日程或素材。确认后创建新的制作轮次，再到制作流程授权执行并检查结果；当前发布与已有存档保持原版本。
          </p>
          <textarea
            aria-label="小镇内容修订要求"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            maxLength={10000}
          />
          <button
            className="lf-action"
            disabled={busy || !request.trim()}
            onClick={() => {
              if (!scope || !productionId || !details) return;
              setBusy(true);
              void beginProductProductionEvolutionV1({
                scope,
                productionId,
                expectedStateRevision: details.production.stateRevision,
                userText: request,
                affectedLanes:
                  page === "media-all" ? ["visual", "audio"] : ["content", "product", "visual"],
              })
                .then(onProduction)
                .catch((e) => setError(String(e)))
                .finally(() => setBusy(false));
            }}
          >
            创建修订轮次
          </button>
          <p>若当前生成失败，可在制作流程提交作者校订稿并经过原校验链重试。</p>
        </section>
      )}
    </>
  );
}
