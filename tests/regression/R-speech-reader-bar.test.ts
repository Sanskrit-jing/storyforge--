import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clampReaderBarPosition,
  isValidReaderBarPosition,
  READER_BAR_MARGIN,
  type ReaderBarPosition,
} from '../../src/lib/speech/reader-bar'
import { loadReaderBarPosition, saveReaderBarPosition } from '../../src/lib/speech/reader-settings'

describe('R-朗读控制条：位置钳制', () => {
  it('视口内位置原样保留', () => {
    const pos: ReaderBarPosition = { x: 200, y: 150 }
    expect(clampReaderBarPosition(pos, 300, 56, 1280, 800)).toEqual(pos)
  })

  it('拖出左/上边界时钳制到边缘间距', () => {
    const clamped = clampReaderBarPosition({ x: -40, y: -10 }, 300, 56, 1280, 800)
    expect(clamped.x).toBe(READER_BAR_MARGIN)
    expect(clamped.y).toBe(READER_BAR_MARGIN)
  })

  it('拖出右/下边界时钳制到可视区内', () => {
    const clamped = clampReaderBarPosition({ x: 1300, y: 900 }, 300, 56, 1280, 800)
    expect(clamped.x).toBe(1280 - 300 - READER_BAR_MARGIN)
    expect(clamped.y).toBe(800 - 56 - READER_BAR_MARGIN)
  })

  it('控制条宽于视口时 x 上限收敛到边缘间距，不产生负偏移', () => {
    const clamped = clampReaderBarPosition({ x: 50, y: 50 }, 2000, 56, 1280, 800)
    expect(clamped.x).toBe(READER_BAR_MARGIN)
    expect(clamped.y).toBe(50) // y 未超界，正常保留
  })
})

describe('R-朗读控制条：位置结构校验', () => {
  it('有限数字 x/y 通过校验', () => {
    expect(isValidReaderBarPosition({ x: 0, y: 0 })).toBe(true)
    expect(isValidReaderBarPosition({ x: 12.5, y: 99 })).toBe(true)
  })

  it('非对象、缺字段、非有限数字均拒绝', () => {
    expect(isValidReaderBarPosition(null)).toBe(false)
    expect(isValidReaderBarPosition('x')).toBe(false)
    expect(isValidReaderBarPosition({})).toBe(false)
    expect(isValidReaderBarPosition({ x: 1 })).toBe(false)
    expect(isValidReaderBarPosition({ x: Number.NaN, y: 0 })).toBe(false)
    expect(isValidReaderBarPosition({ x: 1, y: Number.POSITIVE_INFINITY })).toBe(false)
    expect(isValidReaderBarPosition({ x: '8', y: 0 })).toBe(false)
  })
})

describe('R-朗读控制条：位置持久化', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('保存后可原样读回（位置记忆往返）', () => {
    const pos: ReaderBarPosition = { x: 320, y: 480 }
    saveReaderBarPosition(pos)
    expect(loadReaderBarPosition()).toEqual(pos)
  })

  it('未保存时返回 null（= 默认底部居中）', () => {
    expect(loadReaderBarPosition()).toBeNull()
  })

  it('存储损坏或结构非法时回落 null，不抛错', () => {
    localStorage.setItem('storyforge-speech-reader-bar', '{bad json')
    expect(loadReaderBarPosition()).toBeNull()
    localStorage.setItem('storyforge-speech-reader-bar', JSON.stringify({ x: 'a', y: 2 }))
    expect(loadReaderBarPosition()).toBeNull()
    localStorage.setItem('storyforge-speech-reader-bar', JSON.stringify(null))
    expect(loadReaderBarPosition()).toBeNull()
  })
})
