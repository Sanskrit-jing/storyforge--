import { webview } from '@kit.ArkWeb'
import { hilog } from '@kit.PerformanceAnalysisKit'
import { display, window } from '@kit.ArkUI'

const DOMAIN: number = 0x0000
const TAG: string = 'StoryForge'

/**
 * ArkWeb 的 resource://rawfile 页面 origin 为 'null'，而 ES module 脚本按 HTML 规范
 * 永远以 CORS 模式请求，Chromium 允许的 scheme 白名单（arkweb/http/https/data…）
 * 不含 resource://，module 脚本必然被拦截导致白屏（React 无法挂载）。
 *
 * 因此改用虚拟 https 源加载页面：Web 的 src 指向虚拟域，onInterceptRequest 把
 * 该域下的所有请求映射到 rawfile。页面与脚本同源，module fetch 不再触发 CORS，
 * 效果等价于 Android 端的 WebViewAssetLoader（appassets.androidplatform.net）。
 */
const VIRTUAL_ORIGIN: string = 'https://appassets.local'
const VIRTUAL_PREFIX: string = VIRTUAL_ORIGIN + '/'

/** 按扩展名推断 MIME；rawfile 资源无服务端 Content-Type，必须自己补 */
function guessMime(path: string): string {
  const dot: number = path.lastIndexOf('.')
  const ext: string = dot >= 0 ? path.slice(dot + 1).toLowerCase() : ''
  switch (ext) {
    case 'html':
    case 'htm':
      return 'text/html'
    case 'js':
    case 'mjs':
      return 'text/javascript'
    case 'css':
      return 'text/css'
    case 'json':
    case 'webmanifest':
      return 'application/json'
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'svg':
      return 'image/svg+xml'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'ico':
      return 'image/x-icon'
    case 'woff':
      return 'font/woff'
    case 'woff2':
      return 'font/woff2'
    case 'ttf':
      return 'font/ttf'
    case 'otf':
      return 'font/otf'
    case 'wasm':
      return 'application/wasm'
    case 'txt':
      return 'text/plain'
    default:
      return 'application/octet-stream'
  }
}

/**
 * StoryForge 在 HarmonyOS NEXT 上的壳。
 *
 * 与 Android 版同源：整个应用是打包进 rawfile 的同一份 Web 产物，
 * 手稿落在 WebView 的 IndexedDB 里，因此必须开启 DOM Storage 与 database，
 * 否则每次冷启动都会看起来「手稿被重置」。
 *
 * 满屏策略：Web 组件 expandSafeArea 画到状态栏/导航条底下，同时监听窗口
 * avoidArea，把安全区数值换算成 vp 后注入 `--safe-area-inset-*` CSS 变量
 * （与 Android 端 MainActivity.injectSafeAreaCss 同构）。前端 index.css 里
 * `.safe-area-pad` 等类基于这些变量避让，实现真满屏而非露黑边。
 */
@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController()
  private mainWindow: window.Window | null = null
  private safeAreaTop: number = 0
  private safeAreaBottom: number = 0
  private safeAreaLeft: number = 0
  private safeAreaRight: number = 0

  private buildResponse(content: Uint8Array, mime: string): WebResourceResponse {
    const response: WebResourceResponse = new WebResourceResponse()
    response.setResponseData(content.buffer)
    response.setResponseEncoding('utf-8')
    response.setResponseMimeType(mime)
    response.setResponseCode(200)
    response.setReasonMessage('OK')
    response.setResponseHeader([
      { headerKey: 'Access-Control-Allow-Origin', headerValue: '*' },
      { headerKey: 'Cache-Control', headerValue: 'no-cache' },
    ])
    return response
  }

  /** 把虚拟域 URL 映射为 rawfile 资源；找不到时按 SPA 路由回退 index.html */
  private serveFromRawfile(url: string): WebResourceResponse {
    let path: string = decodeURIComponent(url.slice(VIRTUAL_PREFIX.length).split('?')[0].split('#')[0])
    if (path === '') {
      path = 'index.html'
    }
    try {
      const content: Uint8Array = getContext(this).resourceManager.getRawFileContentSync(path)
      return this.buildResponse(content, guessMime(path))
    } catch {
      if (!path.includes('.')) {
        hilog.warn(DOMAIN, TAG, 'spa-fallback %{public}s', path)
        const fallback: Uint8Array = getContext(this).resourceManager.getRawFileContentSync('index.html')
        return this.buildResponse(fallback, 'text/html')
      }
      hilog.warn(DOMAIN, TAG, 'rawfile-miss %{public}s', path)
      const notFound: WebResourceResponse = new WebResourceResponse()
      notFound.setResponseCode(404)
      notFound.setReasonMessage('Not Found')
      return notFound
    }
  }

  /** 从窗口读取系统条/挖孔/导航条避让区，换算为 vp 并注入 Web */
  private refreshSafeArea(): void {
    const win: window.Window | null = this.mainWindow
    if (!win) {
      return
    }
    try {
      const system: window.AvoidArea = win.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM)
      const cutout: window.AvoidArea = win.getWindowAvoidArea(window.AvoidAreaType.TYPE_CUTOUT)
      const nav: window.AvoidArea = win.getWindowAvoidArea(window.AvoidAreaType.TYPE_NAVIGATION_INDICATOR)
      const density: number = display.getDefaultDisplaySync().densityPixels
      const toVp: (px: number) => number = (px: number): number => Math.round(px / density)
      this.safeAreaTop = toVp(Math.max(system.topRect.height, cutout.topRect.height))
      this.safeAreaBottom = toVp(Math.max(system.bottomRect.height, nav.bottomRect.height))
      this.safeAreaLeft = toVp(Math.max(system.leftRect.width, cutout.leftRect.width))
      this.safeAreaRight = toVp(Math.max(system.rightRect.width, cutout.rightRect.width))
      hilog.info(DOMAIN, TAG, 'safe-area t=%{public}d b=%{public}d l=%{public}d r=%{public}d',
        this.safeAreaTop, this.safeAreaBottom, this.safeAreaLeft, this.safeAreaRight)
      this.injectSafeAreaCss()
    } catch (e) {
      hilog.error(DOMAIN, TAG, 'avoid-area fail %{public}s', (e as Error).message)
    }
  }

  /** 与 Android 端同构：内联覆写 documentElement 上的 CSS 变量（优先级高于 :root env() 兜底） */
  private injectSafeAreaCss(): void {
    const js: string =
      'try{var s=document.documentElement.style;' +
      `s.setProperty('--safe-area-inset-top','${this.safeAreaTop}px');` +
      `s.setProperty('--safe-area-inset-bottom','${this.safeAreaBottom}px');` +
      `s.setProperty('--safe-area-inset-left','${this.safeAreaLeft}px');` +
      `s.setProperty('--safe-area-inset-right','${this.safeAreaRight}px');}catch(e){}`
    this.controller.runJavaScript(js).catch(() => {})
  }

  aboutToAppear(): void {
    window.getLastWindow(getContext(this)).then((win: window.Window) => {
      this.mainWindow = win
      // 应用页头是浅色，状态栏/导航条内容改深色，否则透明底上白图标不可读
      win.setWindowSystemBarProperties({ statusBarContentColor: '#57534e' })
      win.on('avoidAreaChange', (data: window.AvoidAreaOptions) => {
        hilog.info(DOMAIN, TAG, 'avoid-area-change type=%{public}d', data.type)
        this.refreshSafeArea()
      })
      this.refreshSafeArea()
    }).catch((e: Error) => {
      hilog.error(DOMAIN, TAG, 'get-window fail %{public}s', e.message)
    })
  }

  aboutToDisappear(): void {
    if (this.mainWindow) {
      this.mainWindow.off('avoidAreaChange')
    }
  }

  build() {
    Column() {
      Web({ src: VIRTUAL_ORIGIN + '/', controller: this.controller })
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .databaseAccess(true)
        .fileAccess(true)
        .imageAccess(true)
        .onlineImageAccess(true)
        // AI 端点在局域网时可能是明文 http（如 Ollama），不放行混合内容会表现为「连不上模型」
        .mixedMode(MixedMode.All)
        .horizontalScrollBarAccess(false)
        .width('100%')
        .height('100%')
        // 满屏：延伸到状态栏/导航条底下，避让交给前端 safe-area CSS 变量
        // （SafeAreaEdge 仅提供 TOP/BOTTOM，横向无系统条，无需扩展）
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        // 虚拟域请求 → rawfile；其余 URL（AI 端点、外网图片）放行走默认网络
        .onInterceptRequest((event: OnInterceptRequestEvent) => {
          const url: string = event.request.getRequestUrl()
          if (!url.startsWith(VIRTUAL_PREFIX)) {
            return null
          }
          return this.serveFromRawfile(url)
        })
        // 诊断：网页 console 转发到 hilog（过滤 tag StoryForge 即可看到前端报错）
        .onControllerAttached(() => {
          webview.WebviewController.setWebDebuggingAccess(true)
        })
        // 诊断：主文档加载完后读取 DOM 内部状态；并重注安全区变量（页面刚就绪时变量才有落点）
        .onPageEnd(() => {
          this.injectSafeAreaCss()
          this.controller.runJavaScript(
            'JSON.stringify({rs:document.readyState,title:document.title,' +
            'roots:document.getElementById("root")?.childElementCount??-1,' +
            'scripts:document.scripts.length,sheets:document.styleSheets.length})'
          ).then((v: string) => {
            hilog.info(DOMAIN, TAG, 'dom-state %{public}s', v)
          }).catch((e: Error) => {
            hilog.error(DOMAIN, TAG, 'dom-eval fail %{public}s', e.message)
          })
        })
        .onConsole((event: OnConsoleEvent) => {
          hilog.info(DOMAIN, TAG, 'js-console %{public}s:%{public}d %{public}s',
            event.message.getSourceId(), event.message.getLineNumber(), event.message.getMessage())
          return false
        })
        // 诊断：资源/导航加载失败转发到 hilog
        .onErrorReceive((event: OnErrorReceiveEvent) => {
          hilog.error(DOMAIN, TAG, 'web-error code=%{public}d info=%{public}s url=%{public}s',
            event.error.getErrorCode(), event.error.getErrorInfo(),
            event.request.getRequestUrl())
          return
        })
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#0a0a0f')
  }

  /** 系统返回手势：先在 Web 内后退，退无可退时再交给系统 */
  onBackPress(): boolean {
    if (this.controller.accessBackward()) {
      this.controller.backward()
      return true
    }
    return false
  }
}
