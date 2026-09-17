import type { DragEvent as ReactDragEvent } from 'react'

export const OUTLINE_CHAPTER_DRAG_MIME = 'application/x-storyforge-outline-chapter'

export interface ChapterDragPayload {
  chapterId: number
  sourceParentId: number | null
}

export function readChapterDragPayload(event: ReactDragEvent): ChapterDragPayload | null {
  const raw = event.dataTransfer?.getData(OUTLINE_CHAPTER_DRAG_MIME) ?? ''
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ChapterDragPayload>
    const chapterId = Number(parsed.chapterId)
    const sourceParentId = parsed.sourceParentId == null ? null : Number(parsed.sourceParentId)
    if (!Number.isFinite(chapterId)) return null
    if (sourceParentId != null && !Number.isFinite(sourceParentId)) return null
    return { chapterId, sourceParentId }
  } catch {
    const legacyId = Number(raw)
    return Number.isFinite(legacyId) ? { chapterId: legacyId, sourceParentId: null } : null
  }
}

export function hasChapterDragPayload(event: ReactDragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes(OUTLINE_CHAPTER_DRAG_MIME)
}

export type GetActiveChapterDrag = () => ChapterDragPayload | null

/** 阅读顺序里的一章（卷 → 故事块 → 章节），siblingIndex 是它在所属父级章节中的位次。 */
export interface ChapterReadingOrderEntry {
  id: number
  parentId: number
  siblingIndex: number
}

/**
 * 触摸端「上移/下移一章」的落点计算。
 *
 * HTML5 拖拽在触屏上不可用（手指拖动会被浏览器判成滚动），手机/平板改用按钮，
 * 这里算出按钮要调用的 `moveNodeToParent(chapterId, targetParentId, index)` 参数。
 * 已在首/末位、或章节不在阅读顺序里时返回 null。
 *
 * index 的口径是「目标父级里剔除本章之后」的插入位：
 *   · 上移 → 落在目标章之前；
 *   · 跨父下移要 +1 才落在目标章之后（同父时剔除本章已自带一位位移）。
 */
export function computeChapterStepTarget(
  readingOrder: ChapterReadingOrderEntry[],
  chapterId: number,
  delta: -1 | 1,
): { targetParentId: number; index: number } | null {
  const from = readingOrder.findIndex(item => item.id === chapterId)
  const to = from + delta
  if (from < 0 || to < 0 || to >= readingOrder.length) return null
  const current = readingOrder[from]
  const target = readingOrder[to]
  const crossParent = target.parentId !== current.parentId
  return {
    targetParentId: target.parentId,
    index: target.siblingIndex + (delta > 0 && crossParent ? 1 : 0),
  }
}

export function chapterDropProps({
  targetParentId,
  targetIndex,
  onMoveChapter,
  getActiveChapterDrag,
  clearActiveChapterDrag,
}: {
  targetParentId: number
  targetIndex: number
  onMoveChapter: (chapterId: number, targetParentId: number, index: number) => Promise<void>
  getActiveChapterDrag: GetActiveChapterDrag
  clearActiveChapterDrag: () => void
}) {
  return {
    onDragOver: (event: ReactDragEvent) => {
      if (!getActiveChapterDrag() && !hasChapterDragPayload(event)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    },
    onDrop: async (event: ReactDragEvent) => {
      const payload = readChapterDragPayload(event) ?? getActiveChapterDrag()
      if (!payload) return
      event.preventDefault()
      event.stopPropagation()
      try {
        await onMoveChapter(payload.chapterId, targetParentId, targetIndex)
      } finally {
        clearActiveChapterDrag()
      }
    },
  }
}
