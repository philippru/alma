import { Routes, Route } from 'react-router-dom'
import StudioLayout from './components/StudioLayout'
import Dashboard from './pages/Dashboard'
import AssessmentList from './pages/AssessmentList'
import AssessmentEditor from './pages/AssessmentEditor'
import Upload from './pages/Upload'
import SessionList from './pages/SessionList'

export default function StudioApp() {
  return (
    <StudioLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/assessments" element={<AssessmentList />} />
        <Route path="/assessments/new" element={<Upload />} />
        <Route path="/assessments/:id/edit" element={<AssessmentEditor />} />
        <Route path="/sessions" element={<SessionList />} />
      </Routes>
    </StudioLayout>
  )
}
