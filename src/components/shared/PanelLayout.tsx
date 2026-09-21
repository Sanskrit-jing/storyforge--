import { useState, useRef, useCallback, useEffect, type CSSProperties, type ReactNode } from 'react'
import { PanelLeftClose, PanelLeft } from 'lucide-react'
import { useIsNarrow } from '../../hooks/useIsNarrow'

interface Props {
  /** 侧栏内容 */
  sidebar: ReactNode
  /** 主编辑区内容 */
  children: ReactNode
  /** 侧栏默认宽度 (px) */
  defaultWidth?: number
  /** 侧栏最小宽度 (px) */
  minWidth?: number
  /** 侧栏最大宽度 (px) */
  maxWidth?: number
  /** 侧栏标题（显示在侧栏顶部） */
  sidebarTitle?: string
  /** 额外的 className */
  className?: string
}

/**
 * 通用侧栏+编辑区布局组件
 *
 * - 侧栏宽度可通过拖拽分割线调整
 * - 侧栏可折叠/展开
 * - 拖拽时有视觉反馈
 * - 窄屏（手机）默认收起侧栏让正文占满，展开时侧栏改为覆盖式抽屉而非挤压正文
 */
export default function PanelLayout({
  sidebar,
  children,
  defaultWidth = 220,
  minWidth = 160,
  maxWidth = 400,
  sidebarTitle,
  className = '',
}: Props) {
  const narrow = useIsNarrow()
  const [sidebarWidth, setSidebarWidth] = useState(defaultWidth)
  const [collapsed, setCollapsed] = useState(narrow)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 变窄（如手机从横屏转竖屏）时自动收起，避免定宽侧栏把正文挤没；
  // 变宽时不自动展开，尊重用户手动折叠的选择。
  useEffect(() => {
    if (narrow) setCollapsed(true)
  }, [narrow])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  useEffect(() => {
    if (!dragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const newWidth = Math.min(maxWidth, Math.max(minWidth, e.clientX - rect.left))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      setDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, minWidth, maxWidth])

  return (
    <div ref={containerRef} className={`flex h-full ${className}`}>
      {/* 侧栏 */}
      {!collapsed && (
        <>
          {/* 窄屏：抽屉遮罩，点空白处收起 */}
          <div
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={() => setCollapsed(true)}
            aria-hidden="true"
          />
          <div
            className="fixed inset-y-0 left-0 safe-area-pad-y z-40 flex flex-col overflow-hidden border-r border-border bg-bg-surface w-[78vw] md:static md:z-auto md:w-[var(--panel-w)] md:shrink-0"
            style={{ '--panel-w': `${sidebarWidth}px` } as CSSProperties}
          >
            {/* 侧栏头 */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-elevated">
              {sidebarTitle && (
                <span className="text-xs font-medium text-text-muted truncate">{sidebarTitle}</span>
              )}
              <button
                onClick={() => setCollapsed(true)}
                className="text-text-muted hover:text-text-primary ml-auto"
                title="收起侧栏"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>
            {/* 侧栏内容 */}
            <div className="flex-1 overflow-y-auto">
              {sidebar}
            </div>
          </div>
        </>
      )}

      {/* 拖拽分割线（仅宽屏；触摸端拖拽不可用且抽屉无需分割线） */}
      {!collapsed && (
        <div
          onMouseDown={handleMouseDown}
          className={`hidden w-1 shrink-0 cursor-col-resize transition-colors md:block ${
            dragging ? 'bg-accent' : 'bg-transparent hover:bg-accent/30'
          }`}
        />
      )}

      {/* 主编辑区 */}
      <div className="relative flex-1 min-w-0 overflow-y-auto">
        {collapsed && (
          <>
            {/* PC（≥1280px）：保持原左上角吸附标签 */}
            <div className="sticky top-3 z-40 h-0 pointer-events-none hidden xl:block">
              <button
                onClick={() => setCollapsed(false)}
                className="pointer-events-auto -ml-px inline-flex items-center gap-1.5 rounded-r-xl border border-l-0 border-border bg-bg-elevated/95 px-2.5 py-2 text-xs font-medium text-text-secondary shadow-theme-md backdrop-blur transition-colors hover:border-accent/60 hover:text-text-primary"
                title="展开侧栏"
              >
                <PanelLeft className="h-4 w-4" />
                {sidebarTitle && <span className="max-w-16 truncate">{sidebarTitle.replace(/^[^\p{L}\p{N}]+/u, '')}</span>}
              </button>
            </div>
            {/* 手机竖屏 / HD：左上角标签会压在正文输入框上显突兀；
                改为底部居中悬浮胶囊（避开顶部输入区，拇指可达，留安全区距离） */}
            <button
              onClick={() => setCollapsed(false)}
              className="fixed bottom-[max(0.875rem,var(--safe-area-inset-bottom))] left-1/2 z-40 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-bg-elevated/95 px-4 py-2 text-xs font-medium text-text-secondary shadow-lg backdrop-blur transition-colors hover:border-accent/60 hover:text-text-primary xl:hidden"
              title="展开侧栏"
            >
              <PanelLeft className="h-4 w-4" />
              {sidebarTitle && <span className="max-w-40 truncate">{sidebarTitle.replace(/^[^\p{L}\p{N}]+/u, '')}</span>}
            </button>
          </>
        )}
        {children}
      </div>
    </div>
  )
}
