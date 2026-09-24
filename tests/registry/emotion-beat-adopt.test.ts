/**
 * t1 回归 · emotionBeatCards AI 写回收口 adopt()
 *
 * 背景：情感节拍卡此前由 EmotionBeatCard 组件直接 saveCard 落库，
 * 绕过三注册表写回铁律（AI 写必须走 FIELD_REGISTRY + AdoptionSchema + adopt()）。
 * 现已补齐双登记，AI 生成路径统一走 adopt()。
 *
 * 覆盖：
 * 1. 登记完整性（字段白名单 + 集合策略）
 * 2. 首写：beats 数组 → JSON string 落库，projectId/时间戳自动盖章
 * 3. 重复生成同章：duplicatePolicy 'update' 原地更新不产生重复行
 * 4. FK 校验：chapterId 不属于当前项目时拒绝写入
 * 5. 白名单与 required：越权字段进 unknown 不落库，非法枚举 source 被拒
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { FIELD_BY_TARGET } from '../../src/lib/registry/field-registry'
import { ADOPTION_BY_TARGET } from '../../src/lib/registry/adoption-schema'
import { adopt } from '../../src/lib/registry/adopt'
import { parseBeats } from '../../src/lib/types/emotion-beat'

async function createProject(): Promise<number> {
  const now = Date.now()
  return await db.projects.add({
    name: 'EmotionBeat Adopt Test',
    genre: '',
    description: '',
    targetWordCount: 0,
    enableMultiWorld: true,
    createdAt: now,
    updatedAt: now,
  } as any) as number
}

async function createChapter(projectId: number): Promise<number> {
  const now = Date.now()
  return await db.chapters.add({
    projectId,
    outlineNodeId: 0,
    title: '第一章 雨夜',
    content: '<p>林飞在雨夜睁眼。</p>',
    wordCount: 9,
    status: 'draft',
    order: 0,
    createdAt: now,
    updatedAt: now,
  } as any) as number
}

function beat(label: string) {
  return { label, sceneGoal: '', emotionTone: '', readerFeeling: '', characterGrowth: '' }
}

describe('emotionBeatCards · AI 写回收口 adopt()', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    db.close()
  })

  it('三注册表双登记完整：字段白名单 + 集合策略', () => {
    const fields = FIELD_BY_TARGET.get('emotionBeatCards')
    expect(fields?.map(f => f.field).sort()).toEqual(
      ['beats', 'chapterId', 'chapterTitle', 'overallArc', 'source'].sort(),
    )
    const schema = ADOPTION_BY_TARGET.get('emotionBeatCards')
    expect(schema).toBeDefined()
    expect(schema?.duplicatePolicy).toBe('update')
    expect(schema?.fkChecks).toEqual([{ field: 'chapterId', target: 'chapters' }])
    expect(schema?.autoStamps).toEqual(['projectId', 'createdAt', 'updatedAt'])
  })

  it('AI 生成首写：beats 数组序列化为 JSON string，projectId/时间戳自动盖章', async () => {
    const projectId = await createProject()
    const chapterId = await createChapter(projectId)

    const result = await adopt({
      projectId,
      target: 'emotionBeatCards',
      mode: 'add',
      data: {
        chapterId,
        chapterTitle: '第一章 雨夜',
        overallArc: '压抑 → 爆发',
        beats: [
          { label: '开场', sceneGoal: '立危机', emotionTone: '紧张', readerFeeling: '揪心', characterGrowth: '被迫直面' },
          { label: '反转', sceneGoal: '揭底牌', emotionTone: '震撼', readerFeeling: '意外', characterGrowth: '看清真相' },
        ],
        source: 'ai',
      },
    })

    expect(result.skipped).toHaveLength(0)
    expect(result.typeErrors).toHaveLength(0)
    expect(result.written).toHaveLength(1)

    const rows = await db.emotionBeatCards.where('projectId').equals(projectId).toArray()
    expect(rows).toHaveLength(1)
    const row = rows[0] as any
    expect(row.chapterId).toBe(chapterId)
    expect(row.chapterTitle).toBe('第一章 雨夜')
    expect(row.overallArc).toBe('压抑 → 爆发')
    expect(row.source).toBe('ai')
    expect(typeof row.beats).toBe('string')
    expect(parseBeats(row.beats as string)).toHaveLength(2)
    expect(row.projectId).toBe(projectId)
    expect(typeof row.createdAt).toBe('number')
    expect(typeof row.updatedAt).toBe('number')
  })

  it('重复生成同章：duplicatePolicy update 原地更新，不产生重复行', async () => {
    const projectId = await createProject()
    const chapterId = await createChapter(projectId)
    const base = { chapterId, chapterTitle: '第一章 雨夜', source: 'ai' as const }

    await adopt({
      projectId, target: 'emotionBeatCards', mode: 'add',
      data: { ...base, overallArc: '旧弧线', beats: [beat('旧')] },
    })
    const second = await adopt({
      projectId, target: 'emotionBeatCards', mode: 'add',
      data: { ...base, overallArc: '新弧线', beats: [beat('新A'), beat('新B')] },
    })

    expect(second.written).toHaveLength(1)
    const rows = await db.emotionBeatCards.where('projectId').equals(projectId).toArray()
    expect(rows).toHaveLength(1)
    expect((rows[0] as any).overallArc).toBe('新弧线')
    expect(parseBeats((rows[0] as any).beats as string).map(b => b.label)).toEqual(['新A', '新B'])
  })

  it('FK 校验：chapterId 不属于当前项目时拒绝写入', async () => {
    const projectId = await createProject()
    await createChapter(projectId)

    const result = await adopt({
      projectId,
      target: 'emotionBeatCards',
      mode: 'add',
      data: {
        chapterId: 999999,
        chapterTitle: '幽灵章节',
        overallArc: '',
        beats: [beat('X')],
        source: 'ai',
      },
    })

    expect(result.written).toHaveLength(0)
    expect(await db.emotionBeatCards.where('projectId').equals(projectId).count()).toBe(0)
  })

  it('白名单与 required：越权字段进 unknown 不落库，非法枚举 source 被拒', async () => {
    const projectId = await createProject()
    const chapterId = await createChapter(projectId)

    const result = await adopt({
      projectId,
      target: 'emotionBeatCards',
      mode: 'add',
      data: {
        chapterId,
        chapterTitle: '第一章 雨夜',
        overallArc: '',
        beats: [beat('X')],
        source: 'hacked',
        rogueField: '越权字段',
      },
    })

    expect(result.unknown).toContain('rogueField')
    expect(result.typeErrors).toContainEqual(expect.objectContaining({ field: 'source' }))
    expect(result.written).toHaveLength(0)
    expect(await db.emotionBeatCards.where('projectId').equals(projectId).count()).toBe(0)
  })
})
