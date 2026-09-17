import { describe, expect, it } from 'vitest'
import { checkHeldItemAcquisition } from '../../src/lib/consistency/held-items'
import type { ItemLedgerEntry } from '../../src/lib/types'

describe('CANON 覆盖基线 · 物品持有连续性', () => {
  it('R-CANON-item-1 · 已持有物品被再次写成首次获得时确定性命中', () => {
    const evidence = {
      id: 17,
      projectId: 1,
      itemName: '玄铁剑',
      heldByName: '林飞',
      characterId: 9,
      action: 'gain',
      quantity: 1,
      chapterId: 3,
      chapterTitle: '第三章',
      createdAt: 1,
    } satisfies ItemLedgerEntry

    const findings = checkHeldItemAcquisition(
      '林飞第一次获得玄铁剑，随即拔剑迎敌。',
      [{
        itemName: '玄铁剑',
        quantity: 1,
        heldByName: '林飞',
        characterId: 9,
        evidence: [evidence],
      }],
      ['玄铁剑'],
      ['林飞'],
    )

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      category: '物品持有连续性',
      severity: 'risk',
      quote: '林飞第一次获得玄铁剑，随即拔剑迎敌。',
    })
    expect(findings[0].evidence[0]).toMatchObject({
      sourceType: 'canon',
      sourceId: 17,
    })
  })
})
