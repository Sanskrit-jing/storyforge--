import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { AdaptationProject, WorkspaceScope } from '../../src/lib/types'

const mocks = vi.hoisted(() => ({ read: vi.fn(async (): Promise<string | null> => null), queue: vi.fn() }))
vi.mock('../../src/lib/adaptation/analysis', () => ({ listAdaptationAnalysisV1: async () => ({ facts: [], edges: [], decisions: [] }), adoptAdaptationSourceFactsV1: vi.fn(), adoptAdaptationCausalEdgesV1: vi.fn(), adoptAdaptationDecisionsV1: vi.fn() }))
vi.mock('../../src/lib/screenplay/production', () => ({ listScreenplayProductionV1: async () => ({ beats: [], sceneCards: [] }), adoptScreenplayBeatsV1: vi.fn(), adoptScreenplaySceneCardsV1: vi.fn() }))
vi.mock('../../src/lib/screenplay/author-drafts', () => ({ readScreenplayAuthorDraft: mocks.read, saveScreenplayAuthorDraft: vi.fn() }))
vi.mock('../../src/lib/agent/candidate-draft-coordinator', () => ({ queueCandidateDraftV1: mocks.queue, flushCandidateDraftsV1: vi.fn() }))
vi.mock('../../src/components/shared/Dialog', () => ({ useDialog: () => ({ confirm: vi.fn() }) }))
vi.mock('../../src/components/screenplay/ScreenplayFields', () => ({ default: ({ value, onChange }: { value: { coreTheme: string }; onChange: (next: unknown) => void }) => createElement('button', { onClick: () => onChange({ ...value, coreTheme: '作者刚输入的新内容' }) }, value.coreTheme) }))
import ScreenplayPlanning, { emptyScreenplayBrief } from '../../src/components/screenplay/ScreenplayPlanning'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const host = document.createElement('div')
let mounted: ReturnType<typeof createRoot> | undefined
const scope: WorkspaceScope = { projectId: 1, worldId: 2, workId: 3 }
const adaptation = { id: 4, revision: 1, status: 'draft', brief: { ...emptyScreenplayBrief(), coreTheme: '原始内容' } } as AdaptationProject
const draw = (root = adaptation) => createElement(ScreenplayPlanning, { scope, root, units: [], stage: 'brief', onChanged: async () => undefined })
afterEach(async () => { await act(async () => mounted?.unmount()); host.remove(); vi.clearAllMocks() })

it('a same-revision background refresh keeps the form editable and never replaces newer author text with a late draft', async () => {
  document.body.append(host); mounted = createRoot(host)
  await act(async () => mounted!.render(draw()))
  expect(host.querySelector('button')?.textContent).toBe('原始内容')
  let resolve!: (value: string) => void
  mocks.read.mockImplementationOnce(() => new Promise<string>(done => { resolve = done }))
  await act(async () => mounted!.render(draw({ ...adaptation })))
  expect(host.textContent).not.toContain('读取内容…')
  await act(async () => host.querySelector('button')!.click())
  await act(async () => resolve(JSON.stringify({ ...emptyScreenplayBrief(), coreTheme: '迟到的旧草稿' })))
  expect(host.querySelector('button')?.textContent).toBe('作者刚输入的新内容')
  expect(host.textContent).not.toContain('读取内容…')
  expect(mocks.queue).toHaveBeenCalledWith(expect.objectContaining({ draft: expect.stringContaining('作者刚输入的新内容') }))
})
