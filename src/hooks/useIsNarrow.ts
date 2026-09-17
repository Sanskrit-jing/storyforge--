import { useEffect, useState } from 'react'

/** 窄屏断点（与 Tailwind 的 md: 对齐：< 768px 视为手机竖屏） */
const NARROW_QUERY = '(max-width: 767px)'

function narrowQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(NARROW_QUERY)
}

function readNarrow(): boolean {
  return narrowQuery()?.matches ?? false
}

/**
 * 是否为窄屏（手机）。
 *
 * **优先用 Tailwind 的 `md:` 前缀做响应式**——纯样式层面的适配（换列宽、换方向、隐藏次要元素）
 * 一律走 CSS 断点，不要用这个 Hook，避免多一份「JS 状态与 CSS 断点不同步」的隐患。
 *
 * 只有「CSS 断点改不动、必须换结构或换交互」的场景才用它，例如：
 *   · 三栏并排 → 窄屏分步钻取（需要记住"当前在哪一步"）
 *   · 侧栏常驻 → 窄屏抽屉（需要记住"抽屉开没开"）
 *   · 触摸端 hover 才显形的操作 → 常显
 *
 * 监听 `matchMedia` 的 change，因此屏幕旋转、折叠屏展开、分屏窗口变化都会实时生效。
 */
export function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(readNarrow)

  useEffect(() => {
    const mql = narrowQuery()
    if (!mql) return
    const onChange = (event: MediaQueryListEvent) => setNarrow(event.matches)
    setNarrow(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return narrow
}
