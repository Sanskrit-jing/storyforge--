/**
 * PHRASE-1 · 全局常用语（作者手写跨项目快捷文案）
 *
 * 验证三注册表收口与工具语义:
 *  ① 注册表:commonPhrases 表 owner='global'、exportable=false;
 *  ② 不注入反例:默认与定向装配都不含常用语内容——常用语不进 AI 上下文,
 *    仅作者在各输入入口手动查找、点击填入或复制;
 *  ③ filterPhrases 计分:标题精确>标题前缀>标题包含>正文包含;空查询原样返回;同分按 updatedAt 降序;
 *  ④ 生命周期:删项目级联不触及 commonPhrases;
 *  ⑤ savePhrase/deletePhrase:空标题/内容拒绝、trim 落库、更新不换主键且刷新 updatedAt、删除生效;
 *  ⑥ joinPhrase:填入拼接不覆盖已有输入。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { assembleContext } from '../../src/lib/registry/assemble-context'
import { cascadeDeleteProject } from '../../src/lib/registry/lifecycle'
import { REGISTRY_BY_NAME } from '../../src/lib/registry/project-tables'
import {
  deletePhrase,
  filterPhrases,
  joinPhrase,
  readAllPhrases,
  savePhrase,
} from '../../src/lib/phrases/common-phrases'
import type { CommonPhraseEntry } from '../../src/lib/types'

async function createProject(): Promise<number> {
  const now = Date.now()
  return await db.projects.add({
    name: 'PHRASE1 Test', genre: '', description: '', targetWordCount: 0,
    enableMultiWorld: false, createdAt: now, updatedAt: now,
  } as any) as number
}

function makeEntry(overrides: Partial<CommonPhraseEntry>): CommonPhraseEntry {
  return { title: '条目', content: '内容', createdAt: 0, updatedAt: 0, ...overrides }
}

describe('PHRASE-1 · 全局常用语', () => {
  beforeEach(async () => { await db.delete(); await db.open() })
  afterEach(async () => { db.close() })

  it('① 注册表:commonPhrases 登记 owner=global、exportable=false', () => {
    const spec = REGISTRY_BY_NAME.get('commonPhrases')
    expect(spec).toBeDefined()
    expect(spec!.owner).toBe('global')
    expect(spec!.exportable).toBe(false)
  })

  it('② 不注入反例:默认与定向装配都不含常用语内容(仅作者手动查找)', async () => {
    const pid = await createProject()
    await savePhrase({ title: '情感不足', content: '这段内容缺乏情感，要怎么写' })

    const all = await assembleContext({ projectId: pid })
    expect(all.text).not.toContain('这段内容缺乏情感，要怎么写')

    const scoped = await assembleContext({ projectId: pid, sourceKeys: ['storyCore'] })
    expect(scoped.text).not.toContain('情感不足')
  })

  it('③ filterPhrases:标题精确>标题前缀>标题包含>正文包含;空查询原样返回', () => {
    const entries = [
      makeEntry({ title: '喜欢', content: '内容甲。', updatedAt: 1 }),
      makeEntry({ title: '喜欢的方式', content: '内容乙。', updatedAt: 2 }),
      makeEntry({ title: '愤怒', content: '正文里出现喜欢。', updatedAt: 3 }),
      makeEntry({ title: '无关', content: '无关内容。', updatedAt: 4 }),
    ]

    // 喜欢:精确 100 / 前缀 80 / 正文兜底 30
    expect(filterPhrases(entries, '喜欢').map(entry => entry.title))
      .toEqual(['喜欢', '喜欢的方式', '愤怒'])

    // 喜:两条同为前缀 80(同分按 updatedAt 降序),愤怒正文含「喜欢」兜底 30
    expect(filterPhrases(entries, '喜').map(entry => entry.title))
      .toEqual(['喜欢的方式', '喜欢', '愤怒'])

    // 仅正文命中
    expect(filterPhrases(entries, '无关内容').map(entry => entry.title)).toEqual(['无关'])

    // 空查询(含纯空白)原样返回全部
    expect(filterPhrases(entries, '')).toEqual(entries)
    expect(filterPhrases(entries, '   ')).toEqual(entries)
  })

  it('④ 删项目级联不触及 commonPhrases', async () => {
    const pid = await createProject()
    await savePhrase({ title: '跨项目片段', content: '删项目后仍须保留。' })

    await cascadeDeleteProject(pid)

    const rows = await db.commonPhrases.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('跨项目片段')
  })

  it('⑤ savePhrase:空标题/内容拒绝,trim 落库,更新不换主键且刷新 updatedAt,删除生效', async () => {
    await expect(savePhrase({ title: '  ', content: 'x' }))
      .rejects.toThrow('标题与内容均不能为空')
    await expect(savePhrase({ title: 'x', content: '  ' }))
      .rejects.toThrow('标题与内容均不能为空')

    const id = await savePhrase({ title: ' 情感不足 ', content: ' 这段内容缺乏情感，要怎么写 ' })
    const row = await db.commonPhrases.get(id)
    expect(row?.title).toBe('情感不足')
    expect(row?.content).toBe('这段内容缺乏情感，要怎么写')

    // 列表按 updatedAt 降序:最新保存的在前
    const secondId = await savePhrase({ title: '最新条目', content: '后保存的。' })
    const all = await readAllPhrases()
    expect(all.map(entry => entry.id)).toEqual([secondId, id])

    // 更新:保留 createdAt,刷新 updatedAt
    const before = await db.commonPhrases.get(id)
    await new Promise(resolve => setTimeout(resolve, 5))
    await savePhrase({ id, title: '情感不足（改）', content: '改后正文。' })
    const after = await db.commonPhrases.get(id)
    expect(after?.title).toBe('情感不足（改）')
    expect(after?.createdAt).toBe(before!.createdAt)
    expect(after!.updatedAt).toBeGreaterThan(before!.updatedAt)

    await deletePhrase(id)
    expect(await db.commonPhrases.get(id)).toBeUndefined()
  })

  it('⑥ joinPhrase:已有输入以换行拼接,空输入直接填入', () => {
    expect(joinPhrase('', '这段内容缺乏情感，要怎么写')).toBe('这段内容缺乏情感，要怎么写')
    expect(joinPhrase('   ', '新增内容')).toBe('新增内容')
    expect(joinPhrase('已有要求', '补充片段')).toBe('已有要求\n补充片段')
    expect(joinPhrase('已有要求  \n', '补充片段')).toBe('已有要求\n补充片段')
  })
})
