import { Routes, Route, Navigate } from 'react-router-dom'
import StudioApp from './studio/StudioApp'
import PlayerApp from './player/PlayerApp'

/**
 * Top-level router:
 *   /studio/*  → ALMA Studio (admin)
 *   /player/*  → ALMA Player (iFrame execution)
 *   /          → redirect to studio
 */
export default function App() {
  return (
    <Routes>
      <Route path="/studio/*" element={<StudioApp />} />
      <Route path="/player/*" element={<PlayerApp />} />
      <Route path="*" element={<Navigate to="/studio" replace />} />
    </Routes>
  )
}
