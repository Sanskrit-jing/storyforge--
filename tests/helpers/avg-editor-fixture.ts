import {
  createAvgDraftV1,
  readAvgDraftV1,
  selectAvgWorldV1,
} from "../../src/lib/avg/draft-service";
import { createMistHarborWorld } from "../../src/lib/world-engine/mist-harbor-preset";
import { executeProductProductionCommand } from "../../src/lib/product-production/commands";
import {
  draftProductProductionBriefV3,
  suggestProductStartingPoints,
} from "../../src/lib/product-production/consultation";
import { runCurrentProductProductionAcceptanceFixture } from "./current-product-production-acceptance-fixture";
export async function seedAvgEditorFixtureV1() {
  const owned = await createAvgDraftV1("AVG 剧情修订验收");
  const source = await createMistHarborWorld();
  await selectAvgWorldV1(owned.scope, 0, source.worldReleaseId);
  const draft = await readAvgDraftV1(owned.scope);
  const worldReleaseId = draft.worldReleaseId!;
  const suggestions = await suggestProductStartingPoints({
    scope: owned.scope,
    worldReleaseId,
  });
  const brief = await draftProductProductionBriefV3({
    scope: owned.scope,
    worldReleaseId,
    suggestionKey: suggestions.suggestions[0].suggestionKey,
    productType: "avg",
    qualityProfile: "prototype",
    scale: "scene",
    visualLevel: "none",
    audioLevel: "none",
  });
  const created = await executeProductProductionCommand({
    scope: owned.scope,
    command: {
      type: "create-intent",
      commandId: "avg.editor.intent",
      productionKey: "avg.editor",
      productType: "avg",
      worldReleaseId,
      userText: "AVG 剧情修订验收",
    },
  });
  const saved = await executeProductProductionCommand({
    scope: owned.scope,
    productionId: created.productionId,
    command: {
      type: "save-brief-revision",
      commandId: "avg.editor.brief",
      expectedStateRevision: 0,
      parentRevision: null,
      brief,
    },
  });
  await executeProductProductionCommand({
    scope: owned.scope,
    productionId: created.productionId,
    command: {
      type: "authorize-start",
      commandId: "avg.editor.start",
      expectedStateRevision: 1,
      briefRevision: 1,
      briefHash: saved.result.briefHash as string,
      authorizationNonce: "fixture.click",
    },
  });
  await runCurrentProductProductionAcceptanceFixture({
    scope: owned.scope,
    productionId: created.productionId,
  });
  return { scope: owned.scope, productionId: created.productionId };
}
