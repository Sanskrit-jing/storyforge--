import { Navigate, useSearchParams } from 'react-router'
import { safeSettingsReturn } from '../components/navigation/retired-routes'
export default function SettingsRoutePage() {
  const [params] = useSearchParams()
  const next = new URLSearchParams()
  const target = safeSettingsReturn(params.get('returnTo'))
  if (target) next.set('returnTo', target)
  if (params.has('project')) next.set('project', params.get('project')!)
  return <Navigate replace to={`/home/settings${next.size ? `?${next}` : ''}`}/>
}
