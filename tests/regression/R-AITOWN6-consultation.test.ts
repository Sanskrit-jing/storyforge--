import { beforeEach, afterEach, it, expect } from "vitest";
import { db } from "../../src/lib/db/schema";
import {
  createAiTownDraft,
  readAiTownDraft,
  saveAiTownDraft,
} from "../../src/lib/ai-town/authoring-service";
import { defaultAiTownSettings } from "../../src/lib/ai-town/authoring-contract";
import { consultAiTownV1 } from "../../src/lib/ai-town/consultation";
import {
  exportProjectJSON,
  importProjectJSON,
} from "../../src/lib/export/json-export";
import { readLatestVerifiedAgentRunCheckpointV1 } from "../../src/lib/agent/run/checkpoint";
beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});
afterEach(() => db.close());
it("persists a durable candidate, includes prior turns, and only changes settings after author confirmation", async () => {
  const { scope } = await createAiTownDraft("会谈作品");
  const settings = { ...defaultAiTownSettings(), openingSituation: "共同修复茶屋" };
  const candidate = await consultAiTownV1({
    scope,
    question: "主角是共同修复茶屋",
    runAI: async (messages) => {
      expect(messages[1].content).toContain("主角是共同修复茶屋");
      return JSON.stringify({ answer: "已起草，是否采用？", settings });
    },
  });
  let draft = await readAiTownDraft(scope);
  expect(JSON.parse(draft.settingsJson).openingSituation).toBe("");
  expect(JSON.parse(draft.conversationJson)[0].settings.openingSituation).toBe(
    "共同修复茶屋",
  );
  expect(
    (await readLatestVerifiedAgentRunCheckpointV1(scope, candidate.runId!))
      ?.resumePayload,
  ).toMatchObject({ settings });
  draft = await saveAiTownDraft(scope, draft.revision, settings,"会谈作品");
  await consultAiTownV1({
    scope,
    question: "继续细化",
    runAI: async (messages) => {
      expect(messages[1].content).toContain("共同修复茶屋");
      return JSON.stringify({ answer: "可以继续确定路线", settings });
    },
  });
  expect(JSON.parse((await readAiTownDraft(scope)).settingsJson)).toEqual(
    settings,
  );
  const restoredId = await importProjectJSON(
    await exportProjectJSON(scope.projectId),
  );
  const restored = await db.aiTownAuthoringDrafts
    .where("projectId")
    .equals(restoredId)
    .first();
  const turns = JSON.parse(restored!.conversationJson);
  expect(turns[0].runId).not.toBe(candidate.runId);
  expect(turns[0].settings).toEqual(settings);
});
it("records failure without applying malformed output or retrying automatically", async () => {
  const { scope } = await createAiTownDraft("错误会谈");
  let calls = 0;
  await expect(
    consultAiTownV1({
      scope,
      question: "写个故事",
      runAI: async () => {
        calls++;
        return "not JSON";
      },
    }),
  ).rejects.toThrow();
  expect(calls).toBe(1);
  const draft = await readAiTownDraft(scope);
  expect(JSON.parse(draft.settingsJson)).toEqual(defaultAiTownSettings());
  expect(JSON.parse(draft.conversationJson)[0].error).toBeTruthy();
});
