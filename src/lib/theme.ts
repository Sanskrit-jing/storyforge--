/** The approved UI has one application palette, including dialogs and embedded editors.
 * Resolve retired saved theme names without touching manuscripts or editor formatting.
 */
export const DEFAULT_THEME = 'storyforge' as const
export type StoryForgeTheme = typeof DEFAULT_THEME
export function resolveStoryForgeTheme(_savedTheme: string | null): StoryForgeTheme {
  return DEFAULT_THEME
}
export function applyStoryForgeTheme(theme: StoryForgeTheme) {
  localStorage.setItem('storyforge-theme', theme)
  document.documentElement.setAttribute('data-theme', theme)
  window.dispatchEvent(new Event('themechange'))
}
