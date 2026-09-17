import { describe, expect, it } from 'vitest'
import { getTopLevelVolumes } from '../../src/lib/outline/selectors'
import { normalizeOutlineNode } from '../../src/lib/outline/normalize'
import type { OutlineNode } from '../../src/lib/types'

const baseNode = {
  id: 1,
  projectId: 1,
  parentId: null,
  type: 'volume',
  title: '第一卷',
  order: 0,
  createdAt: 1,
  updatedAt: 1,
} satisfies Omit<OutlineNode, 'summary'>

describe('R-CF-outline-summary-crash: 大纲脏 summary 不击穿 UI', () => {
  it('选择器会把历史/导入脏节点的 summary 兜成字符串', () => {
    const dirty = { ...baseNode } as unknown as OutlineNode
    const volumes = getTopLevelVolumes([dirty])

    expect(volumes).toHaveLength(1)
    expect(volumes[0].summary).toBe('')
    expect(() => volumes[0].summary.trim()).not.toThrow()
  })

  it('单节点规范化同时兜住 title/order/parentId', () => {
    const dirty = {
      ...baseNode,
      parentId: undefined,
      title: undefined,
      summary: undefined,
      order: undefined,
    } as unknown as OutlineNode

    const normalized = normalizeOutlineNode(dirty)

    expect(normalized.parentId).toBeNull()
    expect(normalized.title).toBe('')
    expect(normalized.summary).toBe('')
    expect(normalized.order).toBe(0)
  })
})
