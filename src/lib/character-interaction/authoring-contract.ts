/** Product-owned S2 settings; these never mutate a source WorldRelease. */
export interface ChatAuthoringSettingsV1 {
    version: 1;
    playerRole: string;
    openingSituation: string;
    experience: string;
    mode: 'single' | 'multi';
    targetPlayMinutes: number;
    maxTurns: number;
    replyBudget: number;
    maxMemoryEntries: number;
    relationshipThreshold: number;
    contentBoundaries: string;
    qualityProfile: 'prototype' | 'internal' | 'commercial-candidate';
    characters: {
        sourceKey: string;
        voiceRules: string;
        privateKnowledge: string;
        initialTrust: number;
    }[];
}
export const DEFAULT_CHAT_SETTINGS: ChatAuthoringSettingsV1 = { version: 1, playerRole: '', openingSituation: '', experience: '', mode: 'single', targetPlayMinutes: 30, maxTurns: 60, replyBudget: 120, maxMemoryEntries: 120, relationshipThreshold: 20, contentBoundaries: '不替玩家决定行动；不披露角色不知道的信息。', qualityProfile: 'prototype', characters: [] };
export function parseChatAuthoringSettingsV1(value: unknown): ChatAuthoringSettingsV1 {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('角色聊天方案必须是对象');
    const row = value as Record<string, unknown>;
    if (Object.keys(row).length !== Object.keys(DEFAULT_CHAT_SETTINGS).length || Object.keys(row).some(k => !(k in DEFAULT_CHAT_SETTINGS)) || row.version !== 1)
        throw new Error('角色聊天方案字段或版本无效');
    for (const key of ['playerRole', 'openingSituation', 'experience', 'contentBoundaries'])
        if (typeof row[key] !== 'string' || String(row[key]).length > 5000)
            throw new Error(`${key} 最多 5000 字符`);
    if (!['single', 'multi'].includes(String(row.mode)) || !['prototype', 'internal', 'commercial-candidate'].includes(String(row.qualityProfile)))
        throw new Error('角色聊天模式无效');
    for (const [key, max] of [['targetPlayMinutes', 900], ['maxTurns', 1000], ['replyBudget', 10000], ['maxMemoryEntries', 1000], ['relationshipThreshold', 100]] as const)
        if (!Number.isInteger(row[key]) || Number(row[key]) < 1 || Number(row[key]) > max)
            throw new Error(`${key} 必须为 1～${max} 的整数`);
    if (!Array.isArray(row.characters) || row.characters.length > 8)
        throw new Error('最多配置 8 个角色');
    const keys = new Set<string>();
    for (const c of row.characters) {
        if (!c || typeof c !== 'object' || Object.keys(c).sort().join(',') !== 'initialTrust,privateKnowledge,sourceKey,voiceRules' || typeof c.sourceKey !== 'string' || !c.sourceKey || c.sourceKey.length > 500 || keys.has(c.sourceKey) || typeof c.voiceRules !== 'string' || c.voiceRules.length > 5000 || typeof c.privateKnowledge !== 'string' || c.privateKnowledge.length > 5000 || !Number.isInteger(c.initialTrust) || c.initialTrust < -100 || c.initialTrust > 100)
            throw new Error('人物设置无效：请选择独立来源并填写合法关系初值');
        keys.add(c.sourceKey);
    }
    return structuredClone(value) as ChatAuthoringSettingsV1;
}
export interface ChatAuthoringDraftV1 {
    id?: number;
    projectId: number;
    worldId: number;
    workId: number;
    revision: number;
    settingsJson: string;
    worldReleaseId: number | null;
    productionId: number | null;
    conversationJson: string;
    createdAt: number;
    updatedAt: number;
}
