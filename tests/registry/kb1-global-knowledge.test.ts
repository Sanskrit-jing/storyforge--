/**
 * KB-1 · 全局知识库（查阅式参考手册）
 *
 * 验证三注册表收口与查阅语义:
 *  ① 注册表:knowledgeSelection/knowledgeQuery 源登记,常驻源 globalKnowledge 已下线;
 *    globalKnowledgeEntries 表 owner='global'、exportable=false;
 *  ② 不注入反例:默认装配与定向装配都不包含知识内容,知识只经显式勾选或
 *    search_knowledge 查询进入上下文;
 *  ③ 匹配引擎:主题精确>触发词精确>主题包含>触发词包含>正文兜底;停用排除;limit 封顶;
 *  ④ 工具:search_knowledge 注册、执行与参数校验;
 *  ⑤ 勾选注入:knowledgeEntryKeys 精确取条目(顺序保持、去重、停用跳过);
 *  ⑥ 生命周期:删项目级联不触及 global 表;JSON v2 导出导入往返 + v1 兼容。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { CONTEXT_SOURCE_BY_KEY } from '../../src/lib/registry/context-sources'
import { assembleContext } from '../../src/lib/registry/assemble-context'
import { cascadeDeleteProject } from '../../src/lib/registry/lifecycle'
import { REGISTRY_BY_NAME } from '../../src/lib/registry/project-tables'
import {
  exportGlobalKnowledge,
  importGlobalKnowledge,
  readKnowledgeSelectionContext,
  saveKnowledgeEntry,
  deleteKnowledgeEntry,
  searchKnowledgeContext,
  searchKnowledgeEntries,
} from '../../src/lib/knowledge/global-knowledge'
import { AGENT_TOOL_BY_NAME, executeAgentTool } from '../../src/lib/agent/tool-registry'
import {
  KNOWLEDGE_MAX_TRIGGERS,
  normalizeKnowledgeTriggers,
  type GlobalKnowledgeEntry,
} from '../../src/lib/types/global-knowledge'

async function createProject(): Promise<number> {
  const now = Date.now()
  return await db.projects.add({
    name: 'KB1 Test', genre: '', description: '', targetWordCount: 0,
    enableMultiWorld: false, createdAt: now, updatedAt: now,
  } as any) as number
}

async function addEntry(overrides: Partial<GlobalKnowledgeEntry> = {}): Promise<GlobalKnowledgeEntry> {
  const now = Date.now()
  const id = await db.globalKnowledgeEntries.add({
    title: '条目', content: '内容', category: '其他', enabled: true, triggers: [],
    createdAt: now, updatedAt: now,
    ...overrides,
  } as GlobalKnowledgeEntry) as number
  return (await db.globalKnowledgeEntries.get(id))!
}

describe('KB-1 · 全局知识库（查阅式）', () => {
  beforeEach(async () => { await db.delete(); await db.open() })
  afterEach(async () => { db.close() })

  it('① 注册表:两个知识源登记完整,常驻源 globalKnowledge 已下线,global 表登记不变', () => {
    const selection = CONTEXT_SOURCE_BY_KEY.get('knowledgeSelection')
    expect(selection).toBeDefined()
    expect(selection!.layer).toBe('L0')
    expect(selection!.budgetTokens).toBe(50_000)

    const query = CONTEXT_SOURCE_BY_KEY.get('knowledgeQuery')
    expect(query).toBeDefined()
    expect(query!.layer).toBe('L2')
    expect(query!.budgetTokens).toBe(6000)

    expect(CONTEXT_SOURCE_BY_KEY.has('globalKnowledge')).toBe(false)

    const spec = REGISTRY_BY_NAME.get('globalKnowledgeEntries')
    expect(spec).toBeDefined()
    expect(spec!.owner).toBe('global')
    expect(spec!.exportable).toBe(false)
  })

  it('② 不注入反例:默认全源装配与定向装配都不含知识内容', async () => {
    const pid = await createProject()
    await addEntry({ title: '喜欢的写法', content: '喜欢是藏在细节里的目光。', triggers: ['心动'] })

    const all = await assembleContext({ projectId: pid })
    expect(all.included).not.toContain('knowledgeSelection')
    expect(all.included).not.toContain('knowledgeQuery')
    expect(all.text).not.toContain('喜欢的写法')
    expect(all.text).not.toContain('喜欢是藏在细节里的目光。')

    const scoped = await assembleContext({ projectId: pid, sourceKeys: ['storyCore'] })
    expect(scoped.text).not.toContain('喜欢的写法')
  })

  it('② 守卫反例:显式指定知识源但没有勾选键/查询词时同样不注入', async () => {
    const pid = await createProject()
    await addEntry({ title: '喜欢的写法', content: '范例正文。' })

    const noSelection = await assembleContext({ projectId: pid, sourceKeys: ['knowledgeSelection'] })
    expect(noSelection.included).not.toContain('knowledgeSelection')
    expect(noSelection.omitted).toContain('knowledgeSelection')

    const noQuery = await assembleContext({ projectId: pid, sourceKeys: ['knowledgeQuery'] })
    expect(noQuery.included).not.toContain('knowledgeQuery')
    expect(noQuery.omitted).toContain('knowledgeQuery')
  })

  it('③ 匹配引擎:主题精确>触发词精确>主题包含>触发词包含>正文兜底', async () => {
    await addEntry({ title: '喜欢', content: '主题精确命中的范例。', createdAt: 1, updatedAt: 1 })
    await addEntry({ title: '喜欢的方式', content: '标题包含命中。', createdAt: 2, updatedAt: 2 })
    await addEntry({ title: '愤怒', content: '正文里出现喜欢这个词的兜底命中。', createdAt: 3, updatedAt: 3 })
    await addEntry({ title: '别的主题', content: '无关内容。', triggers: ['告白'], createdAt: 4, updatedAt: 4 })
    await addEntry({ title: '心动', content: '无关内容。', triggers: ['暗恋心事'], createdAt: 5, updatedAt: 5 })

    const hits = await searchKnowledgeEntries('喜欢')
    expect(hits.map(h => h.entry.title)).toEqual(['喜欢', '喜欢的方式', '愤怒'])
    expect(hits[0]).toMatchObject({ reason: 'title', score: 100 })
    expect(hits[1]).toMatchObject({ reason: 'title', score: 80 })
    expect(hits[2]).toMatchObject({ reason: 'content', score: 30 })

    const triggerExact = await searchKnowledgeEntries('告白')
    expect(triggerExact).toHaveLength(1)
    expect(triggerExact[0]).toMatchObject({ entry: { title: '别的主题' }, reason: 'trigger', score: 90 })

    const triggerPartial = await searchKnowledgeEntries('暗恋')
    expect(triggerPartial).toHaveLength(1)
    expect(triggerPartial[0]).toMatchObject({ entry: { title: '心动' }, reason: 'trigger', score: 60 })
  })

  it('③ 停用条目不参与查询;空查询返回空;limit 默认 5、封顶 10、同分按创建顺序', async () => {
    await addEntry({ title: '喜欢', content: '启用条目。', createdAt: 2, updatedAt: 2 })
    await addEntry({ title: '喜欢', content: '停用条目不应出现。', enabled: false, createdAt: 1, updatedAt: 1 })
    expect((await searchKnowledgeEntries('喜欢')).map(h => h.entry.content)).toEqual(['启用条目。'])
    expect(await searchKnowledgeEntries('   ')).toEqual([])

    for (let i = 0; i < 14; i++) {
      await addEntry({ title: `主题${i}`, content: '批量内容。', createdAt: i, updatedAt: i })
    }
    expect(await searchKnowledgeEntries('主题')).toHaveLength(5)
    expect(await searchKnowledgeEntries('主题', 99)).toHaveLength(10)
    expect((await searchKnowledgeEntries('主题', 2)).map(h => h.entry.title)).toEqual(['主题0', '主题1'])
  })

  it('④ searchKnowledgeContext:命中按主题小节格式化并带触发词,未命中给提示', async () => {
    await addEntry({ title: '喜欢', content: '范例正文。', triggers: ['心动', '告白'] })
    const hit = await searchKnowledgeContext('喜欢')
    expect(hit).toContain('【知识库查询 · 1 条匹配「喜欢」】')
    expect(hit).toContain('◆ 喜欢（其他）')
    expect(hit).toContain('触发词：心动、告白')
    expect(hit).toContain('范例正文。')

    const miss = await searchKnowledgeContext('不存在的主题')
    expect(miss).toBe('【知识库查询】没有匹配「不存在的主题」的条目。')
  })

  it('⑤ search_knowledge 工具:注册、执行命中、无命中提示、参数校验', async () => {
    const tool = AGENT_TOOL_BY_NAME.get('search_knowledge')
    expect(tool).toBeDefined()
    expect(tool!.risk).toBe('read')
    expect(tool!.sourceKeys).toEqual(['knowledgeQuery'])

    const pid = await createProject()
    await addEntry({ title: '喜欢', content: '工具查询到的范例。', triggers: ['心动'] })

    const result = await executeAgentTool('search_knowledge', { projectId: pid }, { query: '喜欢' })
    expect(result.ok).toBe(true)
    expect(result.meta.included).toContain('knowledgeQuery')
    expect(result.content).toContain('工具查询到的范例。')

    const miss = await executeAgentTool('search_knowledge', { projectId: pid }, { query: '不存在的主题词' })
    expect(miss.ok).toBe(true)
    expect(miss.content).toContain('没有匹配')

    const tooShort = await executeAgentTool('search_knowledge', { projectId: pid }, { query: '喜' })
    expect(tooShort.ok).toBe(false)
    expect(tooShort.error).toContain('query 长度必须为 2-100')

    const tooLong = await executeAgentTool('search_knowledge', { projectId: pid }, { query: '字'.repeat(101) })
    expect(tooLong.ok).toBe(false)
    expect(tooLong.error).toContain('query 长度必须为 2-100')

    const badLimit = await executeAgentTool('search_knowledge', { projectId: pid }, { query: '喜欢', limit: 11 })
    expect(badLimit.ok).toBe(false)
    expect(badLimit.error).toContain('limit 不能大于 10')

    const noArgs = await executeAgentTool('search_knowledge', { projectId: pid }, {})
    expect(noArgs.ok).toBe(false)
    expect(noArgs.error).toContain('缺少必填参数')

    const extraArg = await executeAgentTool('search_knowledge', { projectId: pid }, { query: '喜欢', kinds: ['chapter'] })
    expect(extraArg.ok).toBe(false)
    expect(extraArg.error).toContain('不允许的参数')
  })

  it('⑤ 勾选注入:按勾选顺序精确取条目,去重且停用与未知键跳过', async () => {
    const a = await addEntry({ title: '喜欢的写法', content: '范例甲。', triggers: ['心动'] })
    const b = await addEntry({ title: '文风约定', content: '范例乙。' })
    await addEntry({ title: '停用条目', content: '不应出现。', enabled: false })

    const context = await readKnowledgeSelectionContext([
      String(b.id!), String(a.id!), String(a.id!), '999', 'not-a-number', String(a.id!),
    ])
    expect(context).toContain('【全局知识库 · 作者勾选的参考条目】')
    expect(context.indexOf('文风约定')).toBeLessThan(context.indexOf('喜欢的写法'))
    expect(context.match(/范例甲。/g)).toHaveLength(1)
    expect(context).not.toContain('停用条目')

    expect(await readKnowledgeSelectionContext([])).toBe('')
    expect(await readKnowledgeSelectionContext(['999'])).toBe('')
  })

  it('⑤ assembleContext 经 knowledgeSelection 源注入勾选条目', async () => {
    const pid = await createProject()
    const entry = await addEntry({ title: '喜欢的写法', content: '范例甲。', triggers: ['心动'] })

    const assembled = await assembleContext({
      projectId: pid,
      sourceKeys: ['knowledgeSelection'],
      knowledgeEntryKeys: [String(entry.id!)],
    })
    expect(assembled.included).toContain('knowledgeSelection')
    expect(assembled.text).toContain('【全局知识库 · 作者勾选的参考条目】')
    expect(assembled.text).toContain('范例甲。')

    const enabledGuard = await assembleContext({ projectId: pid, sourceKeys: ['knowledgeSelection'] })
    expect(enabledGuard.omitted).toContain('knowledgeSelection')
  })

  it('⑥ 删项目级联不触及 globalKnowledgeEntries', async () => {
    const pid = await createProject()
    await addEntry({ title: '跨项目约定', content: '删项目后仍须保留。' })

    await cascadeDeleteProject(pid)

    const rows = await db.globalKnowledgeEntries.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('跨项目约定')
  })

  it('⑥ saveKnowledgeEntry:空标题/正文拒绝,触发词归一化落库,删除生效', async () => {
    await expect(saveKnowledgeEntry({ title: '  ', content: 'x', category: '', enabled: true }))
      .rejects.toThrow('标题与正文均不能为空')
    await expect(saveKnowledgeEntry({ title: 'x', content: '  ', category: '', enabled: true }))
      .rejects.toThrow('标题与正文均不能为空')

    const id = await saveKnowledgeEntry({
      title: ' 喜欢 ', content: ' 范例 ', category: '  ', enabled: true, triggers: [' 心动 ', '告白', '告白'],
    })
    const row = await db.globalKnowledgeEntries.get(id)
    expect(row?.title).toBe('喜欢')
    expect(row?.content).toBe('范例')
    expect(row?.category).toBe('其他')
    expect(row?.triggers).toEqual(['心动', '告白'])

    await deleteKnowledgeEntry(id)
    expect(await db.globalKnowledgeEntries.get(id)).toBeUndefined()
  })

  it('⑥ v2 导出导入往返:含 triggers;v1 兼容丢弃旧字段;非法条目跳过;格式不符拒收', async () => {
    // 经真实保存路径写入,触发词落库前已归一化
    await saveKnowledgeEntry({
      title: '原始条目', content: '导出内容。', category: '其他', enabled: true,
      triggers: ['心动', '心动', '   ', 123 as unknown as string],
    })
    const exported = await exportGlobalKnowledge()
    expect(exported.format).toBe('storyforge-global-knowledge')
    expect(exported.version).toBe(2)
    expect(exported.entries[0].triggers).toEqual(['心动'])

    await db.delete()
    await db.open()
    const result = await importGlobalKnowledge({
      format: 'storyforge-global-knowledge',
      version: 2,
      exportedAt: Date.now(),
      entries: [
        { title: '甲', content: '内容甲。', category: '文风', triggers: ['告白', '告白', '', 'x'.repeat(40)] },
        { title: '乙', content: '内容乙。', enabled: false, weight: 3, tokenCap: 100 } as GlobalKnowledgeEntry,
        { title: '', content: '缺标题跳过。' },
        { title: '缺正文', content: '   ' },
        'not-an-object' as unknown as GlobalKnowledgeEntry,
      ],
    })
    expect(result.imported).toBe(2)
    expect(result.skipped).toBe(2)

    const rows = await db.globalKnowledgeEntries.toArray()
    const byTitle = new Map(rows.map(row => [row.title, row]))
    expect(byTitle.get('甲')?.triggers).toEqual(['告白', 'x'.repeat(30)])
    expect(byTitle.get('甲')?.enabled).toBe(true)
    expect(byTitle.get('乙')?.enabled).toBe(false)
    expect(byTitle.get('乙')?.triggers).toEqual([])

    // v1 旧文件兼容:可导入,旧 weight/tokenCap 字段被丢弃
    const v1 = await importGlobalKnowledge({
      format: 'storyforge-global-knowledge',
      version: 1,
      exportedAt: Date.now(),
      entries: [{ title: '旧版条目', content: 'v1 内容。', weight: 2, tokenCap: 300 } as GlobalKnowledgeEntry],
    })
    expect(v1.imported).toBe(1)
    const v1Row = (await db.globalKnowledgeEntries.toArray()).find(row => row.title === '旧版条目')
    expect(v1Row).toBeDefined()
    expect((v1Row as Record<string, unknown>).weight).toBeUndefined()
    expect((v1Row as Record<string, unknown>).tokenCap).toBeUndefined()

    expect(await importGlobalKnowledge({ foo: 1 })).toEqual({ imported: 0, skipped: 0 })
    expect(await importGlobalKnowledge({
      format: 'storyforge-global-knowledge', version: 99, entries: [],
    })).toEqual({ imported: 0, skipped: 0 })
  })

  it('⑥ normalizeKnowledgeTriggers:去空白/去重/截长/限量', () => {
    expect(normalizeKnowledgeTriggers([' 心动 ', '心动', '', null, 42, '告白']))
      .toEqual(['心动', '告白'])
    expect(normalizeKnowledgeTriggers('不是数组')).toEqual([])
    expect(normalizeKnowledgeTriggers(['长'.repeat(40)])).toEqual(['长'.repeat(30)])
    const many = Array.from({ length: 20 }, (_, i) => `词${i}`)
    expect(normalizeKnowledgeTriggers(many)).toHaveLength(KNOWLEDGE_MAX_TRIGGERS)
  })
})
