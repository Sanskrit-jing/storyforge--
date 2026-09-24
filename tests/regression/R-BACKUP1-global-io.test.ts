/**
 * R-BACKUP1 全局数据面板级导出/导入回归：
 *
 * 1. 常用语（lib/phrases/common-phrases.ts）：format=storyforge-common-phrases v1
 *    往返 + 追加式导入的清洗（空条目跳过）与按标题去重（大小写不敏感）。
 * 2. 全局设置（lib/settings/settings-backup.ts）：format=storyforge-settings v1
 *    合并包；导出默认剥离三类明文密钥；导入时空密钥保留本机现有值、
 *    非法节跳过、格式不符报错。
 * 3. 工作流/模板导出格式升级（lib/workflow/import-export.ts、lib/prompt/template-io.ts）：
 *    新格式带 format 包裹，导入兼容旧版裸数组/单对象，版本不符报错。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db/schema'
import {
  exportCommonPhrases,
  importCommonPhrases,
} from '../../src/lib/phrases/common-phrases'
import {
  exportSettings,
  importSettings,
} from '../../src/lib/settings/settings-backup'
import {
  parseImportedWorkflows,
  serializeWorkflows,
  WORKFLOWS_EXPORT_FORMAT,
} from '../../src/lib/workflow/import-export'
import {
  buildTemplatesExportFile,
  parseTemplatesImportFile,
  TEMPLATES_EXPORT_FORMAT,
} from '../../src/lib/prompt/template-io'
import type { PromptWorkflow } from '../../src/lib/types/workflow'
import type { PromptTemplate } from '../../src/lib/types/prompt'

beforeEach(async () => {
  await db.commonPhrases.clear()
  localStorage.clear()
})

describe('常用语导出/导入', () => {
  it('导出为带 format 标识的包裹结构', async () => {
    await db.commonPhrases.bulkAdd([
      { title: '情感不足', content: '这段内容缺乏情感', createdAt: 1, updatedAt: 1 },
      { title: '节奏拖沓', content: '这段节奏太慢', createdAt: 2, updatedAt: 2 },
    ])
    const file = await exportCommonPhrases()
    expect(file.format).toBe('storyforge-common-phrases')
    expect(file.version).toBe(1)
    expect(file.entries).toHaveLength(2)
    expect(file.entries.map(entry => entry.title).sort()).toEqual(['情感不足', '节奏拖沓'])
  })

  it('导入：有效条目入库，空标题/空内容跳过，与现有条目按标题去重（大小写不敏感）', async () => {
    await db.commonPhrases.bulkAdd([
      { title: '情感不足', content: '已有', createdAt: 1, updatedAt: 1 },
      { title: 'Rule', content: '已有规则', createdAt: 1, updatedAt: 1 },
    ])
    const result = await importCommonPhrases({
      format: 'storyforge-common-phrases',
      version: 1,
      exportedAt: Date.now(),
      entries: [
        { title: '新条目', content: 'c1' },
        { title: '情感不足', content: '重复' },
        { title: ' 情感不足 ', content: 'trim 后仍重复' },
        { title: 'rule', content: '与 Rule 仅大小写不同' },
        { title: '', content: '无标题' },
        { title: '只有标题', content: '   ' },
      ],
    })
    expect(result).toEqual({ imported: 1, skipped: 5 })
    const all = await db.commonPhrases.toArray()
    expect(all).toHaveLength(3)
    expect(all.find(row => row.title === '新条目')?.content).toBe('c1')
  })

  it('导入：格式不符/版本不符/条目不是数组时返回全零，不抛错不写库', async () => {
    for (const bad of [
      null,
      'text',
      {},
      { format: 'storyforge-common-phrases', version: 2, entries: [{ title: 'a', content: 'b' }] },
      { format: 'storyforge-common-phrases', version: 1, entries: 'not-array' },
    ]) {
      const result = await importCommonPhrases(bad)
      expect(result).toEqual({ imported: 0, skipped: 0 })
    }
    expect(await db.commonPhrases.count()).toBe(0)
  })
})

describe('设置导出/导入', () => {
  const SECRET_AI = { provider: 'deepseek', apiKey: 'sk-ai', model: 'm', baseUrl: 'u', temperature: 0.5, maxTokens: 100 }
  const SECRET_PRESET = { id: 'p1', name: 'P', config: { provider: 'openai', apiKey: 'sk-preset', model: 'gpt', baseUrl: 'u', temperature: 0.5, maxTokens: 0 } }
  const SECRET_EMB = { enabled: true, provider: 'openai', apiKey: 'sk-emb', baseUrl: 'e', model: 'bge' }
  const SECRET_TTS = { rate: 1.2, voiceURI: 'v', ttsBaseUrl: 't', ttsApiKey: 'sk-tts' }

  beforeEach(() => {
    localStorage.setItem('storyforge-ai-config', JSON.stringify(SECRET_AI))
    localStorage.setItem('storyforge-ai-presets', JSON.stringify([SECRET_PRESET]))
    localStorage.setItem('storyforge-embedding-config', JSON.stringify(SECRET_EMB))
    localStorage.setItem('storyforge-speech-reader', JSON.stringify(SECRET_TTS))
    localStorage.setItem('storyforge-theme', 'forge')
    localStorage.setItem('sf-genre-pack', 'wuxia')
    localStorage.setItem('sf.writingPrefs.imagery', '0')
  })

  it('导出默认剥离全部明文密钥；显式 includeSecrets 时保留', () => {
    const safe = exportSettings(false)
    expect(safe.format).toBe('storyforge-settings')
    expect(safe.includeSecrets).toBe(false)
    expect(safe.sections.aiConfig?.apiKey).toBeUndefined()
    expect((safe.sections.aiPresets as Array<{ config: { apiKey?: string } }>)[0].config.apiKey).toBeUndefined()
    expect(safe.sections.embedding?.apiKey).toBeUndefined()
    expect(safe.sections.speechReader?.ttsApiKey).toBeUndefined()
    // 非密钥字段不受影响
    expect(safe.sections.aiConfig?.provider).toBe('deepseek')
    expect(safe.sections.speechReader?.rate).toBe(1.2)
    expect(safe.sections.theme).toBe('forge')

    const full = exportSettings(true)
    expect(full.includeSecrets).toBe(true)
    expect(full.sections.aiConfig?.apiKey).toBe('sk-ai')
    expect(full.sections.speechReader?.ttsApiKey).toBe('sk-tts')
  })

  it('导出节按是否存在输出；导入按节应用并计数', () => {
    localStorage.removeItem('storyforge-embedding-config')
    const file = exportSettings(false)
    expect(file.sections.embedding).toBeUndefined()

    const result = importSettings(file)
    // aiConfig + aiPresets + speechReader + theme + genrePack + writingPrefs = 6 节
    expect(result.applied).toBe(6)
    expect(result.skipped).toBe(0)
    expect(localStorage.getItem('storyforge-theme')).toBe('forge')
    expect(localStorage.getItem('sf-genre-pack')).toBe('wuxia')
    expect(localStorage.getItem('sf.writingPrefs.imagery')).toBe('0')
  })

  it('导入：包内密钥为空时保留本机现有密钥（无密钥包不抹掉已配好的 key）', () => {
    const file = exportSettings(false)
    // 本机密钥仍在：导入无密钥包不应将其抹成空
    importSettings(file)
    expect(JSON.parse(localStorage.getItem('storyforge-ai-config')!).apiKey).toBe('sk-ai')
    expect(JSON.parse(localStorage.getItem('storyforge-speech-reader')!).ttsApiKey).toBe('sk-tts')
    // 包内其他字段照常写入
    expect(JSON.parse(localStorage.getItem('storyforge-ai-config')!).provider).toBe('deepseek')
  })

  it('导入：非法节跳过并计数，合法节照常应用', () => {
    const result = importSettings({
      format: 'storyforge-settings',
      version: 1,
      exportedAt: Date.now(),
      includeSecrets: false,
      sections: {
        theme: 'not-a-theme',
        genrePack: 'xianxia',
        aiConfig: 'not-an-object',
        taskRoutes: { outline: 'whatever' },
      },
    })
    expect(result.applied).toBe(2)
    expect(result.skipped).toBe(2)
    expect(localStorage.getItem('sf-genre-pack')).toBe('xianxia')
    expect(localStorage.getItem('storyforge-theme')).toBe('forge') // 未被非法主题覆盖
    expect(typeof JSON.parse(localStorage.getItem('storyforge-ai-task-routes')!)).toBe('object')
  })

  it('导入：格式/版本不符或缺 sections 时抛错', () => {
    expect(() => importSettings({ format: 'other' })).toThrow()
    expect(() => importSettings({
      format: 'storyforge-settings', version: 99, exportedAt: 0, includeSecrets: false, sections: {},
    })).toThrow()
    expect(() => importSettings({
      format: 'storyforge-settings', version: 1, exportedAt: 0, includeSecrets: false,
    })).toThrow()
  })
})

describe('工作流导出/导入格式升级', () => {
  const workflow: PromptWorkflow = {
    scope: 'user',
    name: 'W1',
    description: '',
    steps: [],
    isDefault: false,
    createdAt: 1,
    updatedAt: 1,
  }

  it('序列化为带 format 标识的包裹，解析回原工作流', () => {
    const parsed = JSON.parse(serializeWorkflows([workflow]))
    expect(parsed.format).toBe(WORKFLOWS_EXPORT_FORMAT)
    expect(parsed.version).toBe(1)
    expect(parsed.workflows).toHaveLength(1)
    const roundtrip = parseImportedWorkflows(parsed, 123)
    expect(roundtrip).toHaveLength(1)
    expect(roundtrip[0].name).toBe('W1')
    expect(roundtrip[0].scope).toBe('user')
  })

  it('导入兼容旧版裸数组与单对象', () => {
    expect(parseImportedWorkflows([workflow])[0].name).toBe('W1')
    expect(parseImportedWorkflows(workflow)[0].name).toBe('W1')
  })

  it('包裹版本不符时抛错', () => {
    expect(() => parseImportedWorkflows({
      format: WORKFLOWS_EXPORT_FORMAT, version: 2, exportedAt: 0, workflows: [workflow],
    })).toThrow()
  })
})

describe('模板导出/导入格式升级', () => {
  const template = {
    scope: 'user',
    moduleKey: 'worldview.dimension',
    promptType: 'generate',
    name: 'T1',
    description: '',
    systemPrompt: 's',
    userPromptTemplate: 'u',
    variables: [],
    isActive: false,
  } as PromptTemplate

  it('导出为带 format 标识的包裹，解包取 templates 节', () => {
    const file = buildTemplatesExportFile([template])
    expect(file.format).toBe(TEMPLATES_EXPORT_FORMAT)
    expect(file.version).toBe(1)
    const entries = parseTemplatesImportFile(JSON.parse(JSON.stringify(file)))
    expect(entries).toHaveLength(1)
    expect((entries[0] as PromptTemplate).name).toBe('T1')
  })

  it('导入兼容旧版裸数组与单对象', () => {
    expect(parseTemplatesImportFile([template])).toHaveLength(1)
    expect(parseTemplatesImportFile(template)).toHaveLength(1)
  })

  it('包裹版本不符时抛错', () => {
    expect(() => parseTemplatesImportFile({
      format: TEMPLATES_EXPORT_FORMAT, version: 2, exportedAt: 0, templates: [template],
    })).toThrow()
  })
})
