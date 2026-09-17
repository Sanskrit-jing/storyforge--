import { Capacitor } from '@capacitor/core'

/**
 * 跨运行目标的「把内容交给用户保存」统一入口。
 *
 * Web / Electron 桌面版：沿用原有的 Blob + `<a download>`，行为零变化。
 *
 * Android（Capacitor）：WebView 不处理 `blob:` 的 download 请求，`a.click()` 静默失效
 * （点了没反应、文件也不落盘），因此改走原生链路：先写入应用缓存目录（零权限、全
 * Android 版本可用），再拉起系统分享面板，由用户存进「文件」/ 网盘或直接发给别的应用。
 *
 * 不用 Directory.Documents：它在 Android 上映射到 getExternalStoragePublicDirectory +
 * WRITE_EXTERNAL_STORAGE，这套在 Android 11+ 的作用域存储下已经失效。
 */

/** 当前是否运行在 Capacitor 原生壳（Android APK）内。 */
export function isNativeShell(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * Android 文件名只剔除路径分隔符与 NUL —— 这两类会破坏写入路径，
 * 其余（含中文、空格、括号）原样保留，保证用户看到的文件名仍然可读。
 */
function sanitizeFileName(filename: string): string {
  return filename.replace(/[/\\\u0000]/g, '_')
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('读取待保存内容失败'))
    reader.onload = () => {
      // FileReader 产出 data URL，插件要的是不含前缀的裸 base64。
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })
}

/** 原生壳：写缓存目录 → 拉起分享面板。插件按需动态引入，避免压进 Web / 桌面包体。 */
async function saveBlobNative(blob: Blob, filename: string): Promise<void> {
  const [{ Directory, Filesystem }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])

  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
  })

  await Share.share({ files: [uri], dialogTitle: '保存或分享导出文件' })
}

/** 浏览器 / Electron：沿用原有的下载触发方式。 */
function saveBlobWeb(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 把一份内容交给用户保存。
 *
 * 原生壳内必须 await：需要等原生写入完成、分享面板拉起。Web / 桌面版即时返回。
 */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  if (!isNativeShell()) {
    saveBlobWeb(blob, filename)
    return
  }
  await saveBlobNative(blob, sanitizeFileName(filename))
}

/** 文本内容的便捷入口。 */
export async function saveText(
  content: string,
  filename: string,
  mimeType: string = 'text/plain',
): Promise<void> {
  await saveBlob(new Blob([content], { type: `${mimeType};charset=utf-8` }), filename)
}
