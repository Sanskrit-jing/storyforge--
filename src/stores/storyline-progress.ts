import { create } from 'zustand'
import { db } from '../lib/db/schema'
import type { StorylineCrossing, StorylineProgress } from '../lib/types'

interface StorylineProgressStore {
  progress: StorylineProgress[]
  crossings: StorylineCrossing[]
  loading: boolean
  loadAll: (projectId: number) => Promise<void>
}

export const useStorylineProgressStore = create<StorylineProgressStore>((set) => ({
  progress: [],
  crossings: [],
  loading: false,
  loadAll: async (projectId) => {
    set({ loading: true })
    try {
      const [progress, crossings] = await Promise.all([
        db.storylineProgress.where('projectId').equals(projectId).toArray(),
        db.storylineCrossings.where('projectId').equals(projectId).toArray(),
      ])
      set({ progress, crossings, loading: false })
    } catch (error) {
      console.error('[StorylineProgress] loadAll 失败:', error)
      set({ loading: false })
    }
  },
}))
