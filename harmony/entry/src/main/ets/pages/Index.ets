import { webview } from '@kit.ArkWeb'

/**
 * StoryForge 在 HarmonyOS NEXT 上的壳。
 *
 * 与 Android 版同源：整个应用是打包进 rawfile 的同一份 Web 产物，
 * 手稿落在 WebView 的 IndexedDB 里，因此必须开启 DOM Storage 与 database，
 * 否则每次冷启动都会看起来「手稿被重置」。
 */
@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController()

  build() {
    Column() {
      Web({ src: $rawfile('index.html'), controller: this.controller })
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
