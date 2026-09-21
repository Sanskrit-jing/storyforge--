import FullScreenTextarea from '../shared/FullScreenTextarea'
/**
 * Phase 35-a — 通用词条面板
 *
 * 三栏：领域分类树（左） → 词条列表（中） → 词条详情表单（右，由 fieldSchema 驱动）。
 * 支持内置分类播种、自定义分类增删、词条 CRUD、词条间 ref 关联。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus, Trash2, EyeOff, Eye, FolderPlus, Boxes, Settings2, X,
  Sparkles, Loader2, ChevronLeft, Maximize2,
} from 'lucide-react'
import { useCodexStore } from '../../stores/codex'
import {
  CODEX_DOMAIN_LABELS, filterCodexEntriesByWorld, parseFieldSchema,
  type CodexDomain, type CodexCategory, type CodexEntry,
} from '../../lib/types/codex'
import type { Project } from '../../lib/types'
import { useDialog } from '../shared/Dialog'
import { useAIConfigStore } from '../../stores/ai-config'
import { useWorldGroupStore } from '../../stores/world-group'
import { chat, resolveRequestConfig } from '../../lib/ai/client'
import { getAIConfigRequiredMessage, isAIConfigReady } from '../../lib/ai/config-readiness'
import {
  buildCodexExtractPrompt, parseCodexEntries, splitExtractionText,
} from '../../lib/ai/adapters/structured-extract-adapter'
import { adopt } from '../../lib/registry/adopt'
import { useToast } from '../shared/Toast'
import { uniqueBy } from '../../lib/ai/structured-extraction'
import { assembleContext } from '../../lib/registry/assemble-context'
import CodexCategoryFieldsEditor from './CodexCategoryFieldsEditor'
import CodexEntryDetail from './CodexEntryDetail'
import { useIsNarrow } from '../../hooks/useIsNarrow'
import { InlineInput, InlineTextarea } from '../shared/InlineEdit'
import FullScreenViewer from '../shared/FullScreenViewer'

interface Props {
  project: Project
  /** B3:嵌入自然/人文面板时锁定领域并隐藏顶部切换标签(独立面板不传=完整两栏切换) */
  fixedDomain?: CodexDomain
  /**
   * 锁定到指定内置分类(builtInKey 列表)——用于"世界观每个方面下面只显示对应那一类词条"。
   * 传 1 个 key:单分类模式(隐藏左侧分类树,只剩该类的词条)。
   * 传多个 key(如自然资源 mineral/herb/beast):只显示这几类,可在它们间切换。
   */
  fixedCategoryKeys?: string[]
  /** 嵌入模式:去掉外层标题/高度占满,适配面板内嵌 */
  embedded?: boolean
  /** 当前方面上方的整段全貌，作为 AI 拆分词条的默认来源。 */
  extractionSourceText?: string
}

const DOMAINS: CodexDomain[] = ['natural', 'humanity']

export default function CodexPanel({ project, fixedDomain, fixedCategoryKeys, embedded, extractionSourceText = '' }: Props) {
  const dialog = useDialog()
  const toast = useToast()
  const aiConfig = useAIConfigStore(s => s.config)
  const activeGroupId = useWorldGroupStore(s => s.activeGroupId)
  const worldGroups = useWorldGroupStore(s => s.groups)
  const projectId = project.id!
  const {
    categories, entries, loadAll,
    addCategory, deleteCategory, setCategoryHidden, updateCategory,
    addEntry, updateEntry, deleteEntry,
  } = useCodexStore()

  // 锁定单一分类:隐藏分类树,只展示该类词条
  const lockedKeys = fixedCategoryKeys
  const lockedSingle = (lockedKeys?.length ?? 0) === 1

  // 窄屏(<768px)三栏放不下,改为「列表页 ⇄ 词条详情页」两段式钻取
  const isNarrow = useIsNarrow()

  const [domainState, setDomain] = useState<CodexDomain>(fixedDomain ?? 'natural')
  const domain = fixedDomain ?? domainState
  const [activeCatId, setActiveCatId] = useState<number | null>(null)
  const [activeEntryId, setActiveEntryId] = useState<number | null>(null)
  // 窄屏当前处于详情页;宽屏无副作用
  const [narrowDetailOpen, setNarrowDetailOpen] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  // B1:自定义字段管理弹窗
  const [showFieldsEditor, setShowFieldsEditor] = useState(false)
  // 词条排序方式:order=手动顺序 / importance=重要度降序 / pinyin=拼音首字母
  const [sortMode, setSortMode] = useState<'order' | 'importance' | 'pinyin'>('order')
  const [extractOpen, setExtractOpen] = useState(false)
  const [extractText, setExtractText] = useState('')
  const [supplementTags, setSupplementTags] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [candidates, setCandidates] = useState<ReturnType<typeof parseCodexEntries>>([])
  const [selectedCandidates, setSelectedCandidates] = useState<Set<number>>(new Set())
  const [candidatesFullscreen, setCandidatesFullscreen] = useState(false)
  // 拆分结果反馈：attempted 标记本轮已跑完；error 持久展示在弹窗内（toast 会自动消失，手机上容易漏看）
  const [extractAttempted, setExtractAttempted] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  // 候选区锚点：拆分完成后自动滚动过去（候选区渲染在按钮下方，窄屏一屏放不下，不滚会误以为「没有结果」）
  const extractResultRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadAll(projectId) }, [projectId, loadAll])

  const activeGroupBelongsToProject = worldGroups.some(group =>
    group.projectId === projectId && group.id === activeGroupId)
  const scopedWorldGroupId = project.enableMultiWorld
    ? (activeGroupBelongsToProject ? activeGroupId! : undefined)
    : null
  const scopeReady = scopedWorldGroupId !== undefined
  const scopedEntries = useMemo(
    () => scopeReady ? filterCodexEntriesByWorld(entries, scopedWorldGroupId) : [],
    [entries, scopeReady, scopedWorldGroupId],
  )

  // 当前领域的分类（按 order）。若锁定了 builtInKey 列表,则只取那几类(跨域亦可)。
  const domainCats = useMemo(
    () => {
      if (lockedKeys && lockedKeys.length) {
        return categories
          .filter(c => c.builtInKey && lockedKeys.includes(c.builtInKey))
          .sort((a, b) => lockedKeys.indexOf(a.builtInKey!) - lockedKeys.indexOf(b.builtInKey!))
      }
      return categories.filter(c => c.domain === domain).sort((a, b) => a.order - b.order)
    },
    [categories, domain, lockedKeys],
  )
  const visibleCats = useMemo(
    () => domainCats.filter(c => showHidden || !c.hidden),
    [domainCats, showHidden],
  )

  // 默认选中第一个可见分类
  useEffect(() => {
    if (activeCatId && visibleCats.some(c => c.id === activeCatId)) return
    setActiveCatId(visibleCats[0]?.id ?? null)
    setActiveEntryId(null)
  }, [visibleCats, activeCatId])

  const activeCat = categories.find(c => c.id === activeCatId) || null
  const catEntries = useMemo(() => {
    const list = scopedEntries.filter(e => e.categoryId === activeCatId)
    if (sortMode === 'importance') {
      return [...list].sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0) || a.order - b.order)
    }
    if (sortMode === 'pinyin') {
      // localeCompare('zh') 按拼音排序,无需拼音库
      return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN'))
    }
    return [...list].sort((a, b) => a.order - b.order)
  }, [scopedEntries, activeCatId, sortMode])
  // 同分类内重名的词条名集合(用于"已有同名"提示)
  const dupNames = useMemo(() => {
    const count = new Map<string, number>()
    for (const e of scopedEntries) {
      if (e.categoryId !== activeCatId) continue
      const n = (e.name || '').trim()
      if (n) count.set(n, (count.get(n) ?? 0) + 1)
    }
    return new Set([...count.entries()].filter(([, n]) => n > 1).map(([k]) => k))
  }, [scopedEntries, activeCatId])
  const activeEntry = catEntries.find(e => e.id === activeEntryId) || null

  // ── 分类操作 ──
  const handleAddCategory = async () => {
    const name = (await dialog.prompt({
      title: `在「${CODEX_DOMAIN_LABELS[domain]}」下新增自定义分类`,
      placeholder: '输入分类名称',
    }))?.trim()
    if (!name) return
    const id = await addCategory({
      projectId, domain, parentId: null, name, icon: '📁',
      fieldSchema: '[]', hidden: false,
      order: domainCats.length, worldGroupId: null,
    })
    setActiveCatId(id)
    setActiveEntryId(null)
    setNarrowDetailOpen(false)
  }

  const handleDeleteCategory = async (cat: CodexCategory) => {
    if (cat.builtInKey) return
    const ok = await dialog.confirm({
      title: `删除自定义分类「${cat.name}」？`,
      message: '其下所有世界中的词条也会被删除，此操作不可撤销。',
      confirmText: '删除',
      tone: 'danger',
    })
    if (!ok) return
    await deleteCategory(cat.id!)
  }

  // ── 词条操作 ──
  const handleAddEntry = async () => {
    if (!activeCatId) return
    if (!scopeReady) {
      toast.error('世界数据尚未加载完成，请稍后再试。')
      return
    }
    const id = await addEntry({
      projectId, categoryId: activeCatId,
      name: '新词条', summary: '', description: '',
      fields: '{}', refs: '{}',
      order: catEntries.length, worldGroupId: scopedWorldGroupId,
    })
    setActiveEntryId(id)
    setNarrowDetailOpen(true)
  }

  const handleDeleteEntry = async (entry: CodexEntry) => {
    const ok = await dialog.confirm({
      title: `删除词条「${entry.name}」？`,
      message: '此操作不可恢复。',
      confirmText: '删除',
      tone: 'danger',
    })
    if (!ok) return
    await deleteEntry(entry.id!)
    if (activeEntryId === entry.id) {
      setActiveEntryId(null)
      setNarrowDetailOpen(false)
    }
  }

  const openExtractor = () => {
    if (!scopeReady) {
      toast.error('世界数据尚未加载完成，请稍后再试。')
      return
    }
    // 全貌来源为空时仍打开弹窗（允许直接粘贴文本），但明确提示用户为什么没有自动带入内容，
    // 避免手机上点开只看到一个空框而误以为「拆分失败」
    if (!extractionSourceText.trim()) {
      toast.info('上方「全貌」还没有内容，可在弹窗中直接粘贴要拆分的设定文本。')
    }
    setExtractText(extractionSourceText)
    setCandidates([])
    setSelectedCandidates(new Set())
    setExtractAttempted(false)
    setExtractError(null)
    setExtractOpen(true)
  }

  const handleExtractEntries = async () => {
    if (!activeCat || !extractText.trim()) return
    const effectiveConfig = resolveRequestConfig(aiConfig, { category: 'codex.extract' }).config
    if (!isAIConfigReady(effectiveConfig)) { toast.error(getAIConfigRequiredMessage(effectiveConfig)); return }
    setExtracting(true)
    setExtractAttempted(false)
    setExtractError(null)
    try {
      const schema = parseFieldSchema(activeCat.fieldSchema)
      const found: ReturnType<typeof parseCodexEntries> = []
      for (const chunk of splitExtractionText(extractText)) {
        const source = await assembleContext({
          projectId,
          sourceKeys: ['manualText'],
          manualSourceText: chunk,
        })
        const raw = await chat(buildCodexExtractPrompt({
          categoryName: activeCat.name,
          sourceText: source.text,
          fieldSchema: schema,
          existingNames: [...catEntries.map(e => e.name), ...found.map(e => e.name)],
          supplementTags,
        }), aiConfig, { category: 'codex.extract', projectId })
        found.push(...parseCodexEntries(raw, schema.map(f => f.key)))
      }
      const existingNames = new Set(catEntries.map(entry => entry.name.trim().toLocaleLowerCase()))
      const parsed = uniqueBy(
        found.filter(item => !existingNames.has(item.name.toLocaleLowerCase())),
        item => item.name.toLocaleLowerCase(),
      )
      setCandidates(parsed)
      setSelectedCandidates(new Set(parsed.map((_, index) => index)))
      setExtractAttempted(true)
      if (!parsed.length) toast.info('AI 未从这段内容中识别出可独立登记的词条。')
      // 候选区在弹窗滚动区底部（窄屏一屏放不下）：完成后自动滚过去，避免误以为「没有结果」
      window.setTimeout(() => {
        const el = extractResultRef.current
        if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
    } catch (error) {
      // 此前异常被静默吞掉：拆分失败时弹窗毫无反馈，用户误以为「拆分结束但没有结果」
      const message = error instanceof Error ? error.message : String(error)
      setExtractError(message)
      setExtractAttempted(true)
      toast.error(`拆分失败：${message}`)
    } finally {
      setExtracting(false)
    }
  }

  const handleAdoptCandidates = async () => {
    if (!activeCat || !scopeReady) return
    const chosen = candidates.filter((_, index) => selectedCandidates.has(index))
    const result = await adopt({
      projectId,
      worldGroupId: scopedWorldGroupId,
      target: 'codexEntries',
      mode: 'add-many',
      data: chosen.map((item, index) => ({
        categoryId: activeCat.id!,
        name: item.name,
        icon: item.icon || activeCat.icon,
        summary: item.summary,
        description: item.description,
        fields: JSON.stringify(item.fields),
        refs: '{}',
        tags: JSON.stringify(item.tags),
        importance: item.importance,
        order: catEntries.length + index,
        worldGroupId: scopedWorldGroupId,
      })),
    })
    await loadAll(projectId)
    setExtractOpen(false)
    toast.success(`已写入 ${result.written.length} 个词条${result.skipped.length ? `，跳过 ${result.skipped.length} 个重复项` : ''}。`)
  }

  // ── 采纳前手动编辑：直接修改 AI 拆分的词条候选（确认写入时以编辑后内容生效） ──
  const updateCandidate = (index: number, field: 'name' | 'summary' | 'tags', value: string) => {
    setCandidates(prev => prev.map((item, i) => {
      if (i !== index) return item
      if (field === 'tags') {
        return { ...item, tags: value.split(/[,，\s]+/).map(t => t.trim().replace(/^#/, '')).filter(Boolean) }
      }
      return { ...item, [field]: value }
    }))
  }

  const toggleCandidate = (index: number) => {
    setSelectedCandidates(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index); else next.add(index)
      return next
    })
  }

  // 候选项渲染：卡片内嵌与全屏共用（name/summary/tags 全部可编辑）
  const renderCandidateItem = (item: ReturnType<typeof parseCodexEntries>[number], index: number, full: boolean) => (
    <div key={`${item.name}-${index}`} className="flex gap-3 p-3 border border-border rounded-lg bg-bg-base">
      <label className="flex shrink-0 items-start pt-1 cursor-pointer">
        <input type="checkbox" checked={selectedCandidates.has(index)} onChange={() => toggleCandidate(index)} className="accent-accent" />
      </label>
      <div className="min-w-0 flex-1 space-y-1">
        <InlineInput value={item.name} onChange={v => updateCandidate(index, 'name', v)} placeholder="词条名"
          className={`min-w-0 w-full text-sm font-medium text-text-primary ${full ? 'text-base' : ''}`} />
        <InlineTextarea value={item.summary} onChange={v => updateCandidate(index, 'summary', v)} placeholder="点击编辑简介…"
          className="w-full text-text-muted" displayClassName={full ? '!text-sm !text-text-primary leading-relaxed' : '!text-xs !text-text-muted'}
          maxRows={full ? 12 : 3} />
        <InlineInput value={item.tags.map(t => `#${t}`).join(' ')} onChange={v => updateCandidate(index, 'tags', v)} placeholder="#标签（空格或逗号分隔，可留空）"
          className="w-full !text-[10px] !text-accent" />
      </div>
    </div>
  )

  // 窄屏详情页:仅在窄屏、用户已进入详情、且当前词条仍存在时展示
  // (删除词条 / 切换分类会把 activeEntryId 置空,此处自动退回列表页,不会卡在空白详情)
  const narrowShowDetail = isNarrow && narrowDetailOpen && !!activeEntry && !!activeCat

  // 词条列表内容:宽屏作为独立中栏,窄屏占满整宽
  const entryListInner = (
    <>
      {/* 排序下拉 */}
      <div className="px-2 pt-2 pb-1 flex items-center gap-1.5">
        <span className="text-[10px] text-text-muted shrink-0">排序</span>
        <select
          value={sortMode}
          onChange={e => setSortMode(e.target.value as typeof sortMode)}
          className="flex-1 text-[11px] bg-bg-elevated border border-border rounded px-1.5 py-1 text-text-secondary"
        >
          <option value="order">默认顺序</option>
          <option value="importance">按重要度</option>
          <option value="pinyin">按拼音首字母</option>
        </select>
      </div>
      <div className="flex-1 overflow-y-auto p-2 pt-1 space-y-0.5">
        {catEntries.length === 0 && (
          <p className="text-xs text-text-muted px-2 py-3 text-center">暂无词条</p>
        )}
        {catEntries.map(entry => (
          <div
            key={entry.id}
            onClick={() => { setActiveEntryId(entry.id!); setNarrowDetailOpen(true) }}
            className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer text-sm transition ${
              activeEntryId === entry.id ? 'bg-accent/10 text-accent' : 'hover:bg-bg-hover text-text-primary'
            }`}
          >
            <span>{entry.icon || activeCat?.icon || '•'}</span>
            <span className="truncate flex-1">{entry.name || '未命名'}</span>
            {entry.name && dupNames.has(entry.name.trim()) && (
              <span className="text-amber-400 shrink-0" title="本分类下有同名词条">⚠</span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); handleDeleteEntry(entry) }}
              className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
      <div className="m-2 space-y-1.5">
        <button
          onClick={openExtractor}
          disabled={!activeCatId || !scopeReady}
          className="w-full px-2 py-2.5 md:py-1.5 text-xs rounded-lg border border-accent/30 text-accent hover:bg-accent/10 disabled:opacity-40 inline-flex items-center justify-center gap-1"
        >
          <Sparkles className="w-3.5 h-3.5" /> AI 从内容拆分词条
        </button>
        <button
          onClick={handleAddEntry}
          disabled={!activeCatId || !scopeReady}
          className="w-full px-2 py-2.5 md:py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-40 inline-flex items-center justify-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> 新建词条
        </button>
        {/* B1:管理本分类的专属字段(增删改字段 schema) */}
        <button
          onClick={() => setShowFieldsEditor(true)}
          disabled={!activeCat}
          className="w-full px-2 py-2.5 md:py-1.5 text-xs rounded-lg border border-border text-text-secondary hover:text-accent hover:border-accent/50 disabled:opacity-40 inline-flex items-center justify-center gap-1"
          title="自定义本分类下词条的专属字段"
        >
          <Settings2 className="w-3.5 h-3.5" /> 管理字段
        </button>
      </div>
    </>
  )

  // 词条详情内容:宽屏为右栏,窄屏为全宽详情页
  const entryDetailBody = activeEntry && activeCat ? (
    <CodexEntryDetail
      key={activeEntry.id}
      entry={activeEntry}
      category={activeCat}
      allCategories={categories}
      allEntries={scopedEntries}
      nameDuplicate={!!activeEntry.name && dupNames.has(activeEntry.name.trim())}
      onChange={(patch) => updateEntry(activeEntry.id!, patch)}
    />
  ) : (
    <div className="h-full flex items-center justify-center text-text-muted text-sm">
      {activeCat ? '从左侧选择或「新建词条」添加一个具体条目' : '请选择一个分类'}
    </div>
  )

  return (
    <div className={embedded
      ? `flex flex-col ${lockedSingle ? 'h-[65dvh] md:h-80' : 'h-[65dvh] md:h-[30rem]'} border border-border rounded-xl overflow-hidden`
      : 'h-full flex flex-col'}>
      {/* 顶部：领域切换(嵌入且锁定领域时隐藏;单分类锁定时整条隐藏) */}
      {!lockedSingle && (
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
        {!fixedDomain && (
          <>
            <Boxes className="w-5 h-5 text-accent" />
            <h2 className="text-base font-semibold text-text-primary mr-2">设定词条</h2>
            <div className="flex rounded-lg bg-bg-elevated p-0.5">
              {DOMAINS.map(d => (
                <button
                  key={d}
                  onClick={() => { setDomain(d); setActiveEntryId(null) }}
                  className={`px-3 py-1 text-sm rounded-md transition ${
                    domain === d ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  {CODEX_DOMAIN_LABELS[d]}
                </button>
              ))}
            </div>
          </>
        )}
        {fixedDomain && <span className="text-sm font-medium text-text-secondary">📚 词条({CODEX_DOMAIN_LABELS[fixedDomain]})</span>}
        <button
          onClick={() => setShowHidden(v => !v)}
          className="ml-auto text-xs text-text-muted hover:text-text-primary inline-flex items-center gap-1"
          title="显示/隐藏被隐藏的分类"
        >
          {showHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {showHidden ? '隐藏项已显示' : '显示隐藏项'}
        </button>
      </div>
      )}

      {isNarrow ? (
        /* 窄屏:两段式钻取(列表页 ⇄ 详情页),避免 w-44 + w-52 挤掉详情 */
        <div className="flex-1 flex flex-col min-h-0">
          {narrowShowDetail ? (
            <>
              <div className="shrink-0 flex items-center gap-2 px-2 py-2 border-b border-border">
                <button
                  onClick={() => { setActiveEntryId(null); setNarrowDetailOpen(false) }}
                  className="shrink-0 inline-flex items-center text-sm text-accent py-1"
                >
                  <ChevronLeft className="w-4 h-4" /> 返回列表
                </button>
                <span className="truncate text-sm font-medium text-text-primary">
                  {activeEntry?.name || '未命名'}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto min-w-0">{entryDetailBody}</div>
            </>
          ) : (
            <>
              {/* 分类:一行横向可滚动的胶囊条 */}
              {!lockedSingle && (
                <div className="shrink-0 flex items-center gap-1.5 px-2 py-2 border-b border-border overflow-x-auto">
                  {visibleCats.map(cat => (
                    <div
                      key={cat.id}
                      onClick={() => { setActiveCatId(cat.id!); setActiveEntryId(null); setNarrowDetailOpen(false) }}
                      className={`shrink-0 cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition ${
                        activeCatId === cat.id ? 'bg-accent/10 text-accent' : 'bg-bg-elevated text-text-muted'
                      } ${cat.hidden ? 'opacity-50' : ''}`}
                    >
                      <span>{cat.icon || '📁'}</span>
                      <span className="whitespace-nowrap">{cat.name}</span>
                      <span className="text-[10px] text-text-muted">
                        {scopedEntries.filter(e => e.categoryId === cat.id).length || ''}
                      </span>
                      {cat.builtInKey ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setCategoryHidden(cat.id!, !cat.hidden) }}
                          className="text-text-muted hover:text-text-primary"
                          title={cat.hidden ? '取消隐藏' : '隐藏此内置分类'}
                        >
                          {cat.hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat) }}
                          className="text-text-muted hover:text-red-400"
                          title="删除自定义分类"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  {!lockedKeys && (
                    <button
                      onClick={handleAddCategory}
                      className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-border text-xs text-text-muted"
                    >
                      <FolderPlus className="w-3.5 h-3.5" /> 新增分类
                    </button>
                  )}
                </div>
              )}
              {/* 词条列表占满整宽 */}
              <div className="flex-1 flex flex-col min-h-0">{entryListInner}</div>
            </>
          )}
        </div>
      ) : (
      <div className="flex-1 flex min-h-0">
        {/* 左：分类列表(单分类锁定时隐藏) */}
        {!lockedSingle && (
        <div className="w-44 shrink-0 border-r border-border flex flex-col">
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {visibleCats.map(cat => (
              <div
                key={cat.id}
                onClick={() => { setActiveCatId(cat.id!); setActiveEntryId(null); setNarrowDetailOpen(false) }}
                className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer text-sm transition ${
                  activeCatId === cat.id ? 'bg-accent/10 text-accent' : 'hover:bg-bg-hover text-text-primary'
                } ${cat.hidden ? 'opacity-50' : ''}`}
              >
                <span>{cat.icon || '📁'}</span>
                <span className="truncate flex-1">{cat.name}</span>
                <span className="text-[10px] text-text-muted">
                  {scopedEntries.filter(e => e.categoryId === cat.id).length || ''}
                </span>
                {cat.builtInKey ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); setCategoryHidden(cat.id!, !cat.hidden) }}
                    className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-primary"
                    title={cat.hidden ? '取消隐藏' : '隐藏此内置分类'}
                  >
                    {cat.hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  </button>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat) }}
                    className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400"
                    title="删除自定义分类"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {!lockedKeys && (
            <button
              onClick={handleAddCategory}
              className="m-2 px-2 py-1.5 text-xs rounded-lg border border-dashed border-border text-text-muted hover:text-accent hover:border-accent/50 inline-flex items-center justify-center gap-1"
            >
              <FolderPlus className="w-3.5 h-3.5" /> 新增分类
            </button>
          )}
        </div>
        )}

        {/* 中：词条列表 */}
        <div className="w-52 shrink-0 border-r border-border flex flex-col">
          {entryListInner}
        </div>

        {/* 右：词条详情 */}
        <div className="flex-1 overflow-y-auto min-w-0">
          {entryDetailBody}
        </div>
      </div>
      )}

      {/* B1:自定义字段管理弹窗 — 编辑本分类的 fieldSchema(内置类也可改) */}
      {showFieldsEditor && activeCat && (
        <CodexCategoryFieldsEditor
          category={activeCat}
          onClose={() => setShowFieldsEditor(false)}
          onSave={(fieldSchema) => { updateCategory(activeCat.id!, { fieldSchema }); setShowFieldsEditor(false) }}
        />
      )}
      {extractOpen && activeCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 pt-[max(1rem,var(--safe-area-inset-top))] pb-[max(1rem,var(--safe-area-inset-bottom))] xl:pt-4 xl:pb-4" onClick={() => setExtractOpen(false)}>
          <div className="w-full max-w-2xl max-h-[85dvh] overflow-y-auto bg-bg-surface border border-border rounded-xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-text-primary">AI 拆分「{activeCat.name}」词条</h3>
                <p className="text-xs text-text-muted">AI 只生成候选，确认后才写入；同名词条会自动合并/跳过。</p>
              </div>
              <button onClick={() => setExtractOpen(false)} className="shrink-0 p-1"><X className="w-4 h-4 text-text-muted" /></button>
            </div>
            {!extractText.trim() && (
              <p className="rounded border border-warning/30 bg-warning/5 px-2 py-1.5 text-xs text-warning">
                没有可自动带入的「全貌」内容：请直接在下方粘贴要拆分的整段设定（右下角可全屏编辑），再点「开始拆分」。
              </p>
            )}
            <FullScreenTextarea value={extractText} onChange={e => setExtractText(e.target.value)} rows={8}
              fullscreenTitle="拆分来源文本"
              placeholder="粘贴或编辑要拆分的整段设定内容"
              className="w-full p-3 bg-bg-base border border-border rounded-lg text-sm text-text-primary" />
            <label className="flex items-start gap-2 text-xs text-text-secondary">
              <input type="checkbox" checked={supplementTags} onChange={e => setSupplementTags(e.target.checked)} className="mt-0.5 accent-accent" />
              <span>AI 补充词条标签 <span className="text-amber-400">⚠ 会增加少量 token 消耗</span></span>
            </label>
            <button onClick={handleExtractEntries} disabled={extracting || !extractText.trim()}
              className="px-3 py-1.5 bg-accent text-white rounded-lg text-sm disabled:opacity-40 inline-flex items-center gap-1.5">
              {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {extracting ? 'AI 拆分中…' : '开始拆分'}
            </button>
            {!extracting && extractAttempted && extractError && (
              <p className="rounded border border-error/30 bg-error/5 px-2 py-1.5 text-xs text-error">
                拆分失败：{extractError}。请检查 AI 配置或网络后重试。
              </p>
            )}
            {!extracting && extractAttempted && !extractError && candidates.length === 0 && (
              <p className="rounded border border-warning/30 bg-warning/5 px-2 py-1.5 text-xs text-warning">
                拆分完成，但没有产出候选词条：来源内容可能缺少可独立成条的设定，可补充细节后再试。
              </p>
            )}
            {candidates.length > 0 && (
              <div ref={extractResultRef} className="space-y-2 border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">拆分完成 · 共 {candidates.length} 条候选 · 点击文字可直接编辑</span>
                  <button onClick={() => setCandidatesFullscreen(true)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-text-muted hover:bg-bg-active hover:text-accent">
                    <Maximize2 className="w-3.5 h-3.5" /> 全屏查看
                  </button>
                </div>
                {candidates.map((item, index) => renderCandidateItem(item, index, false))}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setExtractOpen(false)} className="px-3 py-1.5 text-xs text-text-muted">取消</button>
                  <button onClick={handleAdoptCandidates} disabled={!selectedCandidates.size}
                    className="px-3 py-1.5 text-xs bg-accent text-white rounded disabled:opacity-40">
                    写入所选 {selectedCandidates.size} 项
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {candidatesFullscreen && (
        <FullScreenViewer open title={`AI 拆分「${activeCat?.name ?? ''}」词条候选`} subtitle="点击文字可直接编辑，勾选后写入"
          onClose={() => setCandidatesFullscreen(false)}
          footer={
            <div className="flex justify-end gap-2">
              <button onClick={() => setCandidatesFullscreen(false)} className="px-3 py-1.5 text-xs text-text-muted">收起</button>
              <button onClick={handleAdoptCandidates} disabled={!selectedCandidates.size}
                className="px-3 py-1.5 text-xs bg-accent text-white rounded disabled:opacity-40">
                写入所选 {selectedCandidates.size} 项
              </button>
            </div>
          }>
          <div className="space-y-2">
            {candidates.map((item, index) => renderCandidateItem(item, index, true))}
          </div>
        </FullScreenViewer>
      )}
    </div>
  )
}
