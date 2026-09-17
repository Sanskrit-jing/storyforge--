import { create } from 'zustand'
import { db } from '../lib/db/schema'
import type { CultivationProgress } from '../lib/types'
import { deleteCultivationProgressEvent } from '../lib/cultivation/progress'

interface CultivationProgressStore {
  events: CultivationProgress[]
  loading: boolean
  loadAll: (projectId: number) => Promise<void>
  deleteEvent: (id: number) => Promise<void>
}

export const useCultivationProgressStore = create<CultivationProgressStore>((set, get) => ({
  events: [],
  loading: false,

  loadAll: async (projectId) => {
    set({ loading: true })
    const events = await db.cultivationProgress.where('projectId').equals(projectId).toArray()
    set({ events, loading: false })
  },

  deleteEvent: async (id) => {
    const row = get().events.find(event => event.id === id)
    if (!row) return
    await deleteCultivationProgressEvent(row.projectId, id)
    set({ events: get().events.filter(event => event.id !== id) })
  },
}))
