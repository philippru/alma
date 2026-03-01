import { Routes, Route } from 'react-router-dom'
import AssessmentPlayer from './pages/AssessmentPlayer'
import AssessmentPicker from './pages/AssessmentPicker'

/**
 * ALMA Player — iFrame-optimized, zero chrome.
 * /player/pick?tenant_id=&encounter_id=&patient_id=   ← KIS-Einstieg (Verfahrensauswahl)
 * /player/run/:assessmentId?encounter_id=&tenant_id=  ← Direktstart
 */
export default function PlayerApp() {
  return (
    <Routes>
      <Route path="/pick" element={<AssessmentPicker />} />
      <Route path="/run/:assessmentId" element={<AssessmentPlayer />} />
      <Route path="*" element={<PlayerNotFound />} />
    </Routes>
  )
}

function PlayerNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <p className="text-gray-500 text-sm">Kein Assessment angegeben.</p>
        <p className="text-xs text-gray-400 mt-1">
          Erwartete URL: /player/run/&#123;assessment_id&#125;?encounter_id=&#123;id&#125;&tenant_id=&#123;id&#125;
        </p>
      </div>
    </div>
  )
}
