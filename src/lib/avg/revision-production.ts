/** Author-edited AVG revisions use the same durable production graph and gates.
 * No model call and no direct mutation of an existing Build or ProductRelease. */
import { db } from "../db/schema";
import type {
  ProductProductionBriefV3,
  ProductRuntimePackageV1,
  ProductBuildQualityReportV1,
  WorkspaceScope,
} from "../types";
import { parseProductRuntimePackageV1 } from "../product-production/runtime-package";
import { verifyProductBuildPreviewManifestV1 } from "../product-production/preview-manifest";
import {
  readProductProductionDetailsV1,
  beginProductProductionEvolutionV1,
  type ProductProductionDetailsV1,
} from "../product-production/service";
import { executeProductProductionCommand } from "../product-production/commands";
import { parseProductProductionBriefV3 } from "../product-production/contracts";
import { parseProductProductionPlanV3 } from "../product-production/plan";
import {
  runProductProductionUntilBlockedV1,
  type ProductProductionTaskExecutorV1,
} from "../product-production/scheduler";
import { hashProductProductionValueV2 } from "../product-production/hash";
import { evaluateProductRuntimeProductQualityV1 } from "../product-production/product-quality";
import { readMediaBlobObjectData } from "../product-production/media-blob-store";
import { assertRecordInScope } from "../workspace/scope";

export async function prepareAvgRevisionV1(input: {
  scope: WorkspaceScope;
  productionId: number;
  expectedPreviewHash: string;
  runtimePackage: ProductRuntimePackageV1;
}) {
  const details = await readProductProductionDetailsV1(
    input.scope,
    input.productionId,
    ["avg"],
  );
  if (
    !details.build ||
    !details.brief ||
    details.build.previewHash !== input.expectedPreviewHash
  )
    throw new Error("制作版本已变化，请刷新后重新编辑");
  const base = await verifyProductBuildPreviewManifestV1(
    details.build.previewManifestJson,
  );
  const pkg = parseProductRuntimePackageV1(input.runtimePackage);
  if (
    pkg.productType !== "avg" ||
    pkg.definition.rulesetVersion !==
      base.runtimePackage.definition.rulesetVersion ||
    JSON.stringify(pkg.definition.enabledCapabilities) !==
      JSON.stringify(base.runtimePackage.definition.enabledCapabilities) ||
    JSON.stringify(pkg.sourceWorld) !==
      JSON.stringify(base.runtimePackage.sourceWorld) ||
    pkg.definition.productKey !== base.runtimePackage.definition.productKey
  )
    throw new Error("修订不能替换作品身份或来源");
  const prior = parseProductProductionBriefV3(details.brief.briefJson);
  const quality = evaluateProductRuntimeProductQualityV1({
    runtimePackage: pkg,
    brief: prior,
  });
  if (!quality.passed)
    throw new Error(
      "修订未通过检查：" +
        quality.gates
          .filter((g) => !g.passed)
          .map((g) => g.gateId)
          .join("、"),
    );
  // Verify every referenced immutable blob belongs to this Work before persisting the revision.
  for (const asset of pkg.presentation?.assets ?? []) {
    if(!asset.license.trim()||!asset.source.trim())throw new Error(`素材缺少来源或授权说明：${asset.name}`)
    const blob = await db.mediaBlobObjects
      .where("contentHash")
      .equals(asset.blobContentHash)
      .filter(
        (row) =>
          row.workId === input.scope.workId &&
          row.projectId === input.scope.projectId,
      )
      .first();
    if (
      !blob?.id ||
      !(await assertRecordInScope(input.scope, "mediaBlobObjects", blob, {
        owner: "work",
      }))
    )
      throw new Error(`素材不可用或不属于当前作品：${asset.name}`);
    await readMediaBlobObjectData({
      scope: input.scope,
      blobObjectId: blob.id,
      expected: {
        contentHash: asset.blobContentHash,
        byteSize: asset.byteSize,
        mimeType: asset.mimeType,
      },
    });
  }
  await beginProductProductionEvolutionV1({
    scope: input.scope,
    productionId: input.productionId,
    expectedStateRevision: details.production.stateRevision,
    userText: "作者编辑 AVG 对白、分支与演出，保留旧版本和存档",
    affectedLanes: ["content", "product", "visual", "audio"],
  });
  const next = await readProductProductionDetailsV1(
    input.scope,
    input.productionId,
    ["avg"],
  );
  if (!next.brief) throw new Error("修订方案未创建");
  const brief = parseProductProductionBriefV3({
    ...parseProductProductionBriefV3(next.brief.briefJson),
    avgRevision: {
      version: 1,
      basePackageHash: base.packageHash,
      runtimePackage: pkg,
    },
    capabilityRequirements: [],
    productionBudget: {
      ...prior.productionBudget,
      maximumModelCalls: 0,
      maximumOutputTokens: 0,
      maximumMediaCalls: 0,
      maximumInputTokens: 100000,
    },
    completionContract: {
      ...prior.completionContract,
      requiredGateIds: [
        "runtime.package.valid",
        "narrative.graph.valid",
        "rights.complete",
        "avg.author-revision.valid",
      ],
    },
  });
  const receipt = await executeProductProductionCommand({
    scope: input.scope,
    productionId: input.productionId,
    command: {
      type: "save-brief-revision",
      commandId: `avg.revision.${crypto.randomUUID()}`,
      expectedStateRevision: next.production.stateRevision,
      parentRevision: next.brief.revision,
      brief,
    },
  });
  if (!receipt.ok)
    throw new Error(String(receipt.result.message ?? receipt.errorCode));
  return readProductProductionDetailsV1(input.scope, input.productionId, [
    "avg",
  ]);
}
export async function runAvgRevisionV1(input: {
  scope: WorkspaceScope;
  productionId: number;
  details: ProductProductionDetailsV1;
  brief: ProductProductionBriefV3;
  signal?: AbortSignal;
  onProgress?: (
    value: Awaited<ReturnType<typeof runProductProductionUntilBlockedV1>>,
  ) => void | Promise<void>;
}) {
  const { brief, details } = input;
  const revision = brief.avgRevision;
  if (!revision || !details.build || !details.brief)
    throw new Error("缺少 AVG 作者修订方案");
  const pkg = parseProductRuntimePackageV1(revision.runtimePackage);
  const ancestor=details.buildHistory.find(build=>build.packageHash===revision.basePackageHash&&build.buildNumber===details.build!.parentBuildNumber)
  if(!ancestor)throw new Error('AVG 修订基线与当前版本谱系不一致')
  const base=await verifyProductBuildPreviewManifestV1(ancestor.previewManifestJson)
  if(pkg.definition.productKey!==base.runtimePackage.definition.productKey||pkg.definition.rulesetVersion!==base.runtimePackage.definition.rulesetVersion||JSON.stringify(pkg.definition.enabledCapabilities)!==JSON.stringify(base.runtimePackage.definition.enabledCapabilities))throw new Error('AVG 修订不能更换作品身份或运行能力')
  const assets = pkg.presentation?.assets ?? [];
  if(assets.some(asset=>!asset.license.trim()||!asset.source.trim()))throw new Error('修订素材缺少来源或授权说明')
  const mediaKeys = assets.map((_, i) => `avg.media.${i}`);
  const tasks = [
    ...(assets.length
      ? [
          {
            taskKey: "media.import",
            kind: "visual-assets",
            lane: "visual",
            outputArtifactKeys: mediaKeys,
            inputArtifactKeys: [],
            dependsOn: [],
            acceptanceGateIds: ["rights.complete"],
          },
        ]
      : []),
    {
      taskKey: "runtime.integrate",
      kind: "runtime-package",
      lane: "integration",
      outputArtifactKeys: ["runtime.package"],
      inputArtifactKeys: mediaKeys,
      dependsOn: assets.length ? ["media.import"] : [],
      acceptanceGateIds: [
        "runtime.package.valid",
        "narrative.graph.valid",
        "rights.complete",
      ],
    },
    {
      taskKey: "quality.verify",
      kind: "quality-report",
      lane: "qa",
      outputArtifactKeys: ["quality.report"],
      inputArtifactKeys: ["runtime.package"],
      dependsOn: ["runtime.integrate"],
      acceptanceGateIds: ["avg.author-revision.valid"],
    },
  ];
  const plan = parseProductProductionPlanV3(
    {
      schema: "storyforge.product-production-plan",
      version: 3,
      productType: "avg",
      briefHash: details.brief.briefHash,
      buildNumber: details.build.buildNumber,
      controlEpoch: details.build.controlEpoch,
      concurrency: {
        maximumCostBearingTasks: 1,
        maximumTextProviderTasks: 1,
        maximumMediaProviderTasks: 1,
      },
      terminalTaskKey: "quality.verify",
      tasks: tasks.map((t) => ({
        ...t,
        skillId: null,
        executionMode: "deterministic",
        requirementKeys: [],
        capabilityRequirementKeys: [],
        concurrencyGroup: t.lane,
        subjectLockKeys: t.outputArtifactKeys,
        priority: 50,
        maxAttempts: 1,
        timeoutMs: 120000,
        failurePolicy: "fail-build",
        fallbackTaskKey: null,
        reuse: null,
        requiredReceipts: t.dependsOn.map((taskKey) => ({
          taskKey,
          receiptHash: null,
        })),
        budgetReservation: {
          modelCalls: 0,
          inputTokens: t.kind === "runtime-package" ? 100000 : 0,
          outputTokens: 0,
          mediaCalls: 0,
          maximumCostUsd: 0,
          durationMs: 90000,
          storageBytes: 0,
        },
      })),
    },
    brief,
    details.brief.briefHash,
  );
  const executor: ProductProductionTaskExecutorV1 = async (task) => {
    const usage = {
      modelCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      mediaCalls: 0,
      costUsd: 0,
      durationMs: 0,
      storageBytes: 0,
    };
    if (task.task.taskKey === "media.import") {
      const artifacts = await Promise.all(
        assets.map(async (asset, i) => {
          const blob = await db.mediaBlobObjects
            .where("contentHash")
            .equals(asset.blobContentHash)
            .filter(
              (row) =>
                row.workId === input.scope.workId &&
                row.projectId === input.scope.projectId,
            )
            .first();
          if (!blob?.id) throw new Error(`素材丢失：${asset.assetKey}`);
          await readMediaBlobObjectData({
            scope: input.scope,
            blobObjectId: blob.id,
            expected: {
              contentHash: asset.blobContentHash,
              byteSize: asset.byteSize,
              mimeType: asset.mimeType,
            },
          });
          return {
            artifactKey: mediaKeys[i],
            kind: asset.mimeType.startsWith("audio/")
              ? ("audio" as const)
              : ("image" as const),
            mediaKind: asset.kind,
            payload: { assetKey: asset.assetKey },
            metadata: asset,
            quality: { verified: true },
            rights: { license: asset.license, origin: asset.source },
            contentHash: asset.contentHash,
            blobObjectId: blob.id,
            mimeType: asset.mimeType,
            byteSize: asset.byteSize,
          };
        }),
      );
      return { artifacts, passedGateIds: task.task.acceptanceGateIds, usage };
    }
    if (task.task.kind === "runtime-package") {
      if (!task.contextText.trim()) throw new Error("缺少冻结世界读取证据");
      return {
        artifacts: [
          {
            artifactKey: "runtime.package",
            kind: "presentation",
            payload: pkg,
            quality: {
              sourceContextHash: await hashProductProductionValueV2(
                task.contextText,
              ),
            },
            rights: {
              origin: "author-revision",
              basePackageHash: revision.basePackageHash,
              mediaLicenses: assets.map((a) => ({
                assetKey: a.assetKey,
                license: a.license,
              })),
            },
          },
        ],
        passedGateIds: task.task.acceptanceGateIds,
        usage,
      };
    }
    const quality = evaluateProductRuntimeProductQualityV1({
      runtimePackage: pkg,
      brief,
    });
    if (!quality.passed)
      throw new Error(
        "AVG 修订验收失败：" +
          JSON.stringify(quality.gates.filter((g) => !g.passed)),
      );
    const packageHash = await hashProductProductionValueV2(pkg);
    const report: ProductBuildQualityReportV1 = {
      schema: "storyforge.product-build-quality-report",
      version: 1,
      buildNumber: task.buildNumber,
      packageHash,
      hardGateResults: brief.completionContract.requiredGateIds.map(
        (gateId) => ({
          gateId,
          passed: true,
          evidence: [packageHash, revision.basePackageHash],
        }),
      ),
      softGateResults: quality.gates,
      mediaCoverage: 1,
      playable: true,
      releaseReady: brief.qualityProfile !== "commercial-candidate",
      warnings: ["作者修订经过结构与引用校验；内容质量仍需作者试玩确认。"],
    };
    return {
      artifacts: [
        {
          artifactKey: "quality.report",
          kind: "quality-report",
          payload: report,
          quality: {},
          rights: {},
        },
      ],
      passedGateIds: task.task.acceptanceGateIds,
      usage,
    };
  };
  const projection = await runProductProductionUntilBlockedV1({
    scope: input.scope,
    productionId: input.productionId,
    suppliedPlan: plan,
    executor,
    signal: input.signal,
  });
  await input.onProgress?.(projection);
  return projection;
}
