import { useEffect, useState } from 'react'
import { FileText, Play, Database, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { assessmentApi, tenantApi, studioApi } from '@/lib/api'

const QUICK_ACTIONS = [
  {
    title: 'PDF hochladen',
    description: 'Assessment aus PDF per KI extrahieren',
    href: '/studio/assessments/new',
    icon: '📄',
  },
  {
    title: 'Assessments bearbeiten',
    description: 'Vorhandene Bögen anpassen und versionieren',
    href: '/studio/assessments',
    icon: '✏️',
  },
]

export default function Dashboard() {
  const [tenantId, setTenantId] = useState<string>('')
  const [tenantCount, setTenantCount] = useState(0)
  const [assessmentCount, setAssessmentCount] = useState<number | null>(null)
  const [activeVersions, setActiveVersions] = useState<number | null>(null)
  const [sessionsToday, setSessionsToday] = useState<number | null>(null)

  useEffect(() => {
    tenantApi.list().then((tenants: { id: string }[]) => {
      setTenantCount(tenants.length)
      if (tenants.length > 0) {
        const tid = tenants[0].id
        setTenantId(tid)
        assessmentApi.list(tid).then((list: unknown[]) => setAssessmentCount(list.length))
        studioApi.getStats(tid).then((s: { active_versions: number; sessions_today: number }) => {
          setActiveVersions(s.active_versions)
          setSessionsToday(s.sessions_today)
        })
      }
    })
  }, [])

  const fmt = (v: number | null) => v !== null ? String(v) : '—'

  const stats = [
    { label: 'Assessments', value: fmt(assessmentCount), icon: FileText, color: 'text-blue-600 bg-blue-50' },
    { label: 'Aktive Versionen', value: fmt(activeVersions), icon: Zap, color: 'text-green-600 bg-green-50' },
    { label: 'Sessions heute', value: fmt(sessionsToday), icon: Play, color: 'text-purple-600 bg-purple-50' },
    { label: 'Tenants', value: tenantCount > 0 ? String(tenantCount) : '—', icon: Database, color: 'text-orange-600 bg-orange-50' },
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Willkommen im ALMA Studio — Ihr Maschinenraum für psychiatrische Assessments.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-500">{label}</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Schnellzugriff
      </h2>
      <div className="grid grid-cols-2 gap-4 mb-8">
        {QUICK_ACTIONS.map(({ title, description, href, icon }) => (
          <Link
            key={href}
            to={href}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:border-alma-300 hover:shadow-sm transition-all group"
          >
            <div className="text-2xl mb-3">{icon}</div>
            <h3 className="font-medium text-gray-900 group-hover:text-alma-700">{title}</h3>
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          </Link>
        ))}
      </div>

      {/* Recent assessments */}
      {assessmentCount !== null && assessmentCount > 0 && tenantId && (
        <RecentAssessments tenantId={tenantId} />
      )}
    </div>
  )
}

function RecentAssessments({ tenantId }: { tenantId: string }) {
  const [assessments, setAssessments] = useState<{ id: string; name: string; abbreviation: string; status: string }[]>([])

  useEffect(() => {
    assessmentApi.list(tenantId).then(setAssessments)
  }, [tenantId])

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="font-semibold text-gray-900 mb-4">Zuletzt erstellt</h2>
      <div className="space-y-2">
        {assessments.slice(0, 5).map(a => (
          <Link
            key={a.id}
            to={`/studio/assessments/${a.id}/edit`}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group"
          >
            <div className="w-8 h-8 bg-alma-50 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-alma-600 font-bold text-xs">{a.abbreviation?.slice(0, 3)}</span>
            </div>
            <span className="text-sm text-gray-800 flex-1 group-hover:text-alma-700">{a.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              a.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
            }`}>{a.status}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
