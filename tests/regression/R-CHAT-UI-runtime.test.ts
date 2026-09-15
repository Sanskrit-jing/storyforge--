import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { db } from '../../src/lib/db/schema';
import { seedChatRuntimeFixture } from '../helpers/character-chat-fixture';
import { useCharacterInteractionPlayerStore as store } from '../../src/stores/character-interaction-player';
import * as harness from '../../src/lib/character-interaction/harness';
import { readProductRuntimeState } from '../../src/lib/character-interaction/runtime-api';
const generate = harness.generateInteractionRuntimeCandidateV1;
beforeEach(async () => { db.close(); await db.delete(); await db.open(); store.setState({ busy: false, generatingRunId: null, scope: null, selectedSessionId: null }); });
afterEach(() => { vi.restoreAllMocks(); db.close(); });
it('clears failed generation, retains the one player message and permits an explicit retry', async () => {
    const f = await seedChatRuntimeFixture();
    await store.getState().load(f.scope, null);
    await store.getState().select(f.sessionId);
    const spy = vi.spyOn(harness, 'generateInteractionRuntimeCandidateV1').mockImplementation(input => generate({ ...input, runAI: async () => { throw new Error('401 audit'); } }));
    await expect(store.getState().generateReplies({ replyToSequence: f.playerSequence, aiConfig: {} as never })).rejects.toThrow('401');
    expect(store.getState().generatingRunId).toBeNull();
    expect(store.getState().busy).toBe(false);
    expect(store.getState().runtimeState.interaction?.messages.filter(m => m.role === 'player')).toHaveLength(1);
    spy.mockImplementation(input => generate({ ...input, runAI: async () => JSON.stringify({ kind: 'character-reply', text: '现在可以回复了', replyToSequence: f.playerSequence, audienceKeys: ['player'], budgetCost: 1, disclosures: [] }) }));
    await store.getState().generateReplies({ replyToSequence: f.playerSequence, aiConfig: {} as never });
    expect(store.getState().runtimeState.interaction?.messages).toHaveLength(2);
});
it('honors director end without forcing another role to speak', async () => {
    const f = await seedChatRuntimeFixture(true);
    await store.getState().load(f.scope, null);
    await store.getState().select(f.sessionId);
    const spy = vi.spyOn(harness, 'generateInteractionRuntimeCandidateV1').mockImplementation(input => generate({ ...input, runAI: async () => JSON.stringify({ kind: 'scene-director', responders: [], shouldEnd: true, endReason: '本场景已经完成' }) }));
    await store.getState().generateReplies({ replyToSequence: f.playerSequence, aiConfig: {} as never });
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await readProductRuntimeState(f.sessionId)).interaction?.activeScene).toBeNull();
    expect(store.getState().generatingRunId).toBeNull();
});
it('allows a director to choose silence without inventing a reply', async () => {
    const f = await seedChatRuntimeFixture(true);
    await store.getState().load(f.scope, null);
    const spy = vi.spyOn(harness, 'generateInteractionRuntimeCandidateV1').mockImplementation(input => generate({ ...input, runAI: async () => JSON.stringify({ kind: 'scene-director', responders: [], shouldEnd: false, endReason: null }) }));
    await store.getState().generateReplies({ replyToSequence: f.playerSequence, aiConfig: {} as never });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(store.getState().runtimeState.interaction?.messages).toHaveLength(1);
});
it('resumes the frozen director plan after a partial failure without repeating committed speech', async () => {
    const f = await seedChatRuntimeFixture(true);
    await store.getState().load(f.scope, null);
    let directorCalls = 0, failBob = true;
    vi.spyOn(harness, 'generateInteractionRuntimeCandidateV1').mockImplementation(input => generate({ ...input, runAI: async () => {
            if (input.skillId === 'prose.interaction-scene-director') {
                directorCalls++;
                return JSON.stringify({ kind: 'scene-director', responders: [{ participantKey: 'aria', intent: '确认收到信' }, { participantKey: 'bob', intent: '补充地址' }], shouldEnd: false, endReason: null });
            }
            if (input.participantKey === 'bob' && failBob)
                throw new Error('模拟断线');
            return JSON.stringify({ kind: 'character-reply', text: input.participantKey + ' 的回应', replyToSequence: f.playerSequence, audienceKeys: ['player'], budgetCost: 1, disclosures: [] });
        } }));
    await expect(store.getState().generateReplies({ replyToSequence: f.playerSequence, aiConfig: {} as never })).rejects.toThrow('模拟断线');
    expect(store.getState().runtimeState.interaction?.messages.filter(m => m.role === 'character')).toHaveLength(1);
    failBob = false;
    await store.getState().load(f.scope, null);
    await store.getState().generateReplies({ replyToSequence: f.playerSequence, aiConfig: {} as never });
    expect(directorCalls).toBe(1);
    expect(store.getState().runtimeState.interaction?.messages.filter(m => m.role === 'character').map(m => m.speakerKey)).toEqual(['aria', 'bob']);
});
it('freezes per-role private knowledge, relationship initialization and the confirmed scene budget', async () => {
    const { compileInteractionModulesV1 } = await import('../../src/lib/product-production/product-module-compilers');
    const { DEFAULT_CHAT_SETTINGS } = await import('../../src/lib/character-interaction/authoring-contract');
    const input = { brief: { characterChat: { ...DEFAULT_CHAT_SETTINGS, mode: 'multi', maxTurns: 40, replyBudget: 95, characters: [{ sourceKey: 'role.a', voiceRules: '说话简短', privateKnowledge: '仅甲知道的信件', initialTrust: 32 }] }, source: { selection: { roleBindings: { participants: ['role.a', 'role.b'] } } }, intent: { productType: 'character-interaction', contentBoundaries: ['不替玩家发言'], openingSituation: '旧邮局', coreExperience: ['交谈'] }, scale: { targetPlayMinutes: 30 } }, sourceCatalog: { characters: [{ resourceKey: 'role.a', name: '甲', description: '信使' }, { resourceKey: 'role.b', name: '乙', description: '守卫' }] }, narrative: { nodes: [{ key: 'opening', kind: 'entry', title: '邮局', summary: '寻找信件' }, { key: 'end', kind: 'ending', title: '告别' }], beats: [], choices: [] } } as unknown as Parameters<typeof compileInteractionModulesV1>[0];
    const output = compileInteractionModulesV1(input);
    expect(output.sceneTemplates[0]).toMatchObject({ maxTurns: 40, directorBudget: 95 });
    expect(output.profiles[0].relationshipDimensions[0].initial).toBe(32);
    expect(output.profiles[0].initialKnowledge.find(k => k.visibility === 'private')?.content).toBe('仅甲知道的信件');
    expect(output.profiles[1].initialKnowledge.some(k => k.content.includes('仅甲知道的信件'))).toBe(false);
    expect(output.profiles[0].voiceRules).toContain('说话简短');
});
