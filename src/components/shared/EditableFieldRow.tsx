/**
 * 可编辑字段行 —— AI 生成结果（采纳前）的手动修正入口
 *
 * 展示态与原 FieldRow 一致（label：value），点击文字原地进入编辑；
 * 复用 InlineTextarea（IME 组合输入保护、Escape 取消、blur 提交、自动增高）。
 */
import { InlineTextarea } from './InlineEdit'

interface EditableFieldRowProps {
  label: string
  value: string
  onChange: (value: string) => void
  /** 强调显示（如「一句话故事」），与原 FieldRow 的 highlight 视觉一致 */
  highlight?: boolean
  /** 紧凑排版（角色卡内 text-xs 场景） */
  compact?: boolean
  /** 覆盖默认展示态样式（highlight/compact 之上），如角色简介的 accent 小字 */
  displayClassName?: string
  placeholder?: string
  /** 编辑态最大行数，超出后内部滚动 */
  maxRows?: number
  /** 附加到外层容器（用于栅格跨列等布局场景） */
  className?: string
}

export default function EditableFieldRow({
  label,
  value,
  onChange,
  highlight = false,
  compact = false,
  displayClassName: displayClassNameProp,
  placeholder,
  maxRows = 24,
  className,
}: EditableFieldRowProps) {
  const defaultDisplay = highlight
    ? 'font-medium !text-accent'
    : compact
      ? '!text-xs !text-text-muted'
      : undefined
  const displayClassName = displayClassNameProp ?? defaultDisplay
  return (
    <div className={`flex items-start gap-1 ${className || ''}`}>
      <span className="shrink-0 pt-[2px] text-xs text-text-muted">{label}：</span>
      <div className="min-w-0 flex-1">
        <InlineTextarea
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          displayClassName={displayClassName}
          className={`w-full rounded border border-accent/30 bg-bg-base px-2 py-1 text-text-primary outline-none resize-none ${compact ? 'text-xs' : 'text-sm'}`}
          maxRows={maxRows}
        />
      </div>
    </div>
  )
}
