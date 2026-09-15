import { products } from '../../../ui-preview/src/catalog'

// Same product order and labels as the approved UI catalog.
export const PRODUCT_NAVIGATION = products.filter(product => product.id !== 'community').map(product => ({
  id: product.id, label: product.short, path: product.id === 'home' ? '/' : `/${product.id}`,
}))

const longModules: Record<string, string> = {
  overview: 'info', inspiration: 'inspiration', worldbuilding: 'world-rules', story: 'story-design',
  characters: 'characters', relations: 'relations', outline: 'outline', scenes: 'detailed-outline',
  editor: 'chapters-list', impact: 'editor', arcs: 'story-arc', characterplot: 'character-driven-plot',
  foreshadow: 'foreshadow', facts: 'fact-library', state: 'state-table', timeline: 'story-timeline',
  places: 'locations', growth: 'cultivation-progress', verify: 'scene-verify', style: 'style-learning',
  retrieval: 'rag-library', prompts: 'prompts', replace: 'global-replace',
}
export function previewDestination(route: string): string {
  const [product, page] = route.split('/')
  if (product === 'long') {
    if (!page || page === 'library') return '/long'
    if (page === 'nodes' || page === 'agent') return `/long?section=workbench&mode=${page}`
    if (page === 'derive') return '/long?section=derive'
    if (page === 'import') return '/long?section=import&module=import-doc'
    if (page === 'versions') return '/long?section=versions&module=version-history'
    return `/long?section=workbench&module=${longModules[page] ?? 'info'}&mode=steps`
  }
  if (product === 'home') return !page || page === 'today' ? '/' : `/home/${page}`
  return `/${product}${page ? `/${page}` : ''}`
}
