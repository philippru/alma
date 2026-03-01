/**
 * ALMA Assessment Picker
 * ──────────────────────────────────────────────────────────────────
 * Einstiegsseite für die KIS-Integration ohne API-Arbeit auf KIS-Seite.
 *
 * Orbis öffnet einfach diese URL (iFrame oder Popup):
 *   /player/pick?tenant_id=X&encounter_id=ENC123&patient_id=P456&patient_name=Max+Mustermann
 *
 * Die Seite zeigt alle verfügbaren Verfahren — ein Klick startet das Assessment.
 */
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, ChevronRight, Loader2, AlertCircle, HelpCircle } from 'lucide-react'
import { integrationApi } from '@/lib/api'

interface Assessment {
  id: string
  abbreviation: string
  name: string
  description: string
  version_number: number
  question_count: number
}

export default function AssessmentPicker() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const tenantId    = searchParams.get('tenant_id') || ''
  const encounterId = searchParams.get('encounter_id') || ''
  const patientId   = searchParams.get('patient_id') || ''
  const patientName = searchParams.get('patient_name') || ''
  const patientDob  = searchParams.get('patient_dob') || ''

  const { data: assessments, isLoading, error } = useQuery<Assessment[]>({
    queryKey: ['picker-assessments', tenantId],
    queryFn: () => integrationApi.listAssessments(tenantId),
    enabled: !!tenantId,
  })

  // Fehlende Pflichtparameter
  if (!tenantId || !encounterId) {
    return (
      <PickerShell>
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center py-16">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <p className="font-medium text-gray-700">Unvollständige Parameter</p>
          <p className="text-sm text-gray-400 max-w-xs">
            Die URL muss <code className="bg-gray-100 px-1 rounded">tenant_id</code> und{' '}
            <code className="bg-gray-100 px-1 rounded">encounter_id</code> enthalten.
          </p>
        </div>
      </PickerShell>
    )
  }

  function startAssessment(assessment: Assessment) {
    const params = new URLSearchParams({
      encounter_id: encounterId,
      tenant_id: tenantId,
      ...(patientId   && { patient_id: patientId }),
      ...(patientName && { patient_name: patientName }),
      ...(patientDob  && { patient_dob: patientDob }),
    })
    navigate(`/player/run/${assessment.id}?${params.toString()}`)
  }

  return (
    <PickerShell>
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-start gap-3">
          <ClipboardList className="w-6 h-6 text-alma-600 shrink-0 mt-0.5" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Verfahren auswählen</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Fall: <span className="font-mono text-gray-600">{encounterId}</span>
              {patientName && (
                <span className="ml-2 text-gray-500">· {patientName}</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* Loading */}
        {(isLoading || !tenantId) && (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-400 py-16">
            <Loader2 className="w-5 h-5 animate-spin" />
            Lade verfügbare Verfahren…
          </div>
        )}

        {/* API-Fehler */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Fehler beim Laden der Verfahren. Bitte Seite neu laden.
          </div>
        )}

        {/* Keine Verfahren */}
        {!isLoading && assessments?.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 text-center py-16">
            <ClipboardList className="w-10 h-10 text-gray-200" />
            <p className="font-medium text-gray-500">Keine Verfahren verfügbar</p>
            <p className="text-sm text-gray-400">
              Im Studio muss mindestens ein Assessment publiziert sein.
            </p>
          </div>
        )}

        {/* Verfahrensliste */}
        {assessments && assessments.length > 0 && (
          <div className="space-y-3">
            {assessments.map(a => (
              <button
                key={a.id}
                onClick={() => startAssessment(a)}
                className="w-full text-left group flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:border-alma-300 hover:shadow-sm transition-all"
              >
                {/* Kürzel-Badge */}
                <div className="w-12 h-12 bg-alma-50 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-alma-100 transition-colors">
                  <span className="text-alma-700 font-bold text-xs text-center leading-tight px-1">
                    {a.abbreviation.slice(0, 5)}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 truncate">{a.name}</p>
                    <span className="text-xs text-gray-400 shrink-0">v{a.version_number}</span>
                  </div>
                  {a.description && (
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{a.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <HelpCircle className="w-3 h-3" />
                      {a.question_count} Fragen
                    </span>
                  </div>
                </div>

                {/* Arrow */}
                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-alma-500 shrink-0 transition-colors" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-300 text-center">
        ALMA · Klinische Assessment-Plattform
      </div>
    </PickerShell>
  )
}

function PickerShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-0 sm:pt-8 pb-8">
      <div className="w-full max-w-lg">
        {/* ALMA Player Logo — nur auf Desktop sichtbar */}
        <div className="hidden sm:flex items-center gap-2 mb-4 px-1">
          <div className="w-6 h-6 bg-alma-500 rounded-md flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-xs">A</span>
          </div>
          <span className="font-semibold text-gray-700 text-sm">ALMA</span>
          <span className="text-xs bg-alma-100 text-alma-700 px-1.5 py-0.5 rounded font-medium">
            Player
          </span>
        </div>
        <div className="bg-white rounded-none sm:rounded-2xl shadow-none sm:shadow-lg border-0 sm:border border-gray-200 flex flex-col min-h-screen sm:min-h-0">
          {children}
        </div>
      </div>
    </div>
  )
}
