/**
 * 跨运行目标的「复制到剪贴板」。
 *
 * 只调 `navigator.clipboard.writeText` 在 Android WebView 上并不保险：文档未聚焦、
 * 缺少用户手势或权限被拒时会直接 reject，用户看到的就是「点了复制没反应」。
 * 因此这里先走标准 API，失败再退回 `document.execCommand('copy')`（WebView 稳定可用）。
 */

/** 复制文本，返回是否真的复制成功。 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 掉到下面的兜底路径
  }
  return copyTextLegacy(text)
}

function copyTextLegacy(text: string): boolean {
  try {
    const area = document.createElement('textarea')
    area.value = text
    // 必须留在文档流里且可选中，否则部分 WebView 不生效
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '0'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    area.setSelectionRange(0, area.value.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
