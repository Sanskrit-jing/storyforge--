# 故事熔炉 · HarmonyOS 壳工程

## 为什么需要这个工程

华为机型分两类，发布方式不同：

| 设备 | 系统 | 安装包 | 怎么出包 |
| --- | --- | --- | --- |
| 华为平板、老款华为手机 | HarmonyOS 4.x 及以下（兼容 Android） | `.apk` | 仓库根 `npm run android:apk`（手机包）/ `npm run android:apk:tablet`（平板包，应用名“故事熔炉 平板版”） |
| 新款华为手机、平板 | HarmonyOS NEXT 5.0+（不再兼容 Android） | `.hap` | 本工程 |

两个 Android flavor（`phone` / `tablet`）共用同一份 Web 产物与同一套横竖屏自适应布局，
平板包只改应用标识（`com.storyforge.app.tablet`）与显示名，因此可与手机包并存安装。

HarmonyOS NEXT 无法安装 APK，所以这里是一个 WebView 壳：**不重写任何业务代码**，把
`vite build --mode android` 的同一份产物放进 `rawfile` 里跑，因此两端功能与数据模型完全一致。

## 目录

```
harmony/
├── AppScope/                    应用级配置与图标
├── entry/                       唯一模块（entry HAP）
│   ├── src/main/
│   │   ├── ets/entryability/EntryAbility.ets   深色固定 + 加载首页
│   │   ├── ets/pages/Index.ets                 Web 组件（开启 IndexedDB / 混合内容）
│   │   ├── module.json5                        phone + tablet 双形态
│   │   └── resources/rawfile/                  ← 由脚本生成，勿手工编辑
│   ├── build-profile.json5
│   └── hvigorfile.ts
├── build-profile.json5
└── hvigorfile.ts
```

## 出包步骤

1. **同步 Web 产物**（在仓库根执行，会同时刷新应用图标）

   ```bash
   npm run harmony:assets
   ```

   这一步做两件事：把 `dist/` 拷进 `harmony/entry/src/main/resources/rawfile/`，
   并把 `public/icon-512.png` 复制成 `app_icon.png`（图标只保留 `public/` 一处事实源）。

2. **打开工程**：DevEco Studio 5.0 及以上 → `File > Open` → 选择本 `harmony/` 目录。
   首次打开会提示 `Sync Now`，等待 hvigor 同步完成。

3. **配置签名**：`File > Project Structure > Signing Configs` → 勾选
   `Automatically generate signature`（需登录华为开发者账号）。真机调试必须签名。

4. **运行 / 出包**：
   - 真机调试：连上手机，点 `Run 'entry'`。
   - 正式产物：`Build > Build Hap(s)/APP(s) > Build Hap(s)`，
     产物在 `harmony/entry/build/default/outputs/default/entry-default-signed.hap`。

5. **后续更新 Web 内容**：改完代码重新执行 `npm run harmony:assets`，在 DevEco 里重新 Run 即可，
   ArkTS 侧通常无需改动。

## 与 Android / Web 版的关系

- 三个平台跑同一份 `src/`，不存在「鸿蒙专用实现」。
- `Index.ets` 里显式开了 `domStorageAccess` + `databaseAccess`：手稿存在 WebView 的
  IndexedDB 中，关掉这两项会表现为「重启后手稿被重置」。
- `mixedMode(MixedMode.All)` 与 Android 的 `allowMixedContent` 同因：AI 端点若指向
  局域网明文 http（如 Ollama `http://192.168.x.x:11434`），不放行混合内容会表现为「连不上模型」。
- 数据不跨端同步，也不跨安装方式迁移；换设备用应用内「数据管理 → 导出」搬。

## 已知未验证项

本骨架是在**没有 HarmonyOS SDK 的机器上**生成的，尚未在 DevEco Studio 中实际编译过。
若首次 Sync 报错，通常是版本对齐问题，按 IDE 提示处理即可：

- `compatibleSdkVersion`（当前写 `5.0.0(12)`）与本机 SDK 版本不一致 → 改成 IDE 提供的版本；
- `hvigor/hvigor-config.json5` 的 `modelVersion`（当前 `5.0.0`）与 hvigor 版本不一致 → 按提示升级。

ArkTS 侧只依赖 `@kit.ArkWeb`、`@kit.AbilityKit`、`@kit.PerformanceAnalysisKit` 三个内置 Kit，
没有第三方依赖，因此 `oh-package.json5` 的 `dependencies` 为空。
