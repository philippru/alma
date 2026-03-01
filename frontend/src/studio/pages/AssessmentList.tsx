import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Plus, FileText, ChevronRight, ChevronDown,
  Rocket, EyeOff, Loader2, AlertCircle, GitBranch, Clock, Edit2, Trash2,
} from 'lucide-react'
import { assessmentApi, studioApi, tenantApi } from '@/lib/api'
import { cn } from '@/lib/utils'

type Assessment = {
  id: string
  abbreviation: string
  name: string
  status: string
  scoring_logic: string
  version_count: number
  active_version_number: number | null
}

type Version = {
  id: string
  version_number: number
  is_active: boolean
  changelog: string | null
  created_at: string
  question_count: number
}

// ── Row with expandable version history ───────────────────────────────────────

function AssessmentRow({
  a,
  publishing,
  deleting,
  onTogglePublish,
  onDelete,
}: {
  a: Assessment
  publishing: string | null
  deleting: string | null
  onTogglePublish: (e: React.MouseEvent, a: Assessment) => void
  onDelete: (e: React.MouseEvent, a: Assessment) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: versions, isLoading: versionsLoading } = useQuery<Version[]>({
    queryKey: ['versions', a.id],
    queryFn: () => studioApi.listVersions(a.id),
    enabled: expanded,
    staleTime: 30_000,
  })

  return (
    <div className={cn(
      'bg-white rounded-xl border transition-all',
      expanded ? 'border-alma-200 shadow-sm' : 'border-gray-200'
    )}>
      {/* Main row */}
      <div className="flex items-center gap-3 p-4">

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-gray-300 hover:text-gray-600 transition-colors shrink-0"
          title="Versionshistorie anzeigen"
        >
          {expanded
            ? <ChevronDown className="w-4 h-4" />
            : <ChevronRight className="w-4 h-4" />
          }
        </button>

        {/* Icon */}
        <div className="w-9 h-9 bg-alma-50 rounded-lg flex items-center justify-center shrink-0">
          <span className="text-alma-600 font-bold text-xs">{a.abbreviation?.slice(0, 3) || '?'}</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{a.name}</p>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-gray-400">{a.abbreviation}</span>
            {a.scoring_logic && (
              <span className="text-xs text-gray-400">Scoring: {a.scoring_logic}</span>
            )}
            {/* Active version pill */}
            {a.active_version_number != null ? (
              <span className="flex items-center gap-1 text-xs text-alma-600 bg-alma-50 px-1.5 py-0.5 rounded">
                <GitBranch className="w-3 h-3" />
                v{a.active_version_number} aktiv
              </span>
            ) : (
              <span className="text-xs text-gray-300 italic">keine aktive Version</span>
            )}
            {a.version_count > 0 && (
              <span className="text-xs text-gray-400">
                {a.version_count} Version{a.version_count !== 1 ? 'en' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Status badge */}
        <StatusBadge status={a.status} />

        {/* Publish / Unpublish */}
        <button
          onClick={(e) => onTogglePublish(e, a)}
          disabled={!!publishing}
          title={a.status === 'published' ? 'Zurück auf Entwurf' : 'Veröffentlichen'}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 shrink-0',
            a.status === 'published'
              ? 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600'
              : 'bg-green-50 text-green-700 hover:bg-green-100'
          )}
        >
          {publishing === a.id ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : a.status === 'published' ? (
            <EyeOff className="w-3.5 h-3.5" />
          ) : (
            <Rocket className="w-3.5 h-3.5" />
          )}
          {a.status === 'published' ? 'Deaktivieren' : 'Veröffentlichen'}
        </button>

        {/* Edit link */}
        <Link
          to={`/studio/assessments/${a.id}/edit`}
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-alma-50 text-alma-700 hover:bg-alma-100 transition-colors shrink-0"
        >
          <Edit2 className="w-3.5 h-3.5" />
          Bearbeiten
        </Link>

        {/* Delete — two-step confirm */}
        {confirmDelete ? (
          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            <button
              onClick={(e) => { setConfirmDelete(false); onDelete(e, a) }}
              disabled={!!deleting}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deleting === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Wirklich löschen
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(false) }}
              className="px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Abbrechen
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
            disabled={!!deleting}
            title="Assessment löschen"
            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Expanded version history */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Versionshistorie
          </p>

          {versionsLoading && (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Lade Versionen…
            </div>
          )}

          {!versionsLoading && (!versions || versions.length === 0) && (
            <p className="text-xs text-gray-400 italic">Noch keine Versionen vorhanden.</p>
          )}

          {versions && versions.length > 0 && (
            <div className="space-y-2">
              {versions.map((v: Version) => (
                <div
                  key={v.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-xs',
                    v.is_active
                      ? 'bg-alma-50 border border-alma-200'
                      : 'bg-gray-50 border border-gray-100'
                  )}
                >
                  {/* Version number */}
                  <span className={cn(
                    'font-bold w-8 shrink-0',
                    v.is_active ? 'text-alma-600' : 'text-gray-400'
                  )}>
                    v{v.version_number}
                  </span>

                  {/* Active badge */}
                  {v.is_active && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-alma-100 text-alma-700 font-medium">
                      Aktiv
                    </span>
                  )}

                  {/* Changelog */}
                  <span className={cn(
                    'flex-1 truncate',
                    v.changelog ? 'text-gray-600' : 'text-gray-300 italic'
                  )}>
                    {v.changelog || 'Kein Changelog'}
                  </span>

                  {/* Question count */}
                  <span className="text-gray-400 shrink-0">
                    {v.question_count} Fragen
                  </span>

                  {/* Date */}
                  <span className="flex items-center gap-1 text-gray-400 shrink-0">
                    <Clock className="w-3 h-3" />
                    {new Date(v.created_at).toLocaleDateString('de-DE', {
                      day: '2-digit', month: '2-digit', year: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AssessmentList() {
  const [tenantId, setTenantId] = useState<string>('')
  const [publishing, setPublishing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    tenantApi.list().then((tenants: { id: string }[]) => {
      if (tenants.length > 0) setTenantId(tenants[0].id)
    })
  }, [])

  const { data: assessments, isLoading } = useQuery({
    queryKey: ['assessments', tenantId],
    queryFn: () => assessmentApi.list(tenantId),
    enabled: !!tenantId,
  })

  const handleDelete = async (e: React.MouseEvent, a: Assessment) => {
    e.preventDefault()
    e.stopPropagation()
    if (deleting) return
    setError(null)
    setDeleting(a.id)
    try {
      await assessmentApi.delete(a.id)
      await queryClient.invalidateQueries({ queryKey: ['assessments', tenantId] })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Fehler beim Löschen.')
    } finally {
      setDeleting(null)
    }
  }

  const togglePublish = async (e: React.MouseEvent, a: Assessment) => {
    e.preventDefault()
    e.stopPropagation()
    if (publishing) return
    setError(null)
    setPublishing(a.id)
    try {
      if (a.status === 'published') {
        await assessmentApi.unpublish(a.id)
      } else {
        await assessmentApi.publish(a.id)
      }
      await queryClient.invalidateQueries({ queryKey: ['assessments', tenantId] })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Fehler beim Statuswechsel.')
    } finally {
      setPublishing(null)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Assessments</h1>
          <p className="mt-1 text-sm text-gray-500">Alle Assessments dieses Tenants</p>
        </div>
        <Link
          to="/studio/assessments/new"
          className="flex items-center gap-2 px-4 py-2 bg-alma-500 text-white rounded-lg text-sm font-medium hover:bg-alma-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Neu erstellen
        </Link>
      </div>

      {error && (
        <div className="flex items-center gap-2 mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {(isLoading || !tenantId) && (
        <div className="text-sm text-gray-400">Lade Assessments...</div>
      )}

      {!isLoading && tenantId && (!assessments || assessments.length === 0) && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Noch keine Assessments</p>
          <p className="text-sm text-gray-400 mt-1">
            Lade ein PDF hoch oder erstelle ein Assessment manuell.
          </p>
          <Link
            to="/studio/assessments/new"
            className="inline-block mt-4 px-4 py-2 bg-alma-500 text-white rounded-lg text-sm font-medium hover:bg-alma-600"
          >
            Erstes Assessment erstellen
          </Link>
        </div>
      )}

      {assessments && assessments.length > 0 && (
        <div className="space-y-2">
          {assessments.map((a: Assessment) => (
            <AssessmentRow
              key={a.id}
              a={a}
              publishing={publishing}
              deleting={deleting}
              onTogglePublish={togglePublish}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    published: 'bg-green-100 text-green-700',
    draft:     'bg-yellow-100 text-yellow-700',
    archived:  'bg-gray-100 text-gray-500',
  }
  const labels: Record<string, string> = {
    published: 'Aktiv',
    draft:     'Entwurf',
    archived:  'Archiviert',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {labels[status] ?? status}
    </span>
  )
}
