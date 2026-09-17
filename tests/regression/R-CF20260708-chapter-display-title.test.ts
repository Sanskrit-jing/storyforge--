import { describe, expect, it } from 'vitest'
import { resolveChapterDisplayMeta } from '../../src/lib/outline/chapter-display'
import type { Chapter, OutlineNode } from '../../src/lib/types'

const now = Date.now()

function outline(id: number, parentId: number | null, order: number, title: string, type: OutlineNode['type'] = 'chapter'): OutlineNode {
  return {
    id, projectId: 1, parentId, type, title, summary: '', order,
    createdAt: now, updatedAt: now,
  }
}

function chapter(id: number, outlineNodeId: number, order: number, title: string): Chapter {
  return {
    id, projectId: 1, outlineNodeId, title, content: '', wordCount: 0,
    status: 'draft', order, notes: '', createdAt: now, updatedAt: now,
  }
}

describe('R-CF20260708-chapter-display-title: 正文页标题从大纲派生', () => {
  it('uses outline title and canonical outline order even when Chapter.title/order is stale', () => {
    const volume = outline(1, null, 0, '第一卷', 'volume')
    const firstNode = outline(2, 1, 0, '第一章 新章名')
    const secondNode = outline(3, 1, 1, '第二章 发射与抵达')
    const secondChapter = chapter(11, 3, 5, '第四十一章 发射与抵达')

    expect(resolveChapterDisplayMeta(secondChapter, [volume, firstNode, secondNode]))
      .toEqual({
        title: '第二章 发射与抵达',
        ordinal: 2,
      })
  })

  it('matches imported dirty data where the outline row is fixed but the chapter record is still stale', () => {
    const volume = outline(1, null, 0, '第一卷', 'volume')
    const outlineNodes = [volume]
    for (let i = 1; i <= 54; i++) {
      outlineNodes.push(outline(
        i + 1,
        1,
        i - 1,
        i === 39 ? '第三十九章 发射与抵达' : `第${i}章`,
      ))
    }
    const targetChapter = chapter(121, 40, 120, '第四十一章 发射与抵达')

    expect(resolveChapterDisplayMeta(targetChapter, outlineNodes))
      .toEqual({
        title: '第三十九章 发射与抵达',
        ordinal: 39,
      })
  })

  it('reindexes the surviving chapter after middle outline chapters are deleted', () => {
    const volume = outline(1, null, 0, '第一卷', 'volume')
    const firstNode = outline(2, 1, 0, '第一章')
    const originalSixthNode = outline(7, 1, 5, '第六章 删除后应变第二章')
    const originalSixthChapter = chapter(16, 7, 5, '第六章 删除后应变第二章')

    expect(resolveChapterDisplayMeta(
      originalSixthChapter,
      [volume, firstNode, originalSixthNode],
    )).toEqual({
      title: '第六章 删除后应变第二章',
      ordinal: 2,
    })
  })
})
