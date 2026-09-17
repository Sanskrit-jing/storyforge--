import { describe, expect, it } from 'vitest'
import {
  checkCognitionBoundary,
  parseCognitionReferences,
  projectCharacterKnowledge,
} from '../../src/lib/knowledge-ledger/knowledge-ledger'
import { buildConsistencyAuditPrompt } from '../../src/lib/ai/adapters/consistency-audit-adapter'
import type { Chapter, KnowledgeLedgerEntry, OutlineNode } from '../../src/lib/types'

describe('CANON 覆盖基线 · 角色认知边界', () => {
  it('R-CANON-omniscient-1 · 第五章才获知的真相在第三章被引用时确定性命中', () => {
    const outlineNodes: OutlineNode[] = [
      { id: 1, projectId: 1, parentId: null, type: 'volume', title: '卷一', summary: '', order: 0, createdAt: 1, updatedAt: 1 },
      ...[1, 2, 3, 4, 5].map(index => ({
        id: 10 + index, projectId: 1, parentId: 1, type: 'chapter' as const,
        title: `第${index}章`, summary: '', order: index - 1, createdAt: 1, updatedAt: 1,
      })),
    ]
    const chapters: Chapter[] = [1, 2, 3, 4, 5].map(index => ({
      id: 20 + index, projectId: 1, outlineNodeId: 10 + index, title: `第${index}章`,
      content: '', wordCount: 0, status: 'draft', order: 6 - index,
      notes: '', createdAt: 1, updatedAt: 1,
    }))
    const event: KnowledgeLedgerEntry = {
      id: 31, projectId: 1, characterId: 7, characterName: '林飞',
      knowledgeKey: 'enemy.true_identity', statement: '黑衣人是城主',
      action: 'learn', sourceType: 'chapter', sourceChapterId: 25,
      status: 'confirmed', createdAt: 1, updatedAt: 1,
    }
    const text = '林飞断言黑衣人就是城主。'
    const catalog = [{
      characterId: 7, characterName: '林飞',
      knowledgeKey: 'enemy.true_identity', statement: '黑衣人是城主',
    }]
    const messages = buildConsistencyAuditPrompt({
      mode: 'fast',
      chapterTitle: '第三章',
      chapterContent: text,
      evidenceContext: '',
      cognitionCatalog: 'characterId=7 | knowledgeKey=enemy.true_identity',
    })
    expect(messages[0].content).toContain('cognitionReferences')

    const raw = JSON.stringify({
      findings: [],
      cognitionReferences: [{
        characterId: 7,
        knowledgeKey: 'enemy.true_identity',
        quote: text,
      }],
    })
    const references = parseCognitionReferences(raw, text, catalog)
    const projected = projectCharacterKnowledge({
      entries: [event],
      outlineNodes,
      chapters,
      chapterId: 23,
      characterId: 7,
    })
    const findings = checkCognitionBoundary(text, references, projected)

    expect(projected).toEqual([])
    expect(findings).toMatchObject([{
      category: '角色认知边界',
      severity: 'hard',
      quote: text,
    }])
  })
})
