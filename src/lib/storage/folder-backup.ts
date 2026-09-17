/**
 * 本地文件夹备份/恢复（FB-11 数据持久层）
 *
 * 纯逻辑层（不含 React），便于测试。负责:
 *   · 选择文件夹 / 校验授权
 *   · 把某项目的完整数据写成 JSON 落到文件夹（自动备份 + 手动）
 *   · 从文件夹读回所有 storyforge-*.json（首页「从本地文件夹恢复」用）
 *
 * 两条平台路径（本模块内分派，调用方无感）:
 *   · Web / 桌面：File System Access API（`showDirectoryPicker` + 句柄）
 *   · Android APK：原生 `SafFolder` 插件（Storage Access Framework）。
 *     WebView 里没有 FSA，必须走系统选目录框，否则「选择文件夹」按钮点了没反应。
 *
 * 句柄持久化在 folder-handle-store.ts（独立 IndexedDB），与本模块配合。
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import { exportProjectJSON, type ProjectExportData } from '../export/json-export'
import { db } from '../db/schema'

interface WindowWithFSA extends Window {
  showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
}

/**
 * Android SAF 文件夹句柄。
 *
 * WebView 里拿不到 `FileSystemDirectoryHandle`，原生端只记住系统给的目录树 uri
 * （`ACTION_OPEN_DOCUMENT_TREE` 的授权由系统持久化，重启应用依然有效）。
 * 这个对象是纯数据、可结构化克隆，所以照样能存进 folder-handle-store 的 IndexedDB。
 */
export interface SafFolderHandle {
  readonly saf: true
  /** 目录树 uri，形如 content://…/tree/primary%3AStoryForge */
  readonly uri: string
  /** 展示用文件夹名 */
  name: string
}

/** 本地备份文件夹句柄：Web/桌面是 FSA 句柄，Android 是 SAF 句柄。 */
export type FolderHandle = FileSystemDirectoryHandle | SafFolderHandle

/** 是否为原生 SAF 句柄（用于分派与「失效需重选」这类平台特有交互）。 */
export function isSafFolder(handle: FolderHandle): handle is SafFolderHandle {
  return (handle as SafFolderHandle).saf === true
}

// ── 原生插件桥（android/app/src/main/java/com/storyforge/app/SafFolderPlugin.java）──
interface SafFolderPluginApi {
  pickDirectory(): Promise<{ uri?: string; label?: string }>
  checkPermission(options: { uri: string }): Promise<{ granted: boolean }>
  writeFile(options: { uri: string; filename: string; data: string }): Promise<{ name: string }>
  listFiles(options: { uri: string }): Promise<{ files: { name: string; text: string }[] }>
}

const SafFolder = registerPlugin<SafFolderPluginApi>('SafFolder')

/** 当前环境是否支持本地文件夹备份（Web/桌面 FSA，或 Android 原生 SAF）。 */
export function isFolderBackupSupported(): boolean {
  if (Capacitor.isNativePlatform()) return true
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

/** 弹出系统选择框让用户挑一个文件夹（读写）。取消返回 null。 */
export async function pickFolder(): Promise<FolderHandle | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await SafFolder.pickDirectory()
      if (!res?.uri) return null // 用户取消：插件 resolve 空对象
      return { saf: true, uri: res.uri, name: res.label || '已选文件夹' }
    } catch (err) {
      console.error('[folder] 选择目录失败:', err)
      return null
    }
  }

  const picker = (window as WindowWithFSA).showDirectoryPicker
  if (!picker) return null
  try {
    return await picker({ mode: 'readwrite' })
  } catch (err) {
    const e = err as { name?: string }
    if (e?.name !== 'AbortError') console.error('[folder] 选择目录失败:', err)
    return null
  }
}

/** 已授权才返回 true，**不弹窗**（用于启动期静默判断能否自动写/读）。 */
export async function folderPermissionGranted(
  handle: FolderHandle,
  write = true,
): Promise<boolean> {
  if (isSafFolder(handle)) {
    try {
      const res = await SafFolder.checkPermission({ uri: handle.uri })
      return res?.granted === true
    } catch {
      return false
    }
  }
  try {
    const opts = { mode: write ? 'readwrite' : 'read' }
    // queryPermission 尚未进 lib.dom 标准类型
    const q = await (handle as unknown as { queryPermission?: (o: object) => Promise<string> }).queryPermission?.(opts)
    return q === 'granted'
  } catch {
    return false
  }
}

/** 校验并在需要时**弹窗请求**授权（须在用户手势内调用）。返回是否已授权。 */
export async function ensureFolderPermission(
  handle: FolderHandle,
  write = true,
): Promise<boolean> {
  // SAF 的授权在「选目录」时已一次性持久化，之后无法再弹窗；失效只能重新选目录。
  if (isSafFolder(handle)) return folderPermissionGranted(handle, write)

  try {
    const opts = { mode: write ? 'readwrite' : 'read' }
    const h = handle as unknown as {
      queryPermission?: (o: object) => Promise<string>
      requestPermission?: (o: object) => Promise<string>
    }
    if ((await h.queryPermission?.(opts)) === 'granted') return true
    if ((await h.requestPermission?.(opts)) === 'granted') return true
    return false
  } catch {
    return false
  }
}

function safeName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '-')
}

/** 项目备份文件名（按书名生成，恢复时按 storyforge-*.json 识别） */
export function backupFilename(projectName: string): string {
  return `storyforge-${safeName(projectName)}.json`
}

/** 把某项目的完整数据写成 JSON 落到绑定文件夹。返回是否成功。 */
export async function writeProjectJSONToFolder(
  handle: FolderHandle,
  projectId: number,
): Promise<boolean> {
  const project = await db.projects.get(projectId)
  if (!project) return false
  const data = await exportProjectJSON(projectId)
  const filename = backupFilename(project.name)
  const text = JSON.stringify(data, null, 2)

  if (isSafFolder(handle)) {
    try {
      await SafFolder.writeFile({ uri: handle.uri, filename, data: text })
      return true
    } catch (err) {
      console.error('[folder] 写入原生文件夹失败:', err)
      return false
    }
  }

  const fileHandle = await handle.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(text)
  await writable.close()
  return true
}

export interface FolderBackupFile {
  name: string
  data: ProjectExportData
}

/** 读回文件夹里所有 storyforge-*.json（解析失败的单个文件跳过，不阻断）。 */
export async function readStoryforgeBackups(
  handle: FolderHandle,
): Promise<FolderBackupFile[]> {
  if (isSafFolder(handle)) {
    const res = await SafFolder.listFiles({ uri: handle.uri })
    const out: FolderBackupFile[] = []
    for (const file of res?.files ?? []) {
      try {
        out.push({ name: file.name, data: JSON.parse(file.text) as ProjectExportData })
      } catch (e) {
        console.warn('[folder] 跳过无法解析的备份文件:', file.name, e)
      }
    }
    return out
  }

  const out: FolderBackupFile[] = []
  // entries() 是异步迭代器（FileSystemDirectoryHandle）
  const dir = handle as unknown as {
    entries: () => AsyncIterableIterator<[string, { kind: string; getFile: () => Promise<File> }]>
  }
  for await (const [name, entry] of dir.entries()) {
    if (entry.kind === 'file' && /^storyforge-.*\.json$/i.test(name)) {
      try {
        const file = await entry.getFile()
        const text = await file.text()
        out.push({ name, data: JSON.parse(text) as ProjectExportData })
      } catch (e) {
        console.warn('[folder] 跳过无法解析的备份文件:', name, e)
      }
    }
  }
  return out
}
