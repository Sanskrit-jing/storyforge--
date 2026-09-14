# 新版 UI 展示预览

首页通过独立 HTML 入口打开本目录。当前版本含 199 个示例页面，用于公开展示正在优化调整中的 UI；所有内容都是示例，真实业务尚未接入。

- `src/catalog.ts` 定义产品、页面、字段和内部覆盖编号。
- `src/main.tsx` 只管理内存中的导航、展示状态和弹窗；顶部持续标明预览范围并提供返回正式版链接。
- 不导入正式应用的 store、DB、AI、registry 或业务服务，不注册 service worker。
- 复用 `public/demo-assets/mist-harbor` 与 `public/prototypes/tidewake-town/media` 中的既有示例图。本目录只新增纸面外框背景、地图与少量本地示例素材。
- 原始云文档设计参考图与内部审核材料不包含在公开预览中。

Vite 使用独立 HTML 构建入口。运行 `npm run dev` 后可打开 `/storyforge/ui-preview/index.html#home/today`。`npm run build` 同时检查预览 TypeScript 并生成页面；正式首页只载入入口卡片，不加载预览的代码和样式。预览专属 HTML/JS/CSS 不进入正式应用的 PWA 预缓存。

后续实装必须按产品逐步接入现行契约，示例中的「已保存」「已发布」等状态不代表真实业务能力或写入结果。
