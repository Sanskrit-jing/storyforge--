/** Device appearance only: never rewrite manuscripts or saved editor formatting. */
export const DEFAULT_THEME = 'storyforge' as const
export type StoryForgeTheme = typeof DEFAULT_THEME | 'inkwash'
export function resolveStoryForgeTheme(savedTheme: string | null): StoryForgeTheme {
  return savedTheme === 'inkwash' ? 'inkwash' : DEFAULT_THEME
}
export function applyStoryForgeTheme(theme: StoryForgeTheme) {
  localStorage.setItem('storyforge-theme', theme)
  document.documentElement.setAttribute('data-theme', theme)
  window.dispatchEvent(new Event('themechange'))
}

export function getStoryForgeTheme(): StoryForgeTheme {
  return resolveStoryForgeTheme(document.documentElement.getAttribute('data-theme'))
}

export function subscribeStoryForgeTheme(onChange: () => void) {
  window.addEventListener('themechange', onChange)
  return () => window.removeEventListener('themechange', onChange)
}
