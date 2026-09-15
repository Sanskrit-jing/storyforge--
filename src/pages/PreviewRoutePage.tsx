import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router'
import { PreviewApp } from '../../ui-preview/src/PreviewApp'
import { products } from '../../ui-preview/src/catalog'
import previewStyles from '../../ui-preview/src/style.css?inline'
import { previewDestination } from '../components/navigation/product-navigation'

// Reuse the approved pages directly. Isolate their prototype-wide CSS so it
// cannot restyle the live editor when the reader returns to longform.
const styles = previewStyles.replace(/:root/g, ':host').replace(/body\{/g, ':host{') + `
.mobile-preview-menu{display:none}
@media(max-width:650px){
  .app{grid-template-columns:minmax(0,1fr);position:relative}
  .sidebar{display:none}
  .preview-navigation-open .sidebar{display:flex;position:absolute;top:0;bottom:0;left:0;width:220px;z-index:40;background:var(--shell-base)}
  .main{grid-column:1;padding-left:18px;padding-right:18px}
  .topbar{gap:10px;padding:0 12px}
  .brand{width:auto}.brand strong{font-size:19px}.brand>svg{width:20px}
  .top-actions{display:flex;gap:0}.top-actions>button{display:none}.top-actions>button.mobile-preview-menu{display:block}
  .global-nav button{padding:12px 9px}
  .hero-copy h1{font-size:34px}.hero{min-height:300px}
  .home-layout,.home-lower{grid-template-columns:1fr}
  .book-pair{grid-template-columns:1fr}.continue-book{flex-wrap:wrap}
  .preview-toolbar{gap:8px;padding:0 10px}.preview-toolbar>label,.preview-toolbar>.toolbar-sep{display:none}
}
`

export default function PreviewRoutePage({ productId = 'home' }: { productId?: string }) {
  const { pageId } = useParams()
  const navigate = useNavigate()
  const [root, setRoot] = useState<ShadowRoot | null>(null)
  const attach = useCallback((host: HTMLDivElement | null) => {
    if (host) setRoot(host.shadowRoot ?? host.attachShadow({ mode: 'open' }))
  }, [])
  const product = products.find(item => item.id === productId) ?? products[0]
  const page = product.pages.find(item => item.id === pageId) ?? product.pages[0]
  return <div ref={attach} data-testid="approved-product-ui">{root && createPortal(<>
    <style>{styles}</style>
    <PreviewApp key={`${product.id}/${page.id}`} route={[product.id, page.id]} onNavigate={route => navigate(previewDestination(route))}/>
  </>, root)}</div>
}
