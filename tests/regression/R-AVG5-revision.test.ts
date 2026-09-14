import { beforeEach, afterEach, it, expect } from "vitest";
import { db } from "../../src/lib/db/schema";
import { executeProductProductionCommand } from "../../src/lib/product-production/commands";
import {
  draftProductProductionBriefV3,
  suggestProductStartingPoints,
} from "../../src/lib/product-production/consultation";
import { verifyProductBuildPreviewManifestV1 } from "../../src/lib/product-production/preview-manifest";
import {
  readProductProductionDetailsV1,
  runAuthorizedProductProductionV1,
} from "../../src/lib/product-production/service";
import { prepareAvgRevisionV1 } from "../../src/lib/avg/revision-production";
import { runCurrentProductProductionAcceptanceFixture } from "../helpers/current-product-production-acceptance-fixture";
import { seedCurrentProductWorld } from "../helpers/current-product-world";
async function authorizedProduction(input: {
  name: string;
  productType?: "avg";
  visualLevel?: "none" | "key-scenes";
}) {
  const owned = await seedCurrentProductWorld(input.name);
  const release = owned.release;
  const suggestions = await suggestProductStartingPoints({
    scope: owned.scope,
    worldReleaseId: release.id!,
  });
  const startingPoint = suggestions.suggestions.find(
    (item) => item.kind === "mainline",
  )!;
  const brief = await draftProductProductionBriefV3({
    scope: owned.scope,
    worldReleaseId: release.id!,
    suggestionKey: startingPoint.suggestionKey,
    productType: input.productType ?? "avg",
    scale: "scene",
    visualLevel: input.visualLevel ?? "none",
    audioLevel: "none",
    requiredFacts: ["世界冻结版本中的历史不可被无理由改写"],
    forbiddenChanges: ["不得把候选内容直接写回世界正式表"],
  });
  const created = await executeProductProductionCommand({
    scope: owned.scope,
    command: {
      type: "create-intent",
      commandId: `${input.name}.intent`,
      productionKey: `${input.name}.production`,
      productType: input.productType ?? "avg",
      worldReleaseId: release.id!,
      userText: `${input.name} 游戏制作`,
    },
  });
  const saved = await executeProductProductionCommand({
    scope: owned.scope,
    productionId: created.productionId,
    command: {
      type: "save-brief-revision",
      commandId: `${input.name}.brief`,
      expectedStateRevision: 0,
      parentRevision: null,
      brief,
    },
  });
  const authorized = await executeProductProductionCommand({
    scope: owned.scope,
    productionId: created.productionId,
    command: {
      type: "authorize-start",
      commandId: `${input.name}.start`,
      expectedStateRevision: 1,
      briefRevision: 1,
      briefHash: saved.result.briefHash as string,
      authorizationNonce: `${input.name}.click`,
    },
  });
  return {
    ...owned,
    release,
    productionId: created.productionId,
    buildId: authorized.result.buildId as number,
  };
}

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});
afterEach(() => db.close());
it("makes an author revision through the durable production pipeline and preserves the base build", async () => {
  const owned = await authorizedProduction({
    name: "avg-revision",
    visualLevel: "none",
  });
  await runCurrentProductProductionAcceptanceFixture({
    scope: owned.scope,
    productionId: owned.productionId,
  });
  const old = await db.productBuilds.get(owned.buildId);
  const preview = await verifyProductBuildPreviewManifestV1(
    old!.previewManifestJson,
  );
  const pkg = structuredClone(preview.runtimePackage);
  pkg.narrative.beats[0].text = "作者修改了开场对白。";
  await expect(
    prepareAvgRevisionV1({
      scope: owned.scope,
      productionId: owned.productionId,
      expectedPreviewHash: "0".repeat(64),
      runtimePackage: pkg,
    }),
  ).rejects.toThrow("版本已变化");
  const next = await prepareAvgRevisionV1({
    scope: owned.scope,
    productionId: owned.productionId,
    expectedPreviewHash: preview.previewHash,
    runtimePackage: pkg,
  });
  const start = await executeProductProductionCommand({
    scope: owned.scope,
    productionId: owned.productionId,
    command: {
      type: "authorize-start",
      commandId: "author.start",
      expectedStateRevision: next.production.stateRevision,
      briefRevision: next.brief!.revision,
      briefHash: next.brief!.briefHash,
      authorizationNonce: "author.click",
    },
  });
  expect(start.ok).toBe(true);
  await runAuthorizedProductProductionV1({
    scope: owned.scope,
    productionId: owned.productionId,
  });
  const result = await readProductProductionDetailsV1(
    owned.scope,
    owned.productionId,
    ["avg"],
  );
  expect(result.build?.status, result.build?.failureJson).toBe("release-ready");
  const edited = await verifyProductBuildPreviewManifestV1(
    result.build!.previewManifestJson,
  );
  expect(edited.runtimePackage.narrative.beats[0].text).toBe(
    "作者修改了开场对白。",
  );
  expect(await db.productBuilds.get(owned.buildId)).toEqual(old);
}, 30000);
