'use strict'

/**
 * StoryForge 桌面版主进程。
 *
 * 职责只有三件事：
 *   ① 拉起内嵌本地服务（dist + AI 代理，见 server.cjs）；
 *   ② 用固定地址 http://localhost:1111/storyforge/ 打开窗口，保证 IndexedDB origin 稳定；
 *   ③ 把外链交给系统浏览器，不放行应用内新窗口。
 *
 * 不做任何数据层改造：桌面版与浏览器版共用同一套 IndexedDB 结构，schema / 迁移 /
 * 导入导出逻辑完全不动。
 */

const { app, BrowserWindow, Menu, dialog, shell } = require('electron')
const path = require('node:path')
const { createAppServer, BASE_PATH, DEFAULT_PORT } = require('./server.cjs')

const APP_ORIGIN = `http://localhost:${DEFAULT_PORT}`
const APP_URL = `${APP_ORIGIN}${BASE_PATH}/`
const WEB_ROOT = path.join(__dirname, '..', 'dist')
const REPO_URL = 'https://github.com/yuanbw2025/storyforge'
// 打包后 public/ 已并入 dist/，开发态则直接读源码目录。
const WINDOW_ICON = path.join(__dirname, '..', app.isPackaged ? 'dist' : 'public', 'icon-512.png')

let appServer = null
let mainWindow = null

/**
 * 默认菜单是英文的 File/Edit/View/Window/Help。这里用中文重建同一套能力，
 * 保留角色（role）以免丢失撤销/复制/缩放等原生行为与快捷键。
 */
function applyChineseMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [{ label: '退出', role: 'quit' }],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '删除', role: 'delete' },
        { type: 'separator' },
        { label: '全选', role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '切换全屏', role: 'togglefullscreen' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '关闭窗口', role: 'close' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '项目主页', click: () => shell.openExternal(REPO_URL) },
        { label: '问题反馈', click: () => shell.openExternal(`${REPO_URL}/issues`) },
      ],
    },
  ]))
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    title: '故事熔炉 StoryForge',
    icon: WINDOW_ICON,
    backgroundColor: '#0a0a0f',
    autoHideMenuBar: false,
    show: false,
    webPreferences: {
      // 渲染进程只跑纯前端应用代码，不需要任何 Node 能力。
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  // 外链（GitHub Token 页、项目主页等）交给系统浏览器，避免在应用内开无地址栏窗口。
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_ORIGIN)) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(APP_ORIGIN)) return
    event.preventDefault()
    shell.openExternal(url)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.loadURL(APP_URL)
}

async function start() {
  applyChineseMenu()

  try {
    appServer = await createAppServer({ webRoot: WEB_ROOT, port: DEFAULT_PORT })
  } catch (error) {
    const busy = error.code === 'EADDRINUSE'
    dialog.showErrorBox(
      'StoryForge 无法启动',
      busy
        ? `端口 ${DEFAULT_PORT} 已被占用。\n\n请先关闭正在运行的 StoryForge 窗口，`
          + '或结束占用该端口的程序后重试。\n\n'
          + '注意：不要用另一个浏览器标签访问 localhost:1111，那会占用同一端口。'
        : `本地服务启动失败：${error.message}`,
    )
    app.quit()
    return
  }

  createMainWindow()
}

// 单实例：第二次启动只聚焦已有窗口，避免抢占 1111 端口导致两个实例互相报错。
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.setAppUserModelId('com.storyforge.desktop')

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(start)

  app.on('window-all-closed', () => app.quit())

  app.on('before-quit', () => {
    if (appServer) {
      appServer.close()
      appServer = null
    }
  })
}
