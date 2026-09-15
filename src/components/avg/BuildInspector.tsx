import { useEffect, useRef, useState } from "react";
import type {
  WorkspaceScope,
  ProductRuntimePackageV1,
  AvgPresentationCue,
  ProductMediaKind,
  ProductMediaResolverV1,
} from "../../lib/types";
import { AVG_CUE_TYPES } from "../../lib/types/avg";
import { readProductProductionDetailsV1 } from "../../lib/product-production/service";
import { verifyProductBuildPreviewManifestV1 } from "../../lib/product-production/preview-manifest";
import { createBuildProductMediaResolver } from "../../lib/product-production/media-resolver";
import { ensureAvgProductionDraftV1 } from "../../lib/avg/draft-service";
import {
  saveAvgEditorV1,
  importAvgMediaV1,
  readAvgDraftMediaV1,
  validateAvgEditorV1,
} from "../../lib/avg/editor-service";
import { prepareAvgRevisionV1 } from "../../lib/avg/revision-production";
const CUES: Record<string, string> = {
  "set-background": "设置背景",
  "clear-background": "清除背景",
  "set-overlay": "设置叠加图",
  "clear-overlay": "清除叠加图",
  "show-actor": "角色登场",
  "hide-actor": "角色离场",
  "show-cg": "展示 CG",
  "clear-cg": "清除 CG",
  "move-actor": "移动角色",
  "set-tone": "色调",
  "play-audio": "播放音频",
  "stop-audio": "停止音频",
  transition: "转场",
  wait: "等待",
  camera: "镜头",
  shake: "震动",
  flash: "闪光",
  mask: "遮罩",
  "restore-snapshot": "恢复舞台快照",
};
const KINDS: Record<string, string> = {
  background: "背景",
  "character-pose": "角色立绘",
  "character-expression": "角色表情",
  cg: "CG",
  ui: "叠加图",
  bgm: "背景音乐",
  ambience: "环境音",
  sfx: "音效",
  voice: "配音",
};
function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [text, setText] = useState(JSON.stringify(value, null, 2)),
    [error, setError] = useState("");
  useEffect(() => setText(JSON.stringify(value, null, 2)), [value]);
  return (
    <label>
      {label}
      <textarea
        aria-label={label}
        className="avg-editor-json"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          try {
            onChange(JSON.parse(text));
            setError("");
          } catch {
            setError("格式有误，尚未保存此字段");
          }
        }}
      />
      {error && <span role="alert">{error}</span>}
    </label>
  );
}
export default function BuildInspector({
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
    [baseHash, setBaseHash] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [selected, setSelected] = useState(""),
    [urls, setUrls] = useState<Record<string, string>>({});
  const draftUrls=useRef<string[]>([])
  useEffect(()=>()=>draftUrls.current.forEach(url=>URL.revokeObjectURL(url)),[])
  const saveFailure=useRef("")
  const revision = useRef(0),
    queue = useRef(Promise.resolve()),
    [saving, setSaving] = useState(false);
  const [uploadKind, setUploadKind] = useState<ProductMediaKind>("background"),
    [license, setLicense] = useState(""),
    [character, setCharacter] = useState("");
  useEffect(() => {
    let active = true;
    let resolver: ProductMediaResolverV1 | undefined;
    setPkg(null);
    setError("");
    if (!scope || !productionId) return;
    setLoading(true);
    void (async () => {
      const d = await readProductProductionDetailsV1(scope, productionId, [
        "avg",
      ]);
      if (!d.build?.previewManifestJson) {
        setNotice("尚未生成可编辑版本；请先完成制作。");
        return;
      }
      const preview = await verifyProductBuildPreviewManifestV1(
        d.build.previewManifestJson,
      );
      const draft=await ensureAvgProductionDraftV1(scope,productionId);
      if (!active) return;
      revision.current = draft?.revision ?? 0;
      setBaseHash(preview.previewHash);
      const restored =
        draft?.editorPreviewHash === preview.previewHash && draft.editorJson
          ? (JSON.parse(draft.editorJson) as ProductRuntimePackageV1)
          : preview.runtimePackage;
      setPkg(restored);
      setSelected(restored.narrative.nodes[0]?.key ?? "");
      setNotice(
        draft?.editorJson && draft.editorPreviewHash !== preview.previewHash
          ? "旧编辑草稿属于先前版本；当前显示新版本，旧草稿仍保留在备份中。"
          : "编辑会保存草稿；提交修订后，需再次明确开始制作与验收。",
      );
      resolver = await createBuildProductMediaResolver({
        scope,
        productBuildId: d.build.id!,
        preview,
      });
      if(!active){resolver.dispose();return}
      const media = await resolver.preload({
        assetKeys: (preview.runtimePackage.presentation?.assets ?? []).map(
          (a) => a.assetKey,
        ),
        maximumBytes: 128 * 1024 * 1024,
      });
      if (active) {
        const extra:Record<string,string>={}
        for(const asset of restored.presentation?.assets??[]){if(media.urls[asset.assetKey])continue;try{const bytes=await readAvgDraftMediaV1(scope,asset);const url=URL.createObjectURL(new Blob([bytes],{type:asset.mimeType}));draftUrls.current.push(url);extra[asset.assetKey]=url}catch{/* The following missing-resource notice keeps this visible. */}}
        setUrls({...media.urls,...extra});
        if (media.failures.length)
          setError(
            media.failures.map((f) => `${f.assetKey}：${f.reason}`).join("；"),
          );
      }
    })()
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      void resolver?.dispose();
    };
  }, [scope?.projectId, scope?.workId, productionId]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (edit: (next: ProductRuntimePackageV1) => void) => {
    if (!pkg || !scope) return;
    const next = structuredClone(pkg);
    edit(next);
    setPkg(next);
    setSaving(true);
    queue.current = queue.current
      .then(async () => {
        const row = await saveAvgEditorV1(
          scope,
          revision.current,
          baseHash,
          next,
        );
        revision.current = row.revision;
        setNotice("编辑草稿已保存");
      })
      .catch((e) => {saveFailure.current=String(e);setError(String(e))})
      .finally(() => setSaving(false));
  };
  const submit = async () => {
    if (!pkg || !scope || !productionId) return;
    setBusy(true);
    setError("");
    try {
      await queue.current;
      if(saveFailure.current)throw new Error("编辑尚未成功保存，请刷新解决冲突后提交。")
      validateAvgEditorV1(pkg);
      await prepareAvgRevisionV1({
        scope,
        productionId,
        expectedPreviewHash: baseHash,
        runtimePackage: pkg,
      });
      onProduction();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file: File) => {
    if (!scope || !pkg) return;
    setBusy(true);
    setError("");
    try {
      const asset = await importAvgMediaV1({
        scope,
        data: await file.arrayBuffer(),
        mimeType: file.type,
        name: file.name,
        kind: uploadKind,
        license,
        altText: file.name,
        characterTag: character,
      });
      change((next) => {
        next.presentation ??= { version: 1, cues: [], assets: [] };
        next.presentation.assets.push(asset);
      });
      const url = URL.createObjectURL(file);
      draftUrls.current.push(url);
      setUrls((v) => ({ ...v, [asset.assetKey]: url }));
      setNotice("素材已保存；在演出中绑定到对应对白后提交修订。");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const node = pkg?.narrative.nodes.find((n) => n.key === selected);
  const beats =
    pkg?.narrative.beats.filter((b) => b.nodeKey === selected) ?? [];
  const field = (
    label: string,
    value: string,
    edit: (next: ProductRuntimePackageV1, value: string) => void,
    area = false,
  ) => (
    <label>
      {label}
      {area ? (
        <textarea
          aria-label={label}
          value={value}
          onChange={(e) => change((n) => edit(n, e.target.value))}
        />
      ) : (
        <input
          aria-label={label}
          value={value}
          onChange={(e) => change((n) => edit(n, e.target.value))}
        />
      )}
    </label>
  );
  const patchCue = (key: string, patch: Partial<AvgPresentationCue>) =>
    change((n) => {
      const cue = n.presentation?.cues.find((c) => c.cueKey === key);
      if (cue) Object.assign(cue, patch);
    });
  return (
    <section className="lf-paper">
      <h3>
        {page === "narrative"
          ? "叙事图与对白"
          : page === "variables"
            ? "变量与结局"
            : page === "audio"
              ? "音频与演出"
              : "视觉与素材"}
      </h3>
      {error && (
        <p className="avg-alert" role="alert">
          {error}
        </p>
      )}
      <p role="status">
        {loading ? "读取真实制作产物…" : saving ? "保存编辑中…" : notice}
      </p>
      {!pkg ? (
        <>
          <p>
            制作完成后，这里展示本作品的剧情、分支、对白与素材。现在可以先填写方案或查看制作流程。
          </p>
          <button className="lf-action" onClick={onProduction}>
            查看制作流程
          </button>
        </>
      ) : (
        <>
          <div className="avg-actions">
            <button
              className="lf-action lf-action-primary"
              disabled={busy || saving}
              onClick={() => void submit()}
            >
              提交为新版本方案
            </button>
            <button
              className="lf-action"
              disabled={busy || saving}
              onClick={() => {
                try {
                  validateAvgEditorV1(pkg);
                  setNotice("结构与引用检查通过；请继续提交修订并试玩验收。");
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              检查当前编辑
            </button>
          </div>
          {page === "narrative" ? (
            <>
              <div className="avg-graph" aria-label="叙事节点">
                {pkg.narrative.nodes.map((n) => (
                  <button
                    key={n.key}
                    aria-pressed={selected === n.key}
                    onClick={() => setSelected(n.key)}
                  >
                    {n.title}
                    <small className="block">
                      {n.kind === "ending"
                        ? "结局"
                        : n.kind === "entry"
                          ? "开场"
                          : n.kind === "choice"
                            ? "选择"
                            : "场景"}{" "}
                      →{" "}
                      {n.successorKeys
                        .map(
                          (k) =>
                            pkg.narrative.nodes.find((v) => v.key === k)
                              ?.title ?? k,
                        )
                        .join("、") || "结束"}
                    </small>
                  </button>
                ))}
              </div>
              <button
                className="lf-action"
                onClick={() => {
                  const key = `node.${crypto.randomUUID()}`;
                  change((p) =>
                    p.narrative.nodes.push({
                      key,
                      kind: "scene",
                      title: "新场景",
                      summary: "",
                      conditionJson: "{}",
                      effectsJson: "[]",
                      successorKeys: [],
                    }),
                  );
                  setSelected(key);
                }}
              >
                添加场景
              </button>
              {node && (
                <article className="avg-editor-card">
                  <div className="avg-form">
                    {field("场景名称", node.title, (n, v) => {
                      n.narrative.nodes.find((x) => x.key === selected)!.title =
                        v;
                    })}
                    {field(
                      "场景摘要",
                      node.summary,
                      (n, v) => {
                        n.narrative.nodes.find(
                          (x) => x.key === selected,
                        )!.summary = v;
                      },
                      true,
                    )}
                    <label>
                      节点类型
                      <select
                        value={node.kind}
                        onChange={(e) =>
                          change((n) => {
                            n.narrative.nodes.find(
                              (x) => x.key === selected,
                            )!.kind = e.target.value as typeof node.kind;
                          })
                        }
                      >
                        <option value="entry">开场</option>
                        <option value="scene">场景</option>
                        <option value="choice">选择</option>
                        <option value="ending">结局</option>
                      </select>
                    </label>
                  </div>
                  <h4>对白与叙述</h4>
                  {beats.map((b) => (
                    <div className="avg-editor-card" key={b.beatKey}>
                      <label>
                        类型
                        <select
                          value={b.kind}
                          onChange={(e) =>
                            change((n) => {
                              n.narrative.beats.find(
                                (x) => x.beatKey === b.beatKey,
                              )!.kind = e.target.value as typeof b.kind;
                            })
                          }
                        >
                          {[
                            ["narration", "旁白"],
                            ["dialogue", "对白"],
                            ["action", "动作"],
                            ["system", "提示"],
                          ].map(([id, label]) => (
                            <option key={id} value={id}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {field("说话角色标识", b.speakerKey ?? "", (n, v) => {
                        n.narrative.beats.find(
                          (x) => x.beatKey === b.beatKey,
                        )!.speakerKey = v || null;
                      })}
                      {field(
                        "内容",
                        b.text,
                        (n, v) => {
                          n.narrative.beats.find(
                            (x) => x.beatKey === b.beatKey,
                          )!.text = v;
                        },
                        true,
                      )}
                      <div className="avg-actions">
                        <button
                          className="lf-action"
                          onClick={() =>
                            change((n) => {
                              const list = n.narrative.beats
                                .filter((x) => x.nodeKey === selected)
                                .sort((a, b) => a.order - b.order);
                              const index = list.findIndex(
                                (x) => x.beatKey === b.beatKey,
                              );
                              if (index > 0)
                                [list[index - 1], list[index]] = [
                                  list[index],
                                  list[index - 1],
                                ];
                              list.forEach((x, i) => (x.order = i));
                            })
                          }
                        >
                          上移
                        </button>
                        <button
                          className="lf-action"
                          onClick={() =>
                            change((n) => {
                              n.narrative.beats = n.narrative.beats.filter(
                                (x) => x.beatKey !== b.beatKey,
                              );
                              if (n.presentation)
                                n.presentation.cues =
                                  n.presentation.cues.filter(
                                    (c) => c.beatKey !== b.beatKey,
                                  );
                            })
                          }
                        >
                          删除此段及其演出
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    className="lf-action"
                    onClick={() =>
                      change((n) =>
                        n.narrative.beats.push({
                          beatKey: `beat.${crypto.randomUUID()}`,
                          nodeKey: selected,
                          kind: "narration",
                          speakerKey: null,
                          text: "新段落",
                          order: beats.length,
                        }),
                      )
                    }
                  >
                    添加对白／旁白
                  </button>
                  <h4>分支选择</h4>
                  {pkg.narrative.choices
                    .filter((c) => c.sourceNodeKey === selected)
                    .map((c) => (
                      <div className="avg-editor-card" key={c.choiceKey}>
                        {field("选择文字", c.text, (n, v) => {
                          n.narrative.choices.find(
                            (x) => x.choiceKey === c.choiceKey,
                          )!.text = v;
                        })}
                        <label>
                          前往节点
                          <select
                            value={c.targetNodeKey}
                            onChange={(e) =>
                              change((n) => {
                                const choice = n.narrative.choices.find(
                                  (x) => x.choiceKey === c.choiceKey,
                                )!;
                                choice.targetNodeKey = e.target.value;
                                const target = n.narrative.nodes.find(
                                  (x) => x.key === selected,
                                )!;
                                target.successorKeys = [
                                  ...new Set(
                                    n.narrative.choices
                                      .filter(
                                        (x) => x.sourceNodeKey === selected,
                                      )
                                      .map((x) => x.targetNodeKey),
                                  ),
                                ];
                              })
                            }
                          >
                            {pkg.narrative.nodes.map((n) => (
                              <option key={n.key} value={n.key}>
                                {n.title}
                              </option>
                            ))}
                          </select>
                        </label>
                        <details>
                          <summary>高级条件与变量效果</summary>
                          {(
                            [
                              "displayConditionJson",
                              "availableConditionJson",
                              "effectsJson",
                            ] as const
                          ).map((key) => (
                            <JsonField
                              key={key}
                              label={
                                key === "effectsJson"
                                  ? "选择产生的效果"
                                  : key === "displayConditionJson"
                                    ? "显示条件"
                                    : "可选条件"
                              }
                              value={JSON.parse(c[key])}
                              onChange={(v) =>
                                change((n) => {
                                  n.narrative.choices.find(
                                    (x) => x.choiceKey === c.choiceKey,
                                  )![key] = JSON.stringify(v);
                                })
                              }
                            />
                          ))}
                        </details>
                        <button
                          className="lf-action"
                          onClick={() =>
                            change((n) => {
                              n.narrative.choices = n.narrative.choices.filter(
                                (x) => x.choiceKey !== c.choiceKey,
                              );
                              n.narrative.nodes.find(
                                (x) => x.key === selected,
                              )!.successorKeys = [
                                ...new Set(
                                  n.narrative.choices
                                    .filter((x) => x.sourceNodeKey === selected)
                                    .map((x) => x.targetNodeKey),
                                ),
                              ];
                            })
                          }
                        >
                          删除选择
                        </button>
                      </div>
                    ))}
                  <button
                    className="lf-action"
                    onClick={() =>
                      change((n) => {
                        const target =
                          n.narrative.nodes.find((x) => x.key !== selected)
                            ?.key ?? selected;
                        n.narrative.choices.push({
                          choiceKey: `choice.${crypto.randomUUID()}`,
                          sourceNodeKey: selected,
                          text: "新的选择",
                          description: "",
                          unavailableReason: "",
                          targetNodeKey: target,
                          displayConditionJson: "{}",
                          availableConditionJson: "{}",
                          effectsJson: "[]",
                          tags: [],
                          order: n.narrative.choices.length,
                        });
                        n.narrative.nodes.find(
                          (x) => x.key === selected,
                        )!.successorKeys = [
                          ...new Set([...node.successorKeys, target]),
                        ];
                      })
                    }
                  >
                    添加选择
                  </button>
                  <details>
                    <summary>场景进入条件与效果</summary>
                    <JsonField
                      label="进入条件"
                      value={JSON.parse(node.conditionJson)}
                      onChange={(v) =>
                        change((n) => {
                          n.narrative.nodes.find(
                            (x) => x.key === selected,
                          )!.conditionJson = JSON.stringify(v);
                        })
                      }
                    />
                    <JsonField
                      label="进入效果"
                      value={JSON.parse(node.effectsJson)}
                      onChange={(v) =>
                        change((n) => {
                          n.narrative.nodes.find(
                            (x) => x.key === selected,
                          )!.effectsJson = JSON.stringify(v);
                        })
                      }
                    />
                  </details>
                </article>
              )}
            </>
          ) : page === "variables" ? (
            <>
              <h4>初始变量</h4>
              <p>
                变量名称需与分支条件中的名称一致。系统初始标记由运行包保留，新增作者变量时使用独立名称。
              </p>
              <JsonField
                label="初始状态"
                value={pkg.definition.initialVariables}
                onChange={(v) =>
                  change((n) => {
                    n.definition.initialVariables = v as Record<
                      string,
                      unknown
                    >;
                  })
                }
              />
              <h4>全部结局</h4>
              {pkg.narrative.nodes
                .filter((n) => n.kind === "ending")
                .map((n) => (
                  <article className="avg-editor-card" key={n.key}>
                    <h4>{n.title}</h4>
                    <p>{n.summary}</p>
                    <JsonField
                      label="结局条件"
                      value={JSON.parse(n.conditionJson)}
                      onChange={(v) =>
                        change((p) => {
                          p.narrative.nodes.find(
                            (x) => x.key === n.key,
                          )!.conditionJson = JSON.stringify(v);
                        })
                      }
                    />
                  </article>
                ))}
            </>
          ) : page === "audio" ? (
            <>
              <p>
                每条演出绑定具体对白，按阶段和顺序执行。等待时长会实际控制推进。
              </p>
              {(pkg.presentation?.cues ?? []).map((c) => (
                <article className="avg-editor-card" key={c.cueKey}>
                  <div className="avg-form">
                    <label>
                      绑定对白
                      <select
                        value={c.beatKey}
                        onChange={(e) =>
                          patchCue(c.cueKey, { beatKey: e.target.value })
                        }
                      >
                        {pkg.narrative.beats.map((b) => (
                          <option key={b.beatKey} value={b.beatKey}>
                            {b.text.slice(0, 45)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      演出类型
                      <select
                        value={c.type}
                        onChange={(e) =>
                          patchCue(c.cueKey, {
                            type: e.target.value as AvgPresentationCue["type"],
                          })
                        }
                      >
                        {AVG_CUE_TYPES.map((k) => (
                          <option key={k} value={k}>
                            {CUES[k]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      时机
                      <select
                        value={c.phase}
                        onChange={(e) =>
                          patchCue(c.cueKey, {
                            phase: e.target
                              .value as AvgPresentationCue["phase"],
                          })
                        }
                      >
                        <option value="before">对白前</option>
                        <option value="during">对白中</option>
                        <option value="after">对白后</option>
                      </select>
                    </label>
                    <label>
                      素材
                      <select
                        value={c.assetKey ?? ""}
                        onChange={(e) =>
                          patchCue(c.cueKey, {
                            assetKey: e.target.value || null,
                          })
                        }
                      >
                        <option value="">不使用素材</option>
                        {pkg.presentation?.assets.map((a) => (
                          <option key={a.assetKey} value={a.assetKey}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(
                      [
                        "durationMs",
                        "order",
                        "volume",
                        "x",
                        "y",
                        "scale",
                        "opacity",
                      ] as const
                    ).map((k) => (
                      <label key={k}>
                        {
                          {
                            durationMs: "时长（毫秒）",
                            order: "顺序",
                            volume: "音量（0～1）",
                            x: "水平位置",
                            y: "垂直位置",
                            scale: "缩放",
                            opacity: "透明度",
                          }[k]
                        }
                        <input
                          type="number"
                          step="any"
                          value={c[k] ?? ""}
                          onChange={(e) =>
                            patchCue(c.cueKey, {
                              [k]:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    ))}
                    {(["actorKey", "slot", "tone", "snapshotKey"] as const).map(
                      (k) => (
                        <label key={k}>
                          {
                            {
                              actorKey: "角色标识",
                              slot: "位置／音频通道",
                              tone: "色调／效果名称",
                              snapshotKey: "舞台快照标识",
                            }[k]
                          }
                          <input
                            value={c[k] ?? ""}
                            onChange={(e) =>
                              patchCue(c.cueKey, {
                                [k]: e.target.value || null,
                              })
                            }
                          />
                        </label>
                      ),
                    )}
                    <label>
                      循环播放
                      <input
                        type="checkbox"
                        checked={c.loop ?? false}
                        onChange={(e) =>
                          patchCue(c.cueKey, { loop: e.target.checked })
                        }
                      />
                    </label>
                  </div>
                  <button
                    className="lf-action"
                    onClick={() =>
                      change((n) => {
                        if (n.presentation)
                          n.presentation.cues = n.presentation.cues.filter(
                            (x) => x.cueKey !== c.cueKey,
                          );
                      })
                    }
                  >
                    删除演出
                  </button>
                </article>
              ))}
              <button
                className="lf-action"
                disabled={!pkg.narrative.beats.length}
                onClick={() =>
                  change((n) => {
                    n.presentation ??= { version: 1, cues: [], assets: [] };
                    n.presentation.cues.push({
                      cueKey: `cue.${crypto.randomUUID()}`,
                      beatKey: n.narrative.beats[0].beatKey,
                      phase: "before",
                      type: "wait",
                      durationMs: 500,
                      easing: "linear",
                      order: n.presentation.cues.length,
                    });
                  })
                }
              >
                添加演出
              </button>
            </>
          ) : (
            <>
              <div className="avg-media-grid">
                {(pkg.presentation?.assets ?? [])
                  .filter(
                    (a) => page !== "visual" || a.mimeType.startsWith("image/"),
                  )
                  .map((a) => (
                    <article className="avg-editor-card" key={a.assetKey}>
                      {urls[a.assetKey] ? (
                        a.mimeType.startsWith("image/") ? (
                          <img src={urls[a.assetKey]} alt={a.altText} />
                        ) : (
                          <audio src={urls[a.assetKey]} controls />
                        )
                      ) : (
                        <p>素材已登记，预览需重新读取</p>
                      )}
                      <h4>{a.name}</h4>
                      <p>
                        {KINDS[a.kind]} · {Math.round(a.byteSize / 1024)} KB
                      </p>
                      <p>授权：{a.license}</p>
                      {field("替代文字", a.altText, (n, v) => {
                        n.presentation!.assets.find(
                          (x) => x.assetKey === a.assetKey,
                        )!.altText = v;
                      })}
                      {field("角色绑定", a.characterTag, (n, v) => {
                        n.presentation!.assets.find(
                          (x) => x.assetKey === a.assetKey,
                        )!.characterTag = v;
                      })}
                    </article>
                  ))}
              </div>
              <article className="avg-editor-card">
                <h4>导入本作品素材</h4>
                <div className="avg-form">
                  <label>
                    素材类别
                    <select
                      value={uploadKind}
                      onChange={(e) =>
                        setUploadKind(e.target.value as ProductMediaKind)
                      }
                    >
                      {Object.entries(KINDS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    授权与来源说明
                    <input
                      value={license}
                      onChange={(e) => setLicense(e.target.value)}
                    />
                  </label>
                  <label>
                    角色标识（立绘／表情必填）
                    <input
                      value={character}
                      onChange={(e) => setCharacter(e.target.value)}
                    />
                  </label>
                  <label>
                    选择文件
                    <input
                      type="file"
                      disabled={busy || !license.trim()}
                      accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,audio/ogg,audio/mp4"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void upload(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <p>
                  导入后请在「音频与演出」绑定对白和展示时机，再提交新版本。
                </p>
              </article>
            </>
          )}
        </>
      )}
    </section>
  );
}
