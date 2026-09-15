/** Bookmarks remain readable, but can never select a retired application shell. */
export function retiredHomeDestination(params: URLSearchParams): string | null {
  const tab = params.get('tab'), product = params.get('product')
  if (!tab && !product && !params.has('legacy')) return null
  const next = new URLSearchParams(params)
  next.delete('tab'); next.delete('legacy'); next.delete('product')
  const suffix = () => next.size ? `?${next}` : ''
  const page = next.has('worldHandoff') ? 'source' : next.has('session') ? 'play' : next.has('project') ? 'production' : 'library'
  if (product === 'avg') return `/avg/${page}${suffix()}`
  if (tab === 'ttrpg') return `/ttrpg/${next.has('onlineHandoff') ? 'room' : page}${suffix()}`
  if (tab === 'town') return `/town/${page}${suffix()}`
  if (tab === 'chat' || product === 'character-interaction') return `/chat/${page}${suffix()}`
  if (tab === 'worlds') return `/world/worlds${suffix()}`
  if (tab === 'market') return `/community/market${suffix()}`
  if (tab === 'text-games') return `/${product === 'text-open-world' ? 'openworld' : 'adventure'}/runtime${suffix()}`
  if (tab === 'novel' || tab === 'nodes') {
    if (tab === 'nodes') { next.set('mode', 'nodes'); next.set('module', 'visual-workflows') }
    const project = next.get('project'); next.delete('project')
    return `${project ? `/workspace/${encodeURIComponent(project)}` : '/long'}${suffix()}`
  }
  return `/${suffix()}`
}

/** Only same-application return paths; never accept an external redirect. */
export function safeSettingsReturn(value: string | null): string | null {
  if (!value || !/^\/(?:play|ttrpg|avg|town|chat|long|short|script|comic|motion|world|home|workspace)(?:[/?][^#]*)?$/.test(value)
    || /[\\\r\n]/.test(value) || value.includes('..')) return null
  return value
}
