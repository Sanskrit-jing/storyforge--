import type { ProductRuntimePackageV1, WorkspaceScope } from '../../src/lib/types';
import { readProductRuntimeStateVersion, startInteractionScene, commitInteractionPlayerMessage } from '../../src/lib/character-interaction/runtime-api';
import { seedCurrentProductBuild } from './current-product-build';
import { currentProductSelection, loadCurrentProductWorldSourceCatalogV1, seedCurrentProductWorld } from './current-product-world';
export async function seedChatRuntimeFixture(multi = false): Promise<{
    scope: WorkspaceScope;
    sessionId: number;
    playerSequence: number;
}> {
    const owned = await seedCurrentProductWorld('HARNESS-RUNTIME-1');
    const { scope, release } = owned;
    const catalog = await loadCurrentProductWorldSourceCatalogV1({
        scope,
        worldReleaseId: release.id!,
        productType: 'character-interaction',
    });
    const runtimePackage: ProductRuntimePackageV1 = {
        schema: 'storyforge.product-runtime-package',
        version: 1,
        productType: 'character-interaction',
        definition: {
            productKey: 'harness.runtime.interaction',
            title: '雨夜钟楼',
            description: '统一产品 Build 驱动的角色互动 Harness 测试包。',
            enabledCapabilities: ['narrative', 'interaction'],
            rulesetVersion: 1,
            initialVariables: {},
        },
        sourceWorld: {
            contentHash: release.contentHash,
            selection: currentProductSelection('character-interaction', {
                participants: [catalog.characters[0].resourceKey],
            }, catalog.worldReference.referenceHash),
        },
        narrative: {
            moduleKind: 'main',
            moduleTitle: '钟楼来信',
            entryNodeKey: 'tower.entry',
            nodes: [{
                    key: 'tower.entry', kind: 'ending', title: '雨夜钟楼', summary: '角色互动场景由产品模块独立推进。',
                    conditionJson: '{}', effectsJson: '[]', successorKeys: [],
                }],
            beats: [],
            choices: [],
        },
        interaction: {
            playerKey: 'player',
            profiles: [...(multi ? [{ participantKey: 'bob', characterKey: 'character:bob', name: '鲍勃', roleLabel: '同伴', voiceRules: '直接', initialKnowledge: [], relationshipDimensions: [], maxMemoryEntries: 20 }] : []), {
                    participantKey: 'aria', characterKey: 'character:aria', name: '阿莉娅',
                    roleLabel: '信使', voiceRules: '克制直接', initialKnowledge: [],
                    relationshipDimensions: [], maxMemoryEntries: 20,
                }],
            sceneTemplates: [{
                    sceneKey: 'tower', title: '钟楼', purpose: '回应玩家', location: '旧钟楼', timeLabel: '雨夜',
                    participantKeys: multi ? ['aria', 'bob'] : ['aria'], publicKnowledgeKeys: [], goals: ['回答问题'], endingConditions: ['玩家离开'],
                    safetyBoundaries: ['不替玩家发言'], relationshipRules: [], openingNodeKey: null, endingNodeKey: null,
                    maxTurns: 20, directorBudget: 100, order: 0,
                }],
        },
    };
    const { session: created } = await seedCurrentProductBuild({
        scope,
        worldRelease: release as typeof release & {
            id: number;
        },
        runtimePackage,
        title: '雨夜钟楼',
    });
    let version = await readProductRuntimeStateVersion(created.id!);
    await startInteractionScene({
        sessionId: created.id!, commandId: 'fixture:scene', baseSequence: version.sequence,
        baseStateHash: version.stateHash, sceneId: 'scene:tower:1', sceneKey: 'tower',
    });
    version = await readProductRuntimeStateVersion(created.id!);
    const player = await commitInteractionPlayerMessage({
        sessionId: created.id!, commandId: 'fixture:player', baseSequence: version.sequence,
        baseStateHash: version.stateHash, messageId: 'message:player:1', text: '你收到我的信了吗？', audienceKeys: multi ? ['aria', 'bob'] : ['aria'],
    });
    return { scope, sessionId: created.id!, playerSequence: player.sequence };
}
