import { Routes, Route } from 'react-router'
import HomePage from './pages/HomePage'
import WorkspacePage from './pages/WorkspacePage'
import SettingsRoutePage from './pages/SettingsRoutePage'
import KnowledgeRoutePage from './pages/KnowledgeRoutePage'
import PhrasesRoutePage from './pages/PhrasesRoutePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/settings" element={<SettingsRoutePage />} />
      <Route path="/knowledge" element={<KnowledgeRoutePage />} />
      <Route path="/phrases" element={<PhrasesRoutePage />} />
      <Route path="/workspace/:projectId" element={<WorkspacePage />} />
    </Routes>
  )
}
