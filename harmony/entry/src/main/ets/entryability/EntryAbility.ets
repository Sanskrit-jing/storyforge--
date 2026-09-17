import { AbilityConstant, ConfigurationConstant, UIAbility, Want } from '@kit.AbilityKit'
import { hilog } from '@kit.PerformanceAnalysisKit'
import { window } from '@kit.ArkUI'

const DOMAIN: number = 0x0000
const TAG: string = 'StoryForge'

/** 与 Web / Android 版一致的底色，避免启动瞬间闪白 */
const BACKGROUND: string = '#0a0a0f'

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    // 应用整体固定深色，与 Web 端主题一致（手稿编辑器配色按深色设计）
    this.context.getApplicationContext().setColorMode(ConfigurationConstant.ColorMode.COLOR_MODE_DARK)
    hilog.info(DOMAIN, TAG, 'onCreate: %{public}s', JSON.stringify(want.parameters ?? {}))
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        hilog.error(DOMAIN, TAG, 'loadContent failed: %{public}s', JSON.stringify(err))
        return
      }
      windowStage.getMainWindowSync().setWindowBackgroundColor(BACKGROUND)
    })
  }

  onDestroy(): void {
    hilog.info(DOMAIN, TAG, '%{public}s', 'onDestroy')
  }
}
