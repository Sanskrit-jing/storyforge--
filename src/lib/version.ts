import packageMetadata from '../../package.json'

/** 应用展示版本直接读取 package.json，避免 Release、构建产物和界面版本分叉。 */
export const APP_VERSION = `v${packageMetadata.version}`

/** 每次 main 构建都可区分；语义版本仍由 package.json / Release tag 管理。 */
export const APP_BUILD_ID = `${APP_VERSION}+${
  typeof __STORYFORGE_BUILD_SHA__ === 'string' && __STORYFORGE_BUILD_SHA__
    ? __STORYFORGE_BUILD_SHA__
    : 'local'
}`

/**
 * 界面展示用的「平台版」版本号（如 v3.9.2+鸿蒙版），由 vite 按打包目标在构建时注入。
 * 精确到提交的构建号仍走 APP_BUILD_ID，供诊断报告事后定位产物来源。
 */
const PLATFORM_LABEL =
  typeof __STORYFORGE_PLATFORM__ === 'string' && __STORYFORGE_PLATFORM__ ? __STORYFORGE_PLATFORM__ : ''

export const APP_PLATFORM_BUILD_ID = PLATFORM_LABEL ? `${APP_VERSION}+${PLATFORM_LABEL}` : APP_BUILD_ID
