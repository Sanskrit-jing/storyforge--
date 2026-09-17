import { create } from 'zustand'
import type { Chapter, Character, KnowledgeLedgerEntry } from '../lib/types'
import { db } from '../lib/db/schema'
import {
  adoptKnowledgeCandidates,
  confirmKnowledgeCandidate,
  listKnowledgeEvents,
  rejectKnowledgeCandidate,
  type KnowledgeCandidateInput,
} from '../lib/knowledge-ledger/knowledge-ledger'

interface KnowledgeLedgerStore {
  events: KnowledgeLedgerEntry[]
  characters: Character[]
  chapters: Chapter[]
  loading: boolean
  load: (projectId: number) => Promise<void>
  adopt: (projectId: number, candidates: KnowledgeCandidateInput[]) => Promise<{ written: number; skipped: number }>
  confirmEvent: (projectId: number, eventId: number) => Promise<boolean>
  rejectEvent: (projectId: number, eventId: number) => Promise<boolean>
}

export const useKnowledgeLedgerStore = create<KnowledgeLedgerStore>((set, get) => ({
  events: [],
  characters: [],
  chapters: [],
  loading: false,
  load: async projectId => {
    set({ loading: true })
    try {
      const [events, characters, chapters] = await Promise.all([
        listKnowledgeEvents(projectId),
        db.characters.where('projectId').equals(projectId).toArray(),
        db.chapters.where('projectId').equals(projectId).toArray(),
      ])
      set({
        events,
        characters: characters.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')),
        chapters: chapters.sort((a, b) => a.order - b.order || (a.id ?? 0) - (b.id ?? 0)),
      })
    } finally {
      set({ loading: false })
    }
  },
  adopt: async (projectId, candidates) => {
    const result = await adoptKnowledgeCandidates({ projectId, candidates })
    await get().load(projectId)
    return result
  },
  confirmEvent: async (projectId, eventId) => {
    const confirmed = await confirmKnowledgeCandidate(eventId)
    await get().load(projectId)
    return confirmed
  },
  rejectEvent: async (projectId, eventId) => {
    const rejected = await rejectKnowledgeCandidate(eventId)
    await get().load(projectId)
    return rejected
  },
}))
