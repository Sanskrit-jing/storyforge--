import { useEffect, useMemo, useRef } from 'react'

/**
 * 自动保存 Hook
 * 当 data 变化时，debounce 后调用 saveFn。
 * 组件卸载时如果有未保存的变更，会立即 flush 一次确保数据落盘。
 */
export interface AutoSaveController {
  /**
   * 立即保存未落盘的变更（若有），并清除等待中的 debounce 定时器。
   * 保存使用「发起 debounce 时与 data 配对的 saveFn」：在切换目标（如切章）
   * 之后调用 flush，旧内容仍写回旧目标，不会经新目标的 saveFn 写错章节。
   */
  flush: () => Promise<void>
}

export function useAutoSave<T>(
  data: T,
  saveFn: (data: T) => Promise<void>,
  delay: number = 1500,
): AutoSaveController {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef = useRef(data)
  const dirtyRef = useRef(false)
  const isFirstRender = useRef(true)
  // 与待保存 data 配对的 saveFn：只在 data 变化（effect 重跑）时重新配对，
  // 不随每次 render 更新。这样「data 还没重置、saveFn 已切到新章节」的切章
  // 窗口内，旧内容仍配旧章节的 saveFn，flush 不会把内容写进新章节。
  const pairedSaveFnRef = useRef(saveFn)

  dataRef.current = data

  const controller = useMemo<AutoSaveController>(() => ({
    flush: async () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (!dirtyRef.current) return
      dirtyRef.current = false
      await pairedSaveFnRef.current(dataRef.current)
    },
  }), [])

  useEffect(() => {
    // 跳过首次渲染
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    // data 变化：重新配对 saveFn 并标记有待保存的变更
    dirtyRef.current = true
    pairedSaveFnRef.current = saveFn

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    // 到期保存走同一条 flush 路径，与手动 flush 行为一致
    timerRef.current = setTimeout(() => {
      void controller.flush().catch(() => {})
    }, delay)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
    // saveFn 不进依赖:配对必须跟随 data 变化,saveFn 单独变化不能触发重跑,
    // 否则切章窗口(data 未重置、saveFn 已换)会把旧内容配上新 saveFn。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, delay, controller])

  // 组件卸载时：如果有未保存的变更，立即 flush
  useEffect(() => {
    return () => {
      void controller.flush().catch(() => {})
    }
  }, [controller])

  return controller
}
