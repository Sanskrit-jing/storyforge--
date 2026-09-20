import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Android（Capacitor）打包配置。
 *
 * 与 electron/server.cjs 的固定端口策略是同一个理由：IndexedDB 按 origin 隔离，
 * WebView 必须始终落在同一个源上，手稿才不会被"重置"。Capacitor 默认以
 * https://localhost 作为源，此处显式写死，避免日后被改动导致老用户数据看似丢失。
 */
const config: CapacitorConfig = {
  appId: 'com.storyforge.app',
  appName: '故事熔炉',
  webDir: 'dist',
  // 首屏底色与 Web 端一致，避免 WebView 启动时先闪一下白屏。
  backgroundColor: '#0a0a0f',
  server: {
    androidScheme: 'https',
  },
  android: {
    /**
     * 页面本身是 https 源，而用户可能把 AI / 嵌入服务的 Base URL 指向局域网内的
     * 明文 http 端点（例如 Ollama 的 http://192.168.x.x:11434/v1）。不放行混合内容
     * 的话这类请求会被 WebView 直接拦掉，表现为"连不上模型"。
     */
    allowMixedContent: true,
    backgroundColor: '#0a0a0f',
    // 允许 chrome://inspect 连接渲染进程做实证排查（发布前需复核是否关闭）。
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    SystemBars: {
      /**
       * 关闭 Capacitor SystemBars 的 insets 处理，由 MainActivity.setupEdgeToEdge()
       * 完全接管：不设 WebView 版本门槛，一律 edge-to-edge + 注入
       * `--safe-area-inset-*` CSS 变量。若不关闭，SystemBars 会按 WebView 版本
       * 走 padding/透传两条路径，与自管逻辑叠加导致双重避让或黑边。
       */
      insetsHandling: 'disable',
    },
  },
}

export default config
