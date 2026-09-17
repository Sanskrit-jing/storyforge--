import { Routes, Route } from 'react-router'
import HomePage from './pages/HomePage'
import WorkspacePage from './pages/WorkspacePage'
import SettingsRoutePage from './pages/SettingsRoutePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/settings" element={<SettingsRoutePage />} />
      <Route path="/workspace/:projectId" element={<WorkspacePage />} />
    </Routes>
  )
}
