import { create } from 'zustand'
import { db } from '../lib/db/schema'
import type { Character } from '../lib/types'
import { applyCharacterReferenceRemap } from '../lib/registry/character-references'
import { normalizeCharacterAxes } from '../lib/character/character-axes'
import { transactionTablesFor } from '../lib/registry/lifecycle'
import { refreshSettingAssertionSourceStatus } from '../lib/fact-ledger/setting-assertions'
import { buildGlobalReplacePreview } from '../lib/editor/global-find-replace'

// 注:势力(Faction)已于 C2 并入「势力」词条,旧 factions 表数据由
// migrations/faction-to-codex 一次性迁移;本 store 不再管理势力。

/** 角色直接改名后检测到的旧名残留事件（供 UI 弹窗引导全局替换） */
export interface CharacterRenameEvent {
  projectId: number
  characterId: number
  oldName: string
  newName: string
  residualMatches: number
  residualRecords: number
  at: number
}

interface CharacterStore {
  characters: Character[]
  loading: boolean
  renameEvent: CharacterRenameEvent | null

  loadAll: (projectId: number) => Promise<void>

  addCharacter: (
    char: Omit<Character, 'id' | 'createdAt' | 'updatedAt' | 'role'>
      & Partial<Pick<Character, 'role'>>
  ) => Promise<number>
  updateCharacter: (id: number, data: Partial<Character>) => Promise<void>
  deleteCharacter: (id: number) => Promise<void>
  clearRenameEvent: () => void
}

const now = () => Date.now()

/** 改名后异步扫描其余模块的旧名残留；不阻塞改名本身，失败静默降级 */
async function detectRenameResidual(
  projectId: number,
  characterId: number,
  oldName: string,
  newName: string,
): Promise<void> {
  try {
    const preview = await buildGlobalReplacePreview(projectId, { query: oldName, replacement: newName })
    if (!preview.totalMatches) return
    useCharacterStore.setState({
      renameEvent: {
        projectId,
        characterId,
        oldName,
        newName,
        residualMatches: preview.totalMatches,
        residualRecords: preview.totalRecords,
        at: Date.now(),
      },
    })
  } catch (error) {
    console.error('[Character] 改名残留检测失败:', error)
  }
}

export const useCharacterStore = create<CharacterStore>((set, get) => ({
  characters: [],
  loading: false,
  renameEvent: null,

  loadAll: async (projectId: number) => {
    set({ loading: true })
    const characters = await db.characters.where('projectId').equals(projectId).toArray()
    set({ characters, loading: false })
  },

  addCharacter: async (char) => {
    const normalized = normalizeCharacterAxes(char as unknown as Record<string, unknown>)
    const newChar: Character = { ...char, ...normalized, createdAt: now(), updatedAt: now() } as Character
    const id = await db.characters.add(newChar) as number
    set({ characters: [...get().characters, { ...newChar, id }] })
    return id
  },

  updateCharacter: async (id, data) => {
    const current = get().characters.find(c => c.id === id) ?? await db.characters.get(id)
    if (!current) return
    const patch = normalizeCharacterAxes(
      data as Record<string, unknown>,
      current as unknown as Record<string, unknown>,
    ) as Partial<Character>
    const updatedAt = now()
    await db.characters.update(id, { ...patch, updatedAt })
    await refreshSettingAssertionSourceStatus({
      projectId: current.projectId,
      table: 'characters',
      recordId: id,
      changedFields: Object.keys(patch),
    })
    set({
      characters: get().characters.map(c =>
        c.id === id ? { ...c, ...patch, updatedAt } : c
      ),
    })
    // 直接改名（非「智能实体改名」）时扫描其余模块的旧名残留，弹窗引导全局替换
    const newName = typeof patch.name === 'string' ? patch.name.trim() : ''
    if (newName && newName !== current.name) {
      void detectRenameResidual(current.projectId, id, current.name, newName)
    }
  },

  deleteCharacter: async (id) => {
    const preChar = await db.characters.get(id)
    if (!preChar) return
    const projectId = preChar.projectId
    await db.transaction('rw', transactionTablesFor('importProject'), async () => {
      await applyCharacterReferenceRemap({
        projectId,
        fromCharacterId: id,
        fromName: preChar.name,
      })
      await db.characters.delete(id)
    })
    set({ characters: get().characters.filter(c => c.id !== id) })
  },

  clearRenameEvent: () => set({ renameEvent: null }),
}))
