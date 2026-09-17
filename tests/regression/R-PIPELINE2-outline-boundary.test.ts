import { describe, expect, it } from 'vitest'
import { projectHeldItems } from '../../src/lib/consistency/held-items'
import { projectCharacterKnowledge } from '../../src/lib/knowledge-ledger/knowledge-ledger'
import type {
  Chapter,
  ItemLedgerEntry,
  KnowledgeLedgerEntry,
  OutlineNode,
} from '../../src/lib/types'

const nodes: OutlineNode[] = [
  { id: 1, projectId: 1, type: 'volume', parentId: null, title: '第一卷', summary: '', order: 0, createdAt: 1, updatedAt: 1 },
  { id: 11, projectId: 1, type: 'chapter', parentId: 1, title: '第一章', summary: '', order: 0, createdAt: 1, updatedAt: 1 },
  { id: 12, projectId: 1, type: 'chapter', parentId: 1, title: '第二章', summary: '', order: 1, createdAt: 1, updatedAt: 1 },
]
const chapters: Chapter[] = [{
  id: 101,
  projectId: 1,
  outlineNodeId: 11,
  title: '第一章',
  content: '',
  summary: '',
  wordCount: 0,
  status: 'draft',
  order: 0,
  notes: '',
  createdAt: 1,
  updatedAt: 1,
}]

describe('PIPELINE-2 · 未建正文的规范章序边界', () => {
  it('目标只有 outlineNodeId 时仍能投影此前持有物', () => {
    const entries: ItemLedgerEntry[] = [{
      id: 1,
      projectId: 1,
      chapterId: 101,
      chapterTitle: '第一章',
      itemName: '青铜钥匙',
      action: 'gain',
      quantity: 1,
      heldByName: '林舟',
      characterId: 7,
      note: '',
      createdAt: 1,
    }]
    const projected = projectHeldItems({
      entries,
      outlineNodes: nodes,
      chapters,
      outlineNodeId: 12,
    })
    expect(projected.map(item => item.itemName)).toEqual(['青铜钥匙'])
  })

  it('目标只有 outlineNodeId 时仍能投影此前确认认知', () => {
    const entries: KnowledgeLedgerEntry[] = [{
      id: 1,
      projectId: 1,
      worldGroupId: null,
      characterId: 7,
      characterName: '林舟',
      knowledgeKey: 'door-location',
      statement: '密门在西墙',
      belief: null,
      action: 'learn',
      sourceType: 'chapter',
      sourceChapterId: 101,
      sourceQuote: '他发现密门藏在西墙。',
      status: 'confirmed',
      createdAt: 1,
      updatedAt: 1,
    }]
    const projected = projectCharacterKnowledge({
      entries,
      outlineNodes: nodes,
      chapters,
      outlineNodeId: 12,
    })
    expect(projected.map(item => item.knowledgeKey)).toEqual(['door-location'])
  })
})
