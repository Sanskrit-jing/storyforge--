import { describe, expect, it } from 'vitest'
import {
  listInventoryExtractionChapters,
  selectInventoryExtractionChapters,
} from '../../src/lib/inventory/extraction-range'
import type { Chapter, OutlineNode } from '../../src/lib/types'

const now = Date.now()
const written = `<p>${'已写正文'.repeat(20)}</p>`

function node(id: number, parentId: number | null, type: OutlineNode['type'], title: string, order: number): OutlineNode {
  return {
    id, projectId: 1, parentId, type, title, summary: '', order,
    createdAt: now, updatedAt: now,
  }
}

function chapter(id: number, outlineNodeId: number, title: string, content: string, order: number): Chapter {
  return {
    id, projectId: 1, outlineNodeId, title, content, wordCount: content.length,
    status: 'draft', order, notes: '', createdAt: now, updatedAt: now,
  }
}

const outlineNodes = [
  node(1, null, 'volume', '卷一', 0),
  node(12, 1, 'chapter', '第二章', 1),
  node(11, 1, 'chapter', '第一章', 0),
  node(13, 1, 'chapter', '第三章', 2),
]
const chapters = [
  chapter(101, 11, '第一章', written, 99),
  chapter(102, 12, '第二章', '', 0),
  chapter(103, 13, '第三章', written, 1),
]

describe('QUICKWIN-3 · 物品提取规范章序范围', () => {
  it('使用大纲规范章序，不依赖 chapter.order 或数组顺序', () => {
    const listed = listInventoryExtractionChapters(chapters, outlineNodes)
    expect(listed.map(item => [item.ordinal, item.chapter.id])).toEqual([
      [1, 101],
      [2, 102],
      [3, 103],
    ])
  })

  it('全部模式只返回有正文的章节并保持规范顺序', () => {
    const selected = selectInventoryExtractionChapters({
      chapters, outlineNodes, mode: 'all',
    })
    expect(selected.error).toBeNull()
    expect(selected.chapters.map(item => item.id)).toEqual([101, 103])
  })

  it('自定义范围按完整章序序号过滤，再跳过范围内无正文章节', () => {
    const selected = selectInventoryExtractionChapters({
      chapters, outlineNodes, mode: 'range', startOrdinal: 2, endOrdinal: 3,
    })
    expect(selected.error).toBeNull()
    expect(selected.chapters.map(item => item.id)).toEqual([103])
  })

  it('反向范围明确报错且不返回章节', () => {
    const selected = selectInventoryExtractionChapters({
      chapters, outlineNodes, mode: 'range', startOrdinal: 3, endOrdinal: 1,
    })
    expect(selected.chapters).toEqual([])
    expect(selected.error).toBe('起始章不能大于结束章')
  })

  it('范围内没有已写正文时明确报错', () => {
    const selected = selectInventoryExtractionChapters({
      chapters, outlineNodes, mode: 'range', startOrdinal: 2, endOrdinal: 2,
    })
    expect(selected.chapters).toEqual([])
    expect(selected.error).toBe('所选范围内没有可提取的已写正文')
  })
})
