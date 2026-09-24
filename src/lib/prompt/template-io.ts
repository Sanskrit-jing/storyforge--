/**
 * 提示词模板面板级导出/导入（表 exportable=false 的全局数据，不随项目备份走）。
 *
 * v1 起导出为带 format 标识的包裹结构；导入同时兼容旧版裸数组与单对象，
 * 旧文件无需重新导出即可继续使用。字段级校验仍在 PromptManagerPanel.validateTemplate。
 */

import type { PromptTemplate } from '../types/prompt'

export const TEMPLATES_EXPORT_FORMAT = 'storyforge-prompt-templates'

export interface PromptTemplatesExportFile {
  format: 'storyforge-prompt-templates'
  version: 1
  exportedAt: number
  templates: PromptTemplate[]
}

export function buildTemplatesExportFile(templates: PromptTemplate[]): PromptTemplatesExportFile {
  return {
    format: TEMPLATES_EXPORT_FORMAT,
    version: 1,
    exportedAt: Date.now(),
    templates,
  }
}

/**
 * 解包导入文件，返回待逐条校验的原始条目数组：
 * - 新格式取 templates 节（版本不符直接报错）；
 * - 旧格式（裸数组 / 单对象）原样兼容。
 */
export function parseTemplatesImportFile(value: unknown): unknown[] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const candidate = value as Partial<PromptTemplatesExportFile>
    if (candidate.format === TEMPLATES_EXPORT_FORMAT) {
      if (candidate.version !== 1 || !Array.isArray(candidate.templates)) {
        throw new Error('模板备份文件版本不受支持或内容为空。')
      }
      return candidate.templates
    }
  }
  return Array.isArray(value) ? value : [value]
}
