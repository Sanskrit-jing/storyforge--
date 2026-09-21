/**
 * 朗读控制条 UI 状态 · 纯逻辑（无 DOM）。
 *
 * 控制条三种展示模式（完整条 / 最小化悬浮球 / 隐藏）与位置钳制规则在此单点维护，
 * 供组件与回归测试复用；位置持久化见 reader-settings。
 */

/** 控制条展示模式：完整条 / 最小化悬浮球 / 隐藏（朗读继续，从顶部「朗读」按钮唤回） */
export type ReaderBarMode = 'expanded' | 'minimized' | 'hidden'

/** 控制条左上角的视口坐标（fixed 定位） */
export interface ReaderBarPosition {
  x: number
  y: number
}

/** 控制条距视口边缘的最小间距（px） */
export const READER_BAR_MARGIN = 8

/**
 * 把控制条左上角钳制到视口内（留出边缘间距）。
 * 控制条自身大于视口时钳制上限收敛到边缘间距，保证不会出现负偏移。
 */
export function clampReaderBarPosition(
  position: ReaderBarPosition,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): ReaderBarPosition {
  const maxX = Math.max(READER_BAR_MARGIN, viewportWidth - width - READER_BAR_MARGIN)
  const maxY = Math.max(READER_BAR_MARGIN, viewportHeight - height - READER_BAR_MARGIN)
  return {
    x: Math.min(Math.max(position.x, READER_BAR_MARGIN), maxX),
    y: Math.min(Math.max(position.y, READER_BAR_MARGIN), maxY),
  }
}

/** 位置结构校验（供持久化读取时回落默认值） */
export function isValidReaderBarPosition(value: unknown): value is ReaderBarPosition {
  if (typeof value !== 'object' || value == null) return false
  const pos = value as Partial<ReaderBarPosition>
  return (
    typeof pos.x === 'number' && Number.isFinite(pos.x) &&
    typeof pos.y === 'number' && Number.isFinite(pos.y)
  )
}
