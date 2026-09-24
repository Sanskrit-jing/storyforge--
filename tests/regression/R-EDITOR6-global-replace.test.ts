import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db/schema'
import {
  buildGlobalReplacePreview,
  executeGlobalReplace,
  undoGlobalReplace,
  type GlobalReplaceSelection,
} from '../../src/lib/editor/global-find-replace'
import {
  collectSemanticSyncCandidates,
  executeSemanticSyncSuggestions,
  runSemanticSync,
  SEMANTIC_SYNC_CATEGORY,
  type SemanticSyncSuggestion,
} from '../../src/lib/editor/semantic-sync'
import type { AIConfig } from '../../src/lib/types'

const mocks = vi.hoisted(() => ({
  chat: vi.fn(async () => '{"suggestions":[]}'),
}))

vi.mock('../../src/lib/ai/client', () => ({
  chat: mocks.chat,
  resolveRequestConfig: (config: AIConfig) => ({ config }),
}))

const now = 1_800_000_000_000

async function seedProject() {
  const projectId = await db.projects.add({
    name: '全局替换测试',
    genre: 'xuanhuan',
    genres: ['xuanhuan'],
    status: 'ongoing',
    description: '',
    targetWordCount: 500_000,
    createdAt: now,
    updatedAt: now,
  } as any)

  const worldviewId = await db.worldviews.add({
    projectId,
    rules: '林尘的灵根封印在山门深处。',
    worldOrigin: '无关文本',
    createdAt: now,
    updatedAt: now,
  } as any)

  const storyCoreId = await db.storyCores.add({
    projectId,
    theme: '林尘的成长',
    mainPlot: '林尘踏上复仇之路',
    logline: '',
    concept: '',
    subPlots: '',
    centralConflict: '',
    plotPattern: '',
    createdAt: now,
    updatedAt: now,
  } as any)

  const outlineNodeId = await db.outlineNodes.add({
    projectId,
    parentId: null,
    type: 'chapter',
    title: '初入山门',
    summary: '',
    order: 0,
    createdAt: now,
    updatedAt: now,
  } as any)

  const chapterId = await db.chapters.add({
    projectId,
    outlineNodeId,
    title: '第一章',
    content: '<p>林尘举剑。</p><p><strong>林尘</strong>看见林尘儿。</p>',
    wordCount: 12,
    status: 'draft',
    order: 0,
    notes: '',
    createdAt: now,
    updatedAt: now,
  } as any)

  const noteId = await db.notes.add({
    projectId,
    chapterId,
    content: '本章记录林尘的首次出场',
    createdAt: now,
    updatedAt: now,
  } as any)

  const characterId = await db.characters.add({
    projectId,
    name: '林尘',
    role: 'protagonist',
    roleWeight: 'main',
    moralAxis: 'good',
    orderAxis: 'neutral',
    shortDescription: '',
    appearance: '',
    personality: '',
    background: '',
    motivation: '林尘要夺回家族传承',
    abilities: '',
    relationships: '[]',
    arc: '',
    createdAt: now,
    updatedAt: now,
  } as any)

  const longerCharacterId = await db.characters.add({
    projectId,
    name: '林尘儿',
    role: 'supporting',
    roleWeight: 'secondary',
    moralAxis: 'neutral',
    orderAxis: 'neutral',
    shortDescription: '',
    appearance: '',
    personality: '',
    background: '',
    motivation: '',
    abilities: '',
    relationships: '[]',
    arc: '',
    createdAt: now,
    updatedAt: now,
  } as any)

  return {
    projectId,
    worldviewId,
    storyCoreId,
    outlineNodeId,
    chapterId,
    noteId,
    characterId,
    longerCharacterId,
  }
}

async function selectedAll(projectId: number, query: string): Promise<GlobalReplaceSelection[]> {
  const preview = await buildGlobalReplacePreview(projectId, { query, replacement: '陆沉' })
  return preview.groups.flatMap(group =>
    group.records.map(record => ({ target: group.target, id: record.id })))
}

describe('EDITOR-6 · 全局跨表查找替换', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('预览跨表命中 text 字段与章节 HTML 正文，长名保护不误伤', async () => {
    const { projectId } = await seedProject()
    const preview = await buildGlobalReplacePreview(projectId, { query: '林尘', replacement: '陆沉' })

    expect(preview.blockers).toEqual([])
    expect(preview.totalMatches).toBe(8)
    expect(preview.totalRecords).toBe(5)
    expect(preview.groups.map(group => group.target)).toEqual([
      'worldviews', 'storyCores', 'characters', 'chapters', 'notes',
    ])

    const worldviewGroup = preview.groups.find(group => group.target === 'worldviews')!
    expect(worldviewGroup.records[0]?.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'rules', count: 1 }),
    ]))

    const chapterGroup = preview.groups.find(group => group.target === 'chapters')!
    const contentField = chapterGroup.records[0]?.fields.find(field => field.field === 'content')
    expect(contentField?.count).toBe(2)

    // 「林尘儿」被长名保护跳过，不产生任何命中记录
    const characterGroup = preview.groups.find(group => group.target === 'characters')!
    expect(characterGroup.records.map(record => record.id)).toEqual([characterGroup.records[0]?.id])
    expect(preview.warnings.join('')).toContain('更长的实体名')
  })

  it('空查询与相同替换内容都会阻止执行', async () => {
    const { projectId } = await seedProject()
    const empty = await buildGlobalReplacePreview(projectId, { query: '  ', replacement: '陆沉' })
    expect(empty.blockers.join('')).toContain('查找内容不能为空')
    expect(empty.groups).toEqual([])

    const same = await buildGlobalReplacePreview(projectId, { query: '林尘', replacement: '林尘' })
    expect(same.blockers.join('')).toContain('替换内容与查找内容相同')
  })

  it('执行走快照 + 跨表写入（adopt 分流与直接 update 分流），并可原子撤销', async () => {
    const seeded = await seedProject()
    const preview = await buildGlobalReplacePreview(seeded.projectId, { query: '林尘', replacement: '陆沉' })
    const selected = preview.groups.flatMap(group =>
      group.records.map(record => ({ target: group.target, id: record.id })))
    const createSnapshot = vi.fn().mockResolvedValue(77)

    const result = await executeGlobalReplace({
      projectId: seeded.projectId,
      expectedBaseline: preview.baseline,
      selected,
      createSnapshot,
      label: '全局替换',
    })

    expect(createSnapshot).toHaveBeenCalledWith(seeded.projectId, '全局替换', 'manual')
    expect(result.snapshotId).toBe(77)
    expect(result.changedRecords).toBe(5)
    expect(result.totalReplacements).toBe(8)

    // 直接 update 分流：worldviews / storyCores / notes
    expect((await db.worldviews.get(seeded.worldviewId))?.rules).toBe('陆沉的灵根封印在山门深处。')
    expect((await db.storyCores.get(seeded.storyCoreId))?.theme).toBe('陆沉的成长')
    expect((await db.storyCores.get(seeded.storyCoreId))?.mainPlot).toBe('陆沉踏上复仇之路')
    expect((await db.notes.get(seeded.noteId))?.content).toBe('本章记录陆沉的首次出场')
    // adopt 分流：characters
    expect((await db.characters.get(seeded.characterId))?.name).toBe('陆沉')
    expect((await db.characters.get(seeded.characterId))?.motivation).toBe('陆沉要夺回家族传承')
    // HTML 正文文本节点级替换，长名「林尘儿」保留
    const chapter = await db.chapters.get(seeded.chapterId)
    expect(chapter?.content).toBe('<p>陆沉举剑。</p><p><strong>陆沉</strong>看见林尘儿。</p>')
    expect(typeof chapter?.wordCount).toBe('number')
    expect((await db.characters.get(seeded.longerCharacterId))?.name).toBe('林尘儿')

    const restored = await undoGlobalReplace(result.undoPatch)
    expect(restored).toBe(5)
    expect((await db.worldviews.get(seeded.worldviewId))?.rules).toBe('林尘的灵根封印在山门深处。')
    expect((await db.storyCores.get(seeded.storyCoreId))?.theme).toBe('林尘的成长')
    expect((await db.characters.get(seeded.characterId))?.name).toBe('林尘')
    expect((await db.chapters.get(seeded.chapterId))?.content).toBe('<p>林尘举剑。</p><p><strong>林尘</strong>看见林尘儿。</p>')
    expect((await db.notes.get(seeded.noteId))?.content).toBe('本章记录林尘的首次出场')
  })

  it('未勾选记录时拒绝执行', async () => {
    const { projectId } = await seedProject()
    const preview = await buildGlobalReplacePreview(projectId, { query: '林尘', replacement: '陆沉' })
    const createSnapshot = vi.fn().mockResolvedValue(1)
    await expect(executeGlobalReplace({
      projectId,
      expectedBaseline: preview.baseline,
      selected: [],
      createSnapshot,
      label: '空勾选',
    })).rejects.toThrow('请先勾选')
    expect(createSnapshot).not.toHaveBeenCalled()
  })

  it('预览后数据变化拒绝执行，快照失败不写入任何记录', async () => {
    const seeded = await seedProject()
    const stalePreview = await buildGlobalReplacePreview(seeded.projectId, { query: '林尘', replacement: '陆沉' })
    await db.worldviews.update(seeded.worldviewId, { rules: '人工改动的规则' })
    const createSnapshot = vi.fn().mockResolvedValue(3)
    await expect(executeGlobalReplace({
      projectId: seeded.projectId,
      expectedBaseline: stalePreview.baseline,
      selected: await selectedAll(seeded.projectId, '林尘'),
      createSnapshot,
      label: '过期预览',
    })).rejects.toThrow('重新预览')
    expect(createSnapshot).not.toHaveBeenCalled()

    const freshPreview = await buildGlobalReplacePreview(seeded.projectId, { query: '林尘', replacement: '陆沉' })
    await expect(executeGlobalReplace({
      projectId: seeded.projectId,
      expectedBaseline: freshPreview.baseline,
      selected: await selectedAll(seeded.projectId, '林尘'),
      createSnapshot: vi.fn().mockRejectedValue(new Error('磁盘已满')),
      label: '失败快照',
    })).rejects.toThrow('磁盘已满')

    expect((await db.storyCores.get(seeded.storyCoreId))?.theme).toBe('林尘的成长')
    expect((await db.chapters.get(seeded.chapterId))?.content).toContain('林尘举剑')
    expect((await db.characters.get(seeded.characterId))?.name).toBe('林尘')
  })

  it('事务中任一写入失败会回滚全部替换', async () => {
    const seeded = await seedProject()
    const preview = await buildGlobalReplacePreview(seeded.projectId, { query: '林尘', replacement: '陆沉' })
    vi.spyOn(db.notes, 'update').mockRejectedValueOnce(new Error('笔记写入失败'))

    await expect(executeGlobalReplace({
      projectId: seeded.projectId,
      expectedBaseline: preview.baseline,
      selected: await selectedAll(seeded.projectId, '林尘'),
      createSnapshot: vi.fn().mockResolvedValue(9),
      label: '回滚测试',
    })).rejects.toThrow('笔记写入失败')

    expect((await db.worldviews.get(seeded.worldviewId))?.rules).toBe('林尘的灵根封印在山门深处。')
    expect((await db.storyCores.get(seeded.storyCoreId))?.theme).toBe('林尘的成长')
    expect((await db.characters.get(seeded.characterId))?.name).toBe('林尘')
    expect((await db.chapters.get(seeded.chapterId))?.content).toContain('林尘举剑')
  })
})

describe('EDITOR-6 · AI 语义同步', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    mocks.chat.mockReset()
    mocks.chat.mockImplementation(async () => '{"suggestions":[]}')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('候选收集只含 text 字段且按 focusKeyword 预筛', async () => {
    const seeded = await seedProject()
    const { candidates, scannedFields, truncated } = await collectSemanticSyncCandidates(
      seeded.projectId,
      { changeSummary: '主角改名：林尘→陆沉', focusKeyword: '林尘' },
    )

    const keys = candidates.map(candidate => candidate.key)
    expect(keys).toContain(`worldviews#${seeded.worldviewId}:rules`)
    expect(keys).toContain(`storyCores#${seeded.storyCoreId}:theme`)
    expect(keys).toContain(`characters#${seeded.characterId}:motivation`)
    expect(keys).toContain(`notes#${seeded.noteId}:content`)
    // 章节正文（html 字段）不参与语义同步
    expect(keys).not.toContain(`chapters#${seeded.chapterId}:content`)
    // 空文本字段不进入候选
    expect(keys).not.toContain(`storyCores#${seeded.storyCoreId}:logline`)
    expect(truncated).toBe(false)
    expect(scannedFields).toBeGreaterThanOrEqual(candidates.length)

    const scoped = await collectSemanticSyncCandidates(
      seeded.projectId,
      { changeSummary: '调整故事核心', targets: ['storyCores'] },
    )
    expect(scoped.candidates.length).toBeGreaterThan(0)
    expect(scoped.candidates.every(candidate => candidate.target === 'storyCores')).toBe(true)
  })

  it('解析 AI 建议时过滤无效 key、去重并回填真实当前值', async () => {
    const seeded = await seedProject()
    const key = `worldviews#${seeded.worldviewId}:rules`
    mocks.chat.mockResolvedValue(JSON.stringify({
      suggestions: [
        { key, suggestedText: '陆沉的灵根封印在山门深处。', reason: '主角改名联动' },
        { key: '未知表#1:rules', suggestedText: '越界建议' },
        { key, suggestedText: '重复建议' },
        { key, suggestedText: '  ' },
      ],
    }))

    const result = await runSemanticSync({
      projectId: seeded.projectId,
      request: { changeSummary: '主角改名：林尘→陆沉', focusKeyword: '林尘' },
      aiConfig: {} as AIConfig,
    })

    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0]).toMatchObject({
      key,
      target: 'worldviews',
      field: 'rules',
      suggestedText: '陆沉的灵根封印在山门深处。',
      reason: '主角改名联动',
    })
    expect(result.suggestions[0]?.currentText).toBe('林尘的灵根封印在山门深处。')
    expect(mocks.chat).toHaveBeenCalledTimes(1)
    const [, , meta] = mocks.chat.mock.calls[0] as [{ role: string }[], unknown, { category: string }]
    expect(meta.category).toBe(SEMANTIC_SYNC_CATEGORY)
  })

  it('AI 误输出元数据标签行时剥离前缀或丢弃建议，避免污染字段', async () => {
    const seeded = await seedProject()
    const rulesKey = `worldviews#${seeded.worldviewId}:rules`
    const motivationKey = `characters#${seeded.characterId}:motivation`
    mocks.chat.mockResolvedValue(JSON.stringify({
      suggestions: [
        // 标签前缀 + 正文（字段名一致）→ 剥离保留正文
        { key: rulesKey, suggestedText: '世界观「陆沉」·世界规则：陆沉的灵根封印在山门深处。' },
        // 整行标签、剥后为空 → 丢弃（宁可漏改也不写标签）
        { key: motivationKey, suggestedText: '角色「陆沉」·动机：' },
        // 标签结构但字段名与候选 fieldLabel 不一致 → 丢弃
        { key: motivationKey, suggestedText: '角色「陆沉」·称号：灵剑宗弟子' },
      ],
    }))

    const result = await runSemanticSync({
      projectId: seeded.projectId,
      request: { changeSummary: '主角改名：林尘→陆沉', focusKeyword: '林尘' },
      aiConfig: {} as AIConfig,
    })

    const keys = result.suggestions.map(suggestion => suggestion.key)
    expect(keys).toContain(rulesKey)
    expect(keys).not.toContain(motivationKey)
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0]?.suggestedText).toBe('陆沉的灵根封印在山门深处。')
  })

  it('变更说明为空与 AI 返回无法解析时都会报错', async () => {
    const seeded = await seedProject()
    await expect(runSemanticSync({
      projectId: seeded.projectId,
      request: { changeSummary: '   ' },
      aiConfig: {} as AIConfig,
    })).rejects.toThrow('请先描述变更内容')
    expect(mocks.chat).not.toHaveBeenCalled()

    mocks.chat.mockResolvedValue('抱歉，我无法输出 JSON。')
    await expect(runSemanticSync({
      projectId: seeded.projectId,
      request: { changeSummary: '主角改名：林尘→陆沉' },
      aiConfig: {} as AIConfig,
    })).rejects.toThrow('AI 返回格式无法解析')
  })

  it('应用建议走统一写回分流并可通过撤销链恢复', async () => {
    const seeded = await seedProject()
    const suggestions: SemanticSyncSuggestion[] = [
      {
        key: `worldviews#${seeded.worldviewId}:rules`,
        target: 'worldviews',
        id: seeded.worldviewId,
        field: 'rules',
        targetLabel: '世界观',
        recordLabel: '世界观',
        fieldLabel: '世界规则',
        currentText: '林尘的灵根封印在山门深处。',
        suggestedText: '陆沉的灵根封印在山门深处。',
        reason: '主角改名联动',
      },
      {
        key: `characters#${seeded.characterId}:motivation`,
        target: 'characters',
        id: seeded.characterId,
        field: 'motivation',
        targetLabel: '角色',
        recordLabel: '林尘',
        fieldLabel: '动机',
        currentText: '林尘要夺回家族传承',
        suggestedText: '陆沉要夺回家族传承',
        reason: '主角改名联动',
      },
    ]
    const createSnapshot = vi.fn().mockResolvedValue(88)

    const result = await executeSemanticSyncSuggestions({
      projectId: seeded.projectId,
      suggestions,
      createSnapshot,
      label: 'AI 语义同步测试',
    })

    expect(createSnapshot).toHaveBeenCalledWith(seeded.projectId, 'AI 语义同步测试', 'manual')
    expect(result.snapshotId).toBe(88)
    expect(result.changedRecords).toBe(2)
    expect(result.undoPatch.query).toBe('AI 语义同步')
    expect((await db.worldviews.get(seeded.worldviewId))?.rules).toBe('陆沉的灵根封印在山门深处。')
    expect((await db.characters.get(seeded.characterId))?.motivation).toBe('陆沉要夺回家族传承')
    expect((await db.characters.get(seeded.characterId))?.name).toBe('林尘')

    await undoGlobalReplace(result.undoPatch)
    expect((await db.worldviews.get(seeded.worldviewId))?.rules).toBe('林尘的灵根封印在山门深处。')
    expect((await db.characters.get(seeded.characterId))?.motivation).toBe('林尘要夺回家族传承')
  })

  it('空建议与记录丢失时拒绝写入', async () => {
    const seeded = await seedProject()
    await expect(executeSemanticSyncSuggestions({
      projectId: seeded.projectId,
      suggestions: [],
      createSnapshot: vi.fn().mockResolvedValue(1),
      label: '空建议',
    })).rejects.toThrow('请先勾选')

    const stale: SemanticSyncSuggestion[] = [{
      key: 'worldviews#99999:rules',
      target: 'worldviews',
      id: 99999,
      field: 'rules',
      targetLabel: '世界观',
      recordLabel: '世界观',
      fieldLabel: '世界规则',
      currentText: '已删除',
      suggestedText: '新文本',
      reason: '测试',
    }]
    await expect(executeSemanticSyncSuggestions({
      projectId: seeded.projectId,
      suggestions: stale,
      createSnapshot: vi.fn().mockResolvedValue(2),
      label: '记录丢失',
    })).rejects.toThrow('记录已不存在')
  })
})
