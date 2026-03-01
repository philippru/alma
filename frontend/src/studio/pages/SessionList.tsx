import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileDown, CheckCircle, XCircle, Clock, Loader2,
  AlertCircle, ClipboardList, Download,
} from 'lucide-react'
import { tenantApi, studioApi } from '@/lib/api'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ExportEntry {
  success: boolean
  file?: string
  pdf?: string
  path?: string
  format?: string
}

interface Session {
  id: string
  encounter_id: string
  patient_name: string | null
  patient_id: string | null
  assessment_name: string
  assessment_abbreviation: string
  assessment_version: number
  status: string
  started_at: string
  completed_at: string | null
  score: {
    total_score: number | null
    interpretation: string
  }
  export_log: Record<string, ExportEntry>
}

// ── Exporter badge labels ────────────────────────────────────────────────────

const EXPORTER_LABELS: Record<string, string> = {
  hl7_oru: 'HL7 ORU',
  hl7_mdm: 'HL7 MDM',
  fhir: 'FHIR',
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ExporterBadges({ exportLog, sessionId }: { exportLog: Record<string, ExportEntry>; sessionId: string }) {
  const entries = Object.entries(exportLog).filter(([k]) => !k.startsWith('_'))
  if (entries.length === 0) {
    return <span className="text-xs text-gray-300 italic">—</span>
  }
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {entries.map(([key, val]) => {
        const canDownload = val.success && !!val.file
        const label = EXPORTER_LABELS[key] ?? key
        const inner = (
          <>
            {val.success ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            {label}
            {canDownload && <Download className="w-2.5 h-2.5 opacity-60" />}
          </>
        )
        const cls = cn(
          'inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded font-medium',
          val.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600',
          canDownload && 'hover:bg-green-100 transition-colors cursor-pointer'
        )
        return canDownload ? (
          <a
            key={key}
            href={studioApi.getSessionHl7Url(sessionId, key)}
            target="_blank"
            rel="noopener noreferrer"
            className={cls}
            title={val.file}
          >
            {inner}
          </a>
        ) : (
          <span key={key} className={cls} title={val.file || ''}>
            {inner}
          </span>
        )
      })}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    started:   'bg-yellow-100 text-yellow-700',
    abandoned: 'bg-gray-100 text-gray-500',
    exported:  'bg-blue-100 text-blue-700',
  }
  const labels: Record<string, string> = {
    completed: 'Abgeschlossen',
    started:   'Läuft',
    abandoned: 'Abgebrochen',
    exported:  'Exportiert',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {labels[status] ?? status}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SessionList() {
  const [tenantId, setTenantId] = useState<string>('')

  useEffect(() => {
    tenantApi.list().then((tenants: { id: string }[]) => {
      if (tenants.length > 0) setTenantId(tenants[0].id)
    })
  }, [])

  const { data: sessions, isLoading, error } = useQuery<Session[]>({
    queryKey: ['sessions', tenantId],
    queryFn: () => studioApi.listSessions(tenantId),
    enabled: !!tenantId,
    refetchInterval: 30_000,
  })

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6">
        <ClipboardList className="w-6 h-6 text-alma-600" />
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Auswertungen</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Alle abgeschlossenen Sessions dieses Tenants — inkl. Export-Status und PDF-Download
          </p>
        </div>
      </div>

      {(isLoading || !tenantId) && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Lade Sessions…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Fehler beim Laden der Sessions.
        </div>
      )}

      {!isLoading && sessions && sessions.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Noch keine abgeschlossenen Sessions</p>
          <p className="text-sm text-gray-400 mt-1">
            Starte einen Assessment-Durchlauf über den Player-Link.
          </p>
        </div>
      )}

      {sessions && sessions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Encounter</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Assessment</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Datum</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Score</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Exporte</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sessions.map(s => {
                const hasPdf = !!(s.export_log._pdf as ExportEntry | undefined)?.path
                const pdfUrl = studioApi.getSessionPdfUrl(s.id)
                const scoreVal = s.score?.total_score
                return (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    {/* Encounter */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-800">{s.encounter_id}</span>
                      {s.patient_name && (
                        <div className="text-xs text-gray-400 mt-0.5">{s.patient_name}</div>
                      )}
                    </td>

                    {/* Assessment */}
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{s.assessment_abbreviation}</span>
                      <span className="text-xs text-gray-400 ml-1">v{s.assessment_version}</span>
                      <div className="text-xs text-gray-400 truncate max-w-[180px]">{s.assessment_name}</div>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {s.completed_at ? (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(s.completed_at).toLocaleString('de-DE', {
                            day: '2-digit', month: '2-digit', year: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      ) : '—'}
                    </td>

                    {/* Score */}
                    <td className="px-4 py-3">
                      {scoreVal !== null && scoreVal !== undefined ? (
                        <span className="font-bold text-alma-700">{scoreVal}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                      {s.score?.interpretation && (
                        <div className="text-xs text-gray-400 max-w-[120px] truncate" title={s.score.interpretation}>
                          {s.score.interpretation}
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>

                    {/* Exporters */}
                    <td className="px-4 py-3">
                      <ExporterBadges exportLog={s.export_log} sessionId={s.id} />
                    </td>

                    {/* PDF */}
                    <td className="px-4 py-3">
                      {hasPdf ? (
                        <a
                          href={pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-alma-600 hover:text-alma-800 font-medium"
                          title="PDF öffnen"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          PDF
                        </a>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            {sessions.length} Session{sessions.length !== 1 ? 's' : ''} · aktualisiert alle 30 s
          </div>
        </div>
      )}
    </div>
  )
}
