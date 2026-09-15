import { useSyncExternalStore } from 'react'
import { Check } from 'lucide-react'
import { applyStoryForgeTheme, getStoryForgeTheme, subscribeStoryForgeTheme, type StoryForgeTheme } from '../../lib/theme'
import './theme-selector.css'

const themes: { id: StoryForgeTheme; name: string; description: string }[] = [
  { id: 'storyforge', name: '青绿山水', description: '青绿山景，奶油纸面。' },
  { id: 'inkwash', name: '水墨远山', description: '淡墨远山，暖宣纸面，朱砂点睛。' },
]

export default function ThemeSelector() {
  const current = useSyncExternalStore(subscribeStoryForgeTheme, getStoryForgeTheme)
  return <section className="theme-selector" aria-labelledby="theme-selector-heading">
    <h3 id="theme-selector-heading">主题外观</h3>
    <p>切换即生效，并记住这台设备上的选择。正文保持清晰的纸面背景。</p>
    <div className="theme-options">
      {themes.map(theme => <button key={theme.id} type="button" className="theme-option"
        aria-label={theme.name} aria-pressed={current === theme.id}
        onClick={() => applyStoryForgeTheme(theme.id)}>
        <span className={`theme-sample theme-sample-${theme.id}`} aria-hidden="true">
          <span className="theme-sample-nav"><i /><i /><i /></span>
          <span className="theme-sample-paper"><b>山水之间，故事生长。</b><i /><i /><i /><em /></span>
        </span>
        <span className="theme-option-title">{theme.name}{current === theme.id && <Check size={16} aria-hidden="true" />}</span>
        <span className="theme-option-description">{theme.description}</span>
      </button>)}
    </div>
    <p className="theme-current" role="status">当前主题：{themes.find(theme => theme.id === current)?.name}</p>
  </section>
}
