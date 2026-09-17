const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function shouldRegisterStoryForgeServiceWorker(hostname = globalThis.location?.hostname ?? ''): boolean {
  return !LOCAL_HOSTNAMES.has(hostname)
}

export function registerStoryForgeServiceWorker() {
  if (!shouldRegisterStoryForgeServiceWorker()) return
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/storyforge/sw.js', { scope: '/storyforge/' })
      .catch(error => {
        console.warn('[pwa] service worker 注册失败:', error)
      })
  })
}
