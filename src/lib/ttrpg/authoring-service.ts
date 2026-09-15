import { db } from "../db/schema";
import {
  createWorkspace,
  workspaceCreationTransactionTablesV1,
} from "../workspace/create-workspace";
import {
  resolveScope,
  assertRecordInScope,
  scopeTransactionTables,
  stampNewRecord,
} from "../workspace/scope";
import { updateWorkTitle } from "../workspace/works";
import { cacheWorldReferenceForProductV1 } from "../world-engine/reference-cache";
import type { WorkspaceScope } from "../types";
import {
  defaultTtrpgSettings,
  serializeTtrpgSettings,
  settingsFromTtrpgDraft,
  type TtrpgAuthoringSettingsV1,
} from "./authoring-contract";
export async function createTtrpgDraft(
  title: string,
  settings = defaultTtrpgSettings(),
) {
  if (!title.trim() || title.length > 200)
    throw new Error("请填写 1～200 字的战役名称");
  const serialized = serializeTtrpgSettings(settings);
  if (serialized.savedRulePackId != null) throw new Error("新作品请先保存，再选择属于本作品的规则包");
  return db.transaction(
    "rw",
    [...workspaceCreationTransactionTablesV1(), db.ttrpgAuthoringDrafts],
    async () => {
      const created = await createWorkspace(
        {
          name: title.trim(),
          description: "",
          genres: [],
          status: "drafting",
          targetWordCount: 10000,
        },
        { kind: "ttrpg" },
      );
      const now = Date.now();
      await db.ttrpgAuthoringDrafts.add(
        stampNewRecord(
          created.scope,
          "ttrpgAuthoringDrafts",
          {
            ...created.scope,
            ...serialized,
            revision: 0,
            worldReleaseId: null,
            productionId: null,
            selectionJson: null,
            suggestionKey: null,
            preparedRevision: null,
            createdAt: now,
            updatedAt: now,
          },
          { owner: "work" },
        ),
      );
      return created;
    },
  );
}
export async function readTtrpgDraft(input: WorkspaceScope) {
  const scope = await resolveScope({ scope: input });
  const row = await db.ttrpgAuthoringDrafts
    .where("workId")
    .equals(scope.workId)
    .first();
  if (
    !row ||
    !(await assertRecordInScope(scope, "ttrpgAuthoringDrafts", row, {
      owner: "work",
    }))
  )
    throw new Error("跑团方案不存在或不属于当前作品");
  settingsFromTtrpgDraft(row);
  return row;
}
export async function saveTtrpgDraft(
  scope: WorkspaceScope,
  revision: number,
  settings: TtrpgAuthoringSettingsV1,
  title: string,
) {
  if (!title.trim() || title.length > 200)
    throw new Error("请填写 1～200 字的战役名称");
  const data = serializeTtrpgSettings(settings);
  return db.transaction(
    "rw",
    scopeTransactionTables(db.ttrpgAuthoringDrafts, db.ttrpgRulePacks),
    async () => {
      const row = await readTtrpgDraft(scope);
      if (row.revision !== revision)
        throw new Error("方案已在其他页面修改，请刷新后再保存");
      if (data.savedRulePackId != null) {
        const rule = await db.ttrpgRulePacks.get(data.savedRulePackId);
        if (
          !rule ||
          !(await assertRecordInScope(scope, "ttrpgRulePacks", rule, {
            owner: "work",
          }))
        )
          throw new Error("规则包不属于当前作品");
      }
      const next = {
        ...row,
        ...data,
        revision: revision + 1,
        preparedRevision: null,
        updatedAt: Date.now(),
      };
      await db.ttrpgAuthoringDrafts.put(next);
      await updateWorkTitle(scope, title);
      return next;
    },
  );
}
export async function selectTtrpgWorld(
  scope: WorkspaceScope,
  revision: number,
  releaseId: number,
) {
  const row = await readTtrpgDraft(scope);
  if (row.revision !== revision) throw new Error("方案已变化，请重新选择");
  const localId = await cacheWorldReferenceForProductV1(scope, releaseId);
  return db.transaction(
    "rw",
    scopeTransactionTables(db.ttrpgAuthoringDrafts),
    async () => {
      const latest = await readTtrpgDraft(scope);
      if (latest.revision !== revision)
        throw new Error("方案已变化，请重新选择");
      const next = {
        ...latest,
        worldReleaseId: localId,
        selectionJson: null,
        suggestionKey: null,
        preparedRevision: null,
        revision: revision + 1,
        updatedAt: Date.now(),
      };
      await db.ttrpgAuthoringDrafts.put(next);
      return next;
    },
  );
}

export async function saveTtrpgSourceSelection(
  scope: WorkspaceScope,
  revision: number,
  suggestionKey: string,
  selection: import("../types").ProductProductionSourceSelectionV1,
) {
  const row = await readTtrpgDraft(scope);
  if (!row.worldReleaseId) throw new Error("请选择世界版本");
  const { consultProductProductionStartV1 } = await import(
    "../product-production/service"
  );
  const catalog = await consultProductProductionStartV1({
    scope,
    worldReleaseId: row.worldReleaseId,
  });
  if (!catalog.suggestions.some((s) => s.suggestionKey === suggestionKey))
    throw new Error("起点不属于此世界");
  const pairs = [
    ["storyResourceKeys", "storySources"],
    ["characterResourceKeys", "characters"],
    ["importantLocationResourceKeys", "importantLocations"],
    ["artifactResourceKeys", "artifacts"],
    ["codexEntryResourceKeys", "codexEntries"],
    ["storyArcResourceKeys", "storyArcs"],
  ] as const;
  for (const [key, field] of pairs) {
    if (
      !Array.isArray(selection[key]) ||
      selection[key].some(
        (v) => !catalog.sourceOptions[field].some((o) => o.resourceKey === v),
      )
    )
      throw new Error("选择了世界出口之外的资源");
  }
  return db.transaction(
    "rw",
    scopeTransactionTables(db.ttrpgAuthoringDrafts),
    async () => {
      const current = await readTtrpgDraft(scope);
      if (current.revision !== revision)
        throw new Error("方案已变化，请重新选择");
      const next = {
        ...current,
        suggestionKey,
        selectionJson: JSON.stringify(selection),
        preparedRevision: null,
        revision: revision + 1,
        updatedAt: Date.now(),
      };
      await db.ttrpgAuthoringDrafts.put(next);
      return next;
    },
  );
}

export async function prepareTtrpgBrief(
  scope: WorkspaceScope,
  revision: number,
) {
  const {
    consultProductProductionStartV1,
    compileProductProductionBriefV3,
    createProductProductionWithBriefV1,
    readProductProductionDetailsV1,
  } = await import("../product-production/service");
  const { executeProductProductionCommand } = await import(
    "../product-production/commands"
  );
  const { toTtrpgProductionBriefDraftInputV2 } = await import(
    "./authoring-settings"
  );
  const row = await readTtrpgDraft(scope);
  if (row.revision !== revision) throw new Error("方案已变化，请刷新");
  if (!row.worldReleaseId) throw new Error("开始制作，需要一个世界引擎");
  const settings = settingsFromTtrpgDraft(row);
  const sources = await consultProductProductionStartV1({
    scope,
    worldReleaseId: row.worldReleaseId,
  });
  const suggestion =
    sources.suggestions.find((s) => s.suggestionKey === row.suggestionKey) ??
    sources.suggestions.find((s) =>
      s.recommendedProductTypes.includes("ttrpg"),
    ) ??
    sources.suggestions[0];
  if (!suggestion) throw new Error("世界没有可用起点");
  const selection = row.selectionJson
    ? JSON.parse(row.selectionJson)
    : sources.selectionDefaults[suggestion.suggestionKey];
  const work = await db.works.get(scope.workId);
  if (!work) throw new Error("作品不存在");
  const brief = await compileProductProductionBriefV3({
    scope,
    worldReleaseId: row.worldReleaseId,
    suggestionKey: suggestion.suggestionKey,
    productType: "ttrpg",
    qualityProfile: settings.qualityProfile,
    scale: "campaign",
    visualLevel:
      settings.wizard.maximumGeneratedAssets > 0 ? "key-scenes" : "none",
    audioLevel: "none",
    playerRole: settings.playerRole || "扮演本桌玩家角色",
    openingSituation: settings.openingSituation || suggestion.openingConflict,
    confirmTtrpgDefaultMappings: settings.wizard.confirmAll,
    ttrpg: toTtrpgProductionBriefDraftInputV2({
      value: settings.wizard,
      sourceOptions: sources.sourceOptions,
      sourceSelection: selection,
      openingSituation: settings.openingSituation || suggestion.openingConflict,
    }),
    sourceSelection: selection,
  });
  if ((await readTtrpgDraft(scope)).revision !== revision)
    throw new Error("编译期间方案已变化，请重新生成");
  let id = row.productionId;
  const prior = id
    ? await readProductProductionDetailsV1(scope, id, ["ttrpg"])
    : null;
  if (
    prior &&
    !prior.build &&
    prior.brief?.sourceWorldReleaseId === row.worldReleaseId
  ) {
    const receipt = await executeProductProductionCommand({
      scope,
      productionId: id!,
      command: {
        type: "save-brief-revision",
        commandId: crypto.randomUUID(),
        expectedStateRevision: prior.production.stateRevision,
        parentRevision: prior.production.currentBriefRevision,
        brief,
      },
    });
    if (!receipt.ok)
      throw new Error(String(receipt.result.message ?? "方案保存失败"));
  } else {
    id = await createProductProductionWithBriefV1({
      scope,
      worldReleaseId: row.worldReleaseId,
      title: work.title,
      brief,
    });
  }
  await db.transaction(
    "rw",
    scopeTransactionTables(db.ttrpgAuthoringDrafts),
    async () => {
      const latest = await readTtrpgDraft(scope);
      if (latest.revision !== revision)
        throw new Error("方案已变化，已编译版本保留在制作记录中，请重新核对");
      await db.ttrpgAuthoringDrafts.put({
        ...latest,
        productionId: id,
        preparedRevision: revision + 1,
        revision: revision + 1,
        updatedAt: Date.now(),
      });
    },
  );
  return id!;
}
