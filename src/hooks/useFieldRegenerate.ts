/**
 * 单字段 AI 重生成 hook —— 配合 EditableFieldRow 的 onRegenerate 使用
 *
 * 封装：配置就绪检查、chat 调用（单飞：新请求中止旧请求）、
 * 按字段 key 管理 loading 与错误状态。apply 回调由调用方决定
 * 生成结果写入哪个字段（其余字段不动）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AIConfig } from '../lib/types'
import { resolveRequestConfig } from '../lib/ai/client'
import { getAIConfigRequiredMessage, isAIConfigReady } from '../lib/ai/config-readiness'
import { regenerateField } from '../lib/ai/field-regenerate'

export interface FieldRegenerateParams {
  /** 字段唯一 key（同面板内区分 loading/错误归属） */
  key: string
  /** 字段中文标签，如「世界来源」 */
  fieldLabel: string
  /** 编辑后的字段内容（默认作为核心要求） */
  currentValue: string
  /** 可选补充要求（弹层输入） */
  userHint?: string
  /** 可选背景上下文（项目名/题材/其他字段摘要） */
  contextBlock?: string
  /** 生成成功后写入字段（只会收到去空白后的正文） */
  apply: (text: string) => void
}

export interface UseFieldRegenerateOptions {
  aiConfig: AIConfig
  projectId?: number | null
  /** 消耗统计分类，如 'inspiration.reverse' */
  category?: string
}

export function useFieldRegenerate({ aiConfig, projectId, category }: UseFieldRegenerateOptions) {
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const regenerate = useCallback(
    async (params: FieldRegenerateParams) => {
      const effectiveConfig = resolveRequestConfig(aiConfig, { category }).config
      if (!isAIConfigReady(effectiveConfig)) {
        setErrors(prev => ({ ...prev, [params.key]: getAIConfigRequiredMessage(effectiveConfig) }))
        return
      }
      // 单飞：中止上一个进行中的字段重生成
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setRegeneratingKey(params.key)
      setErrors(prev => {
        if (!(params.key in prev)) return prev
        const next = { ...prev }
        delete next[params.key]
        return next
      })
      try {
        const text = (
          await regenerateField({
            fieldLabel: params.fieldLabel,
            currentValue: params.currentValue,
            userHint: params.userHint,
            contextBlock: params.contextBlock,
            aiConfig,
            projectId,
            category,
            signal: controller.signal,
          })
        ).trim()
        if (abortRef.current !== controller) return
        if (!text) {
          setErrors(prev => ({ ...prev, [params.key]: 'AI 返回了空内容，请重试。' }))
          return
        }
        params.apply(text)
      } catch (err) {
        if (abortRef.current !== controller) return
        if ((err as Error).name === 'AbortError') return
        setErrors(prev => ({
          ...prev,
          [params.key]: (err as Error).message || 'AI 生成失败，请重试。',
        }))
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
          setRegeneratingKey(null)
        }
      }
    },
    [aiConfig, projectId, category],
  )

  /** 整批替换结果 / 切换方案前调用：中止在飞请求并清空全部 loading 与错误，
   *  防止旧请求的 apply 按 key（常含 index）串写进新批次 */
  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setRegeneratingKey(null)
    setErrors({})
  }, [])

  const isRegenerating = useCallback(
    (key: string) => regeneratingKey === key,
    [regeneratingKey],
  )
  const errorFor = useCallback((key: string) => errors[key], [errors])
  const clearError = useCallback((key: string) => {
    setErrors(prev => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  /** 快速组装 EditableFieldRow 的重生成相关 props，减少面板样板代码 */
  const rowProps = useCallback(
    (
      key: string,
      fieldLabel: string,
      currentValue: string,
      apply: (text: string) => void,
      contextBlock?: string,
    ) => ({
      onRegenerate: (userHint?: string) =>
        regenerate({ key, fieldLabel, currentValue, userHint, contextBlock, apply }),
      regenerating: regeneratingKey === key,
      regenerateError: errors[key],
      onClearRegenerateError: () => clearError(key),
    }),
    [regenerate, regeneratingKey, errors, clearError],
  )

  return { regenerate, reset, isRegenerating, errorFor, clearError, rowProps }
}
