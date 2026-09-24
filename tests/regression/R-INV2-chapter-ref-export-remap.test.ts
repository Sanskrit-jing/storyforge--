/**
 * R-INV2 · 章节软引用导出重映射(foreshadows / stateCards / notes)。
 *
 * 反例:
 *   三张表的章节引用字段未登记 exportRemap,导出 JSON 里保留旧项目 db id,
 *   导入到新项目后指向错误章节(或根本不存在的 id) → 伏笔时间线/状态卡溯源/笔记挂靠全错。
 *
 * 守卫:
 *   导出 → 导入往返后:
 *   - foreshadows.plantChapterId / resolveChapterId / expectedResolveChapterId 重映射到新项目章节 id;
 *   - foreshadows.echoChapterIds(JSON 数组串)按导出序号重映射回新 id 串;
 *   - stateCards.lastChapterId、notes.chapterId 重映射;
 *   - 影子字段缺失(旧备份)时软引用安全置空,不猜测旧 db id。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { deriveExportProjectJSON } from '../../src/lib/export/registry-export'
import { deriveImportProjectJSON } from '../../src/lib/export/registry-import'

const now = Date.now()

async function seedRemapProject() {
  const projectId = await db.projects.add({
    name: 'INV2-EXPORT', genre: '', description: '', targetWordCount: 0,
    enableMultiWorld: false, createdAt: now, updatedAt: now,
  } as any) as number
  const vol = await db.outlineNodes.add({
    projectId, parentId: null, type: 'volume', title: '卷一', summary: '',
    order: 0, createdAt: now, updatedAt: now,
  } as any) as number
  const makeChapter = async (order: number, title: string) => {
    const nodeId = await db.outlineNodes.add({
      projectId, parentId: vol, type: 'chapter', title, summary: '',
      order, createdAt: now, updatedAt: now,
    } as any) as number
    return await db.chapters.add({
      projectId, outlineNodeId: nodeId, title, content: '<p>test</p>',
      wordCount: 0, status: 'draft', order, notes: '',
      createdAt: now, updatedAt: now,
    } as any) as number
  }
  const ch1 = await makeChapter(0, '第1章')
  const ch2 = await makeChapter(1, '第2章')

  await db.foreshadows.add({
    projectId, name: '青铜铃的来历', type: 'chekhov', status: 'planted',
    description: '铃铛响起时……', plantChapterId: ch1, resolveChapterId: ch2,
    expectedResolveChapterId: ch2, echoChapterIds: JSON.stringify([ch1, ch2]),
    notes: '', createdAt: now, updatedAt: now,
  } as any)

  await db.stateCards.add({
    projectId, category: 'character', entityName: '林风',
    fields: JSON.stringify([{ key: '境界', value: '炼气' }]),
    lastChapterId: ch1, createdAt: now, updatedAt: now,
  } as any)

  await db.notes.add({
    projectId, title: '挂章笔记', content: '笔记内容', chapterId: ch1,
    pinned: false, createdAt: now, updatedAt: now,
  } as any)
  await db.notes.add({
    projectId, title: '全局笔记', content: '不挂章', pinned: false,
    createdAt: now, updatedAt: now,
  } as any)

  return { projectId, ch1, ch2 }
}

describe('R-INV2 · 章节软引用导出重映射', () => {
  beforeEach(async () => { await db.delete(); await db.open() })
  afterEach(() => { db.close() })

  it('导出时三表章节引用转为导出序号影子字段,原 db id 不再出现在导出 JSON', async () => {
    const { projectId, ch1 } = await seedRemapProject()
    const data = await deriveExportProjectJSON(projectId) as any

    const foreshadow = data.foreshadows[0]
    expect(foreshadow.plantChapterId).toBeUndefined()
    expect(foreshadow.resolveChapterId).toBeUndefined()
    expect(foreshadow.expectedResolveChapterId).toBeUndefined()
    expect(foreshadow._plantChapterExportId).toBe(0)
    expect(foreshadow._resolveChapterExportId).toBe(1)
    expect(foreshadow._expectedResolveChapterExportId).toBe(1)
    expect(foreshadow._echoChapterIndexes).toEqual([0, 1])

    expect(data.stateCards[0].lastChapterId).toBeUndefined()
    expect(data.stateCards[0]._lastChapterExportId).toBe(0)

    const attachNote = data.notes.find((n: any) => n.title === '挂章笔记')
    const globalNote = data.notes.find((n: any) => n.title === '全局笔记')
    expect(attachNote.chapterId).toBeUndefined()
    expect(attachNote._chapterExportId).toBe(0)
    expect(globalNote.chapterId).toBeUndefined()
    expect(globalNote._chapterExportId).toBeNull()

    // 原 db id 不应残留在导出 JSON(跨项目不可移植)
    const raw = JSON.stringify(data)
    expect(raw).not.toContain(`"plantChapterId":${ch1}`)
    expect(raw).not.toContain(`"lastChapterId":${ch1}`)
  })

  it('导出 → 导入往返后章节引用全部重映射到新项目章节', async () => {
    const { projectId } = await seedRemapProject()
    const data = await deriveExportProjectJSON(projectId)
    const newId = await deriveImportProjectJSON(data)

    const newChapters = await db.chapters.where('projectId').equals(newId).toArray()
    const newCh1 = newChapters.find(c => c.title === '第1章')!
    const newCh2 = newChapters.find(c => c.title === '第2章')!
    expect(newCh1).toBeDefined()
    expect(newCh2).toBeDefined()

    const foreshadow = (await db.foreshadows.where('projectId').equals(newId).toArray())[0]
    expect(foreshadow.plantChapterId).toBe(newCh1.id)
    expect(foreshadow.resolveChapterId).toBe(newCh2.id)
    expect(foreshadow.expectedResolveChapterId).toBe(newCh2.id)
    expect(JSON.parse(foreshadow.echoChapterIds)).toEqual([newCh1.id, newCh2.id])

    const stateCard = (await db.stateCards.where('projectId').equals(newId).toArray())[0]
    expect(stateCard.lastChapterId).toBe(newCh1.id)

    const notes = await db.notes.where('projectId').equals(newId).toArray()
    expect(notes.find(n => n.title === '挂章笔记')!.chapterId).toBe(newCh1.id)
    expect(notes.find(n => n.title === '全局笔记')!.chapterId ?? null).toBeNull()
  })

  it('旧备份缺影子字段时软引用安全置空,不猜测旧 db id', async () => {
    const { projectId } = await seedRemapProject()
    const data = await deriveExportProjectJSON(projectId) as any

    // 模拟旧版本备份:没有影子字段
    delete data.foreshadows[0]._plantChapterExportId
    delete data.stateCards[0]._lastChapterExportId

    const newId = await deriveImportProjectJSON(data)

    const foreshadow = (await db.foreshadows.where('projectId').equals(newId).toArray())[0]
    expect(foreshadow.plantChapterId).toBeNull()

    const stateCard = (await db.stateCards.where('projectId').equals(newId).toArray())[0]
    expect(stateCard.lastChapterId ?? null).toBeNull()
  })
})
