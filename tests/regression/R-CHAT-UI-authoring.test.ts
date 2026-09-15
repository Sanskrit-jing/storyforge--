import { beforeEach, afterEach, it, expect } from "vitest";
import { db } from "../../src/lib/db/schema";
import { createChatDraftV1, readChatDraftV1, saveChatDraftV1, } from "../../src/lib/character-interaction/draft-service";
import { DEFAULT_CHAT_SETTINGS } from "../../src/lib/character-interaction/authoring-contract";
import { consultChatV1 } from "../../src/lib/character-interaction/consultation";
import { exportProjectJSON, importProjectJSON, } from "../../src/lib/export/json-export";
import { readLatestVerifiedAgentRunCheckpointV1 } from "../../src/lib/agent/run/checkpoint";
beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
});
afterEach(() => db.close());
it("persists a durable candidate, includes prior turns, and only changes settings after author confirmation", async () => {
    const { scope } = await createChatDraftV1("会谈作品");
    const settings = { ...DEFAULT_CHAT_SETTINGS, playerRole: "档案员" };
    const candidate = await consultChatV1({
        scope,
        question: "主角是档案员",
        runAI: async (messages) => {
            expect(messages[1].content).toContain("主角是档案员");
            return JSON.stringify({ answer: "已起草，是否采用？", settings });
        },
    });
    let draft = await readChatDraftV1(scope);
    expect(JSON.parse(draft.settingsJson).playerRole).toBe("");
    expect(JSON.parse(draft.conversationJson)[0].settings.playerRole).toBe("档案员");
    expect((await readLatestVerifiedAgentRunCheckpointV1(scope, candidate.runId!))
        ?.resumePayload).toMatchObject({ settings });
    draft = await saveChatDraftV1(scope, draft.revision, settings);
    await consultChatV1({
        scope,
        question: "继续细化",
        runAI: async (messages) => {
            expect(messages[1].content).toContain("档案员");
            return JSON.stringify({ answer: "可以继续确定路线", settings });
        },
    });
    expect(JSON.parse((await readChatDraftV1(scope)).settingsJson)).toEqual(settings);
    const restoredId = await importProjectJSON(await exportProjectJSON(scope.projectId));
    const restored = await db.chatAuthoringDrafts
        .where("projectId")
        .equals(restoredId)
        .first();
    const turns = JSON.parse(restored!.conversationJson);
    expect(turns[0].runId).not.toBe(candidate.runId);
    expect(turns[0].settings).toEqual(settings);
});
it("records failure without applying malformed output or retrying automatically", async () => {
    const { scope } = await createChatDraftV1("错误会谈");
    let calls = 0;
    await expect(consultChatV1({
        scope,
        question: "写个故事",
        runAI: async () => {
            calls++;
            return "not JSON";
        },
    })).rejects.toThrow();
    expect(calls).toBe(1);
    const draft = await readChatDraftV1(scope);
    expect(JSON.parse(draft.settingsJson)).toEqual(DEFAULT_CHAT_SETTINGS);
    expect(JSON.parse(draft.conversationJson)[0].error).toBeTruthy();
});
