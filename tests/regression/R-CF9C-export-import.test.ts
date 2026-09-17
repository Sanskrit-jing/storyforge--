import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { exportProjectJSON, importProjectJSON } from '../../src/lib/export/json-export'
import {
  parseCharacterDrivenPlanArcs,
  stringifyCharacterDrivenPlanArcs,
} from '../../src/lib/types'

describe('R-CF9C · 方案导出导入便携引用', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(() => db.close())

  it('重映射角色、父版本和 active 引用，不泄漏源数据库主键', async () => {
    const projectId = await db.projects.add({
      name: '便携方案',
      genre: 'fantasy',
      genres: ['fantasy'],
      status: 'drafting',
      description: '',
      targetWordCount: 10_000,
      createdAt: 1,
      updatedAt: 1,
    } as any)
    const characterId = await db.characters.add({
      projectId,
      name: '高主键角色',
      role: 'protagonist',
      roleWeight: 'main',
      moralAxis: 'good',
      orderAxis: 'neutral',
      createdAt: 1,
      updatedAt: 1,
    } as any)
    const sourceId = await db.characterDrivenPlans.add({
      projectId,
      name: '源方案',
      arcs: stringifyCharacterDrivenPlanArcs([{
        characterId,
        name: '高主键角色',
        role: '主角',
        initialState: '起点',
        targetState: '终点',
      }]),
      userHint: '',
      generatedVolumes: '[]',
      status: 'draft',
      version: 1,
      parentPlanId: null,
      createdAt: 1,
      updatedAt: 1,
    })
    const childId = await db.characterDrivenPlans.add({
      projectId,
      name: '子版本',
      arcs: stringifyCharacterDrivenPlanArcs([{
        characterId,
        name: '高主键角色',
        role: '主角',
        initialState: '起点',
        targetState: '新终点',
      }]),
      userHint: '第二版',
      generatedVolumes: '[]',
      status: 'draft',
      version: 2,
      parentPlanId: sourceId,
      createdAt: 2,
      updatedAt: 2,
    })
    await db.projects.update(projectId, { activeCharacterDrivenPlanId: childId })

    const exported = await exportProjectJSON(projectId)
    expect(exported.project).not.toHaveProperty('activeCharacterDrivenPlanId')
    expect(exported.project._activeCharacterDrivenPlanExportId).toBe(1)
    expect(exported.characterDrivenPlans?.[0]._arcCharacterIndexes).toEqual([0])
    expect(exported.characterDrivenPlans?.[1]._parentExportId).toBe(0)

    // 先制造其它项目记录，保证新主键与源主键不同，测试不能误打误撞通过。
    await db.projects.add({
      name: '占位',
      genre: 'other',
      genres: ['other'],
      status: 'drafting',
      description: '',
      targetWordCount: 1,
      createdAt: 3,
      updatedAt: 3,
    } as any)
    const importedProjectId = await importProjectJSON(exported)
    const importedCharacter = await db.characters.where('projectId').equals(importedProjectId).first()
    const importedPlans = await db.characterDrivenPlans
      .where('projectId').equals(importedProjectId)
      .sortBy('version')
    const importedProject = await db.projects.get(importedProjectId)

    expect(importedPlans).toHaveLength(2)
    expect(parseCharacterDrivenPlanArcs(importedPlans[0].arcs)[0].characterId).toBe(importedCharacter?.id)
    expect(importedPlans[1].parentPlanId).toBe(importedPlans[0].id)
    expect(importedProject?.activeCharacterDrivenPlanId).toBe(importedPlans[1].id)
  })

  it('旧格式只有原始 active ID 时清空引用，不猜测新项目记录', async () => {
    const data: any = {
      version: 3,
      exportedAt: 1,
      project: {
        name: '旧备份',
        genre: 'other',
        genres: ['other'],
        status: 'drafting',
        description: '',
        targetWordCount: 1,
        activeCharacterDrivenPlanId: 999,
        createdAt: 1,
        updatedAt: 1,
      },
      worldviews: [],
      storyCores: [],
      powerSystems: [],
      characters: [],
      outlineNodes: [],
      chapters: [],
      foreshadows: [],
      geographies: [],
      histories: [],
      creativeRules: [],
      characterRelations: [],
    }
    const importedId = await importProjectJSON(data)
    expect((await db.projects.get(importedId))?.activeCharacterDrivenPlanId).toBeNull()
  })
})
