import { useEffect, useRef, useState } from 'react'
import { useAIStream } from './useAIStream'
import { createAISessionKey } from '../stores/ai-generation-session'
import { useInspirationWorkspaceStore } from '../stores/inspiration-workspace'
import {
  buildInspirationReverseMultiWorldPrompt,
  buildInspirationReversePrompt,
  parseReverseMultiWorldOutput,
  parseReverseOutput,
  type ReverseMultiWorldResult,
  type ReverseResult,
} from '../lib/ai/inspiration-reverse'
import {
  diffInspirationResults,
  latestInspirationVersion,
  MAX_INSPIRATION_FRAGMENT_CHARS,
  type InspirationResultDiff,
} from '../lib/inspiration/workspace'
import { assembleContext } from '../lib/registry/assemble-context'
import type { Project } from '../lib/types'
import type {
  InspirationResultMode,
  InspirationSourceKind,
  InspirationVersion,
} from '../lib/types/inspiration-workspace'

/**
 * 生成中／生成完成待解析的标记，写在共享 AI 会话的 operation 上。
 *
 * 面板被切走（一级标签切换、平板分屏来回操作）时组件会卸载，本地 state 全部丢失；
 * 而流式输出与控制器活在共享会话里、生成会继续。没有这个标记的话，回来后只会恢复
 * AI 原文，永远不再触发解析——表现为「有 AI 文字，但反推结果整块消失、也没有报错」。
 */
const PENDING_RESULT_OPERATION = 'inspiration.reverse.pending'

export function useIncrementalInspiration(
  project: Project,
  onGenerationStarted: () => void,
) {
  const isMultiWorld = !!project.enableMultiWorld
  const mode: InspirationResultMode = isMultiWorld ? 'multiworld' : 'single'
  const ai = useAIStream(createAISessionKey(project.id!, 'inspiration.reverse'))
  const workspace = useInspirationWorkspaceStore()
  const draftKey = `sf-inspiration-draft-${project.id}`
  const draftLoaded = useRef(false)

  const [inspiration, setInspiration] = useState('')
  const [userHint, setUserHint] = useState('')
  const [result, setResult] = useState<ReverseResult | null>(null)
  const [mwResult, setMwResult] = useState<ReverseMultiWorldResult | null>(null)
  const [mwAdopted, setMwAdopted] = useState(false)
  const [selectedChars, setSelectedChars] = useState<Set<number>>(new Set())
  const [fragmentLabel, setFragmentLabel] = useState('')
  const [sourceKind, setSourceKind] = useState<InspirationSourceKind>('author')
  const [selectedFragmentIds, setSelectedFragmentIds] = useState<Set<string>>(new Set())
  const [pendingDiff, setPendingDiff] = useState<InspirationResultDiff[] | null>(null)
  const [pendingFragmentIds, setPendingFragmentIds] = useState<string[]>([])
  const [pendingParent, setPendingParent] = useState<InspirationVersion | null>(null)
  const [confirmingFusion, setConfirmingFusion] = useState(false)
  const [fusionError, setFusionError] = useState('')

  const applyResult = (parsed: ReverseResult | ReverseMultiWorldResult, targetMode = mode) => {
    if (targetMode === 'multiworld') {
      setMwResult(parsed as ReverseMultiWorldResult)
      setResult(null)
      return
    }
    const single = parsed as ReverseResult
    setResult(single)
    setMwResult(null)
    setSelectedChars(new Set(single.characters.map((_, index) => index)))
  }

  useEffect(() => {
    let active = true
    setResult(null)
    setMwResult(null)
    setMwAdopted(false)
    setPendingDiff(null)
    setPendingFragmentIds([])
    setPendingParent(null)
    setFusionError('')
    void workspace.load(project.id!).then(() => {
      if (!active) return
      // 有生成完成但尚未解析的输出时，结果由解析流程给出（含与上一版的差异），
      // 不能被这里回填的历史版本覆盖。
      if (ai.operation === PENDING_RESULT_OPERATION && ai.output) return
      const state = useInspirationWorkspaceStore.getState()
      setSelectedFragmentIds(new Set(state.fragments.map(fragment => fragment.id)))
      const latest = latestInspirationVersion(state.versions, mode)
      if (!latest) return
      try { applyResult(JSON.parse(latest.resultJson), mode) } catch { /* ignore invalid legacy data */ }
    })
    return () => { active = false }
  // Store methods are stable Zustand actions; mode changes reload the matching latest version.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, mode])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey)
      if (saved) {
        const draft = JSON.parse(saved)
        setInspiration(draft.inspiration || '')
        setUserHint(draft.userHint || '')
        if (draft.result) applyResult(draft.result, 'single')
        if (draft.mwResult) {
          applyResult(draft.mwResult, 'multiworld')
          setMwAdopted(!!draft.mwAdopted)
        }
      }
    } catch { /* ignore */ }
    draftLoaded.current = true
  // applyResult is a state-only helper and intentionally not a hook dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey])

  useEffect(() => {
    if (!draftLoaded.current) return
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          inspiration,
          userHint,
          result,
          mwResult,
          mwAdopted,
        }))
      } catch { /* ignore */ }
    }, 500)
    return () => clearTimeout(timer)
  }, [draftKey, inspiration, userHint, result, mwResult, mwAdopted])

  const acceptGeneratedResult = (output: string) => {
    // 标记在成功与失败两条出口都消费掉：错误由 fusionError 呈现，AI 原文留在输出框可复查。
    ai.setOperation(null)
    const latest = latestInspirationVersion(
      useInspirationWorkspaceStore.getState().versions,
      mode,
    )
    let previous: unknown = {}
    if (latest) {
      try { previous = JSON.parse(latest.resultJson) } catch { previous = {} }
    }
    const parsed = isMultiWorld
      ? parseReverseMultiWorldOutput(output)
      : parseReverseOutput(output)
    if (!parsed) {
      setFusionError('Agnes 返回内容无法解析，请检查原始输出后重试')
      return
    }
    setFusionError('')
    applyResult(parsed)
    setPendingDiff(diffInspirationResults(previous, parsed))
    setPendingParent(latest)
  }

  // 完成条件读的是共享会话上的标记，而不是组件本地 state——面板在生成中途被切走时组件会
  // 卸载，本地 state 全部丢失，但流式输出与标记都留在共享会话里，重新挂载后据此补上解析。
  // 依赖必须包含 ai.output / ai.isStreaming：流在共享会话里跑完时只有它们变化能再次唤醒。
  useEffect(() => {
    if (ai.operation !== PENDING_RESULT_OPERATION || ai.isStreaming || !ai.output) return
    acceptGeneratedResult(ai.output)
  // Completion intentionally reads the latest store snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.operation, ai.isStreaming, ai.output, isMultiWorld])

  const addCurrentFragment = async () => {
    if (inspiration.trim().length > MAX_INSPIRATION_FRAGMENT_CHARS) {
      setFusionError(`单条灵感最多 ${MAX_INSPIRATION_FRAGMENT_CHARS} 字，请拆成多个碎片`)
      return null
    }
    try {
      const fragment = await workspace.addFragment(project.id!, {
        text: inspiration,
        label: fragmentLabel,
        sourceKind,
      })
      if (!fragment) return null
      setFusionError('')
      setSelectedFragmentIds(current => new Set(current).add(fragment.id))
      return fragment
    } catch (error) {
      setFusionError(error instanceof Error ? error.message : '灵感碎片保存失败')
      return null
    }
  }

  const generate = async () => {
    if (inspiration.trim().length > MAX_INSPIRATION_FRAGMENT_CHARS) {
      setFusionError(`单条灵感最多 ${MAX_INSPIRATION_FRAGMENT_CHARS} 字，请拆成多个碎片`)
      return
    }
    const selectedIds = new Set(selectedFragmentIds)
    if (inspiration.trim()) {
      const fragment = await addCurrentFragment()
      if (fragment) selectedIds.add(fragment.id)
    }
    const state = useInspirationWorkspaceStore.getState()
    if (selectedIds.size === 0 || state.fragments.length === 0) return
    const previousVersion = latestInspirationVersion(state.versions, mode)
    const assembled = await assembleContext({
      projectId: project.id!,
      sourceKeys: ['inspirationWorkspace'],
      inspirationFragmentIds: [...selectedIds],
      inspirationMode: mode,
    })
    const fusionInput = assembled.text
    if (!fusionInput) return

    setResult(null)
    setMwResult(null)
    setMwAdopted(false)
    setPendingDiff(null)
    setPendingFragmentIds([...selectedIds])
    setPendingParent(previousVersion)
    setFusionError('')
    onGenerationStarted()

    const genres = project.genres?.join('/') || project.genre || ''
    const messages = isMultiWorld
      ? buildInspirationReverseMultiWorldPrompt(project.name, genres, fusionInput, userHint || undefined)
      : buildInspirationReversePrompt(project.name, genres, fusionInput, userHint || undefined)
    // 先落标记再开流：面板在生成中途被切走、组件卸载后，重新挂载靠这个标记补上解析。
    ai.setOperation(PENDING_RESULT_OPERATION)
    await ai.start(messages, undefined, {
      category: 'inspiration.reverse',
      projectId: project.id!,
    })
  }

  const confirmFusion = async () => {
    const pendingResult = mode === 'multiworld' ? mwResult : result
    if (!pendingResult || pendingDiff === null) return
    setConfirmingFusion(true)
    try {
      await workspace.saveVersion(project.id!, {
        mode,
        parentVersionId: pendingParent?.id ?? null,
        fragmentIds: pendingFragmentIds,
        result: pendingResult,
      })
      setPendingDiff(null)
      setPendingParent(null)
      setPendingFragmentIds([])
      setFusionError('')
    } catch (error) {
      setFusionError(error instanceof Error ? error.message : '融合版本保存失败')
    } finally {
      setConfirmingFusion(false)
    }
  }

  const discardFusion = () => {
    const latest = latestInspirationVersion(
      useInspirationWorkspaceStore.getState().versions,
      mode,
    )
    if (latest) applyResult(JSON.parse(latest.resultJson))
    else {
      setResult(null)
      setMwResult(null)
    }
    setPendingDiff(null)
    setPendingParent(null)
    setPendingFragmentIds([])
  }

  const removeFragment = async (fragmentId: string) => {
    try {
      await workspace.removeFragment(project.id!, fragmentId)
      setFusionError('')
      setSelectedFragmentIds(current => {
        const next = new Set(current)
        next.delete(fragmentId)
        return next
      })
    } catch (error) {
      setFusionError(error instanceof Error ? error.message : '灵感碎片删除失败')
    }
  }

  return {
    ai,
    isMultiWorld,
    mode,
    workspace,
    inspiration,
    setInspiration,
    userHint,
    setUserHint,
    result,
    mwResult,
    mwAdopted,
    setMwAdopted,
    selectedChars,
    setSelectedChars,
    fragmentLabel,
    setFragmentLabel,
    sourceKind,
    setSourceKind,
    selectedFragmentIds,
    setSelectedFragmentIds,
    pendingDiff,
    confirmingFusion,
    fusionError,
    addCurrentFragment,
    generate,
    confirmFusion,
    discardFusion,
    removeFragment,
  }
}
