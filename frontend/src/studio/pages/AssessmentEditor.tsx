import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  Send, Loader2, UserCheck, RefreshCw, CheckCircle, XCircle,
  GitBranch, Rocket, EyeOff, Clock, AlertCircle, FileDown, Save,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { studioApi, assessmentApi, tenantApi } from '@/lib/api'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  pendingQuestions?: unknown[]
  applied?: boolean
}

interface Version {
  id: string
  version_number: number
  is_active: boolean
  changelog: string | null
  created_at: string
  question_count: number
}

interface AssessmentDetail {
  id: string
  name: string
  abbreviation: string
  status: string
  version_count: number
  active_version_number: number | null
  active_version_id: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractQuestions(text: string): unknown[] | null {
  try {
    const clean = text.trim()
      .replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/```$/, '').trim()
    const parsed = JSON.parse(clean)
    if (Array.isArray(parsed?.questions)) return parsed.questions
    if (Array.isArray(parsed)) return parsed
  } catch {}
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) {
    try {
      const parsed = JSON.parse(match[1].trim())
      if (Array.isArray(parsed?.questions)) return parsed.questions
      if (Array.isArray(parsed)) return parsed
    } catch {}
  }
  return null
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AssessmentEditor() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const [tenantId, setTenantId] = useState<string>('')
  const [previewKey, setPreviewKey] = useState(0)
  const [activeTab, setActiveTab] = useState<'chat' | 'versions' | 'exports'>('chat')
  const [publishLoading, setPublishLoading] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)

  // Export config state
  const [exportConfig, setExportConfig] = useState<Record<string, { enabled: boolean }>>({
    hl7_oru: { enabled: false },
    hl7_mdm: { enabled: false },
    fhir:    { enabled: false },
  })
  const [exportSaving, setExportSaving] = useState(false)
  const [exportSaved, setExportSaved] = useState(false)

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: 'Hallo! Beschreibe Verbesserungsvorschläge — z.B. "Tausche Item 1 und 2" oder "Füge eine Frage zur Schlafqualität hinzu". Ich zeige dir die Änderungen zur Bestätigung.',
  }])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Clone version state
  const [cloning, setCloning] = useState(false)
  const [cloneChangelog, setCloneChangelog] = useState('')
  const [showCloneForm, setShowCloneForm] = useState(false)

  useEffect(() => {
    tenantApi.list().then((tenants: { id: string }[]) => {
      if (tenants.length > 0) setTenantId(tenants[0].id)
    })
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // ── Data loading ──────────────────────────────────────────────────────────

  const { data: assessment, isLoading: assessmentLoading } = useQuery<AssessmentDetail>({
    queryKey: ['assessment', id],
    queryFn: () => assessmentApi.get(id!),
    enabled: !!id,
  })

  const { data: versions, isLoading: versionsLoading } = useQuery<Version[]>({
    queryKey: ['versions', id],
    queryFn: () => studioApi.listVersions(id!),
    enabled: !!id,
  })

  // Load export config when exports tab is opened
  useEffect(() => {
    if (activeTab === 'exports' && id) {
      studioApi.getExportConfig(id).then((cfg: Record<string, { enabled: boolean }>) => {
        setExportConfig(cfg)
      })
    }
  }, [activeTab, id])

  // ── Publish / Unpublish ───────────────────────────────────────────────────

  const togglePublish = async () => {
    if (!id || !assessment || publishLoading) return
    setPublishError(null)
    setPublishLoading(true)
    try {
      if (assessment.status === 'published') {
        await assessmentApi.unpublish(id)
      } else {
        await assessmentApi.publish(id)
      }
      await queryClient.invalidateQueries({ queryKey: ['assessment', id] })
      await queryClient.invalidateQueries({ queryKey: ['versions', id] })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setPublishError(msg || 'Fehler beim Statuswechsel.')
    } finally {
      setPublishLoading(false)
    }
  }

  // ── Clone active version ──────────────────────────────────────────────────

  const cloneActiveVersion = async () => {
    if (!id || !assessment?.active_version_id || cloning) return
    setCloning(true)
    try {
      const questions = await studioApi.getVersionQuestions(id, assessment.active_version_id)
      const { version_id } = await studioApi.createVersion(id, {
        questions,
        changelog: cloneChangelog || `Kopie von v${assessment.active_version_number}`,
      })
      await studioApi.activateVersion(id, version_id)
      await queryClient.invalidateQueries({ queryKey: ['assessment', id] })
      await queryClient.invalidateQueries({ queryKey: ['versions', id] })
      setShowCloneForm(false)
      setCloneChangelog('')
      setPreviewKey(k => k + 1)
    } catch {
      setPublishError('Fehler beim Erstellen der neuen Version.')
    } finally {
      setCloning(false)
    }
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  const sendMessage = async () => {
    if (!input.trim() || chatLoading) return
    const userMsg = input.trim()
    setInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setChatLoading(true)
    try {
      const result = await studioApi.chat(userMsg, { assessment_id: id })
      const questions = extractQuestions(result.reply)
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: questions
          ? `Ich habe folgende Änderungen vorbereitet. Möchtest du sie übernehmen?\n\n${result.reply}`
          : result.reply,
        pendingQuestions: questions ?? undefined,
      }])
    } catch {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Fehler bei der Verbindung zur KI. Bitte erneut versuchen.',
      }])
    } finally {
      setChatLoading(false)
    }
  }

  const applyUpdate = async (msgIndex: number, questions: unknown[]) => {
    if (!id || applying) return
    setApplying(true)
    try {
      const { version_id } = await studioApi.createVersion(id, {
        questions,
        changelog: 'KI-Änderung via Chat',
      })
      await studioApi.activateVersion(id, version_id)
      setChatMessages(prev => prev.map((m, i) =>
        i === msgIndex ? { ...m, pendingQuestions: undefined, applied: true } : m
      ))
      await queryClient.invalidateQueries({ queryKey: ['assessment', id] })
      await queryClient.invalidateQueries({ queryKey: ['versions', id] })
      setPreviewKey(k => k + 1)
    } catch {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Fehler beim Speichern der Änderungen.',
      }])
    } finally {
      setApplying(false)
    }
  }

  const dismissUpdate = (msgIndex: number) => {
    setChatMessages(prev => prev.map((m, i) =>
      i === msgIndex ? { ...m, pendingQuestions: undefined } : m
    ))
  }

  const saveExportConfig = async () => {
    if (!id || exportSaving) return
    setExportSaving(true)
    setExportSaved(false)
    try {
      await studioApi.saveExportConfig(id, exportConfig)
      setExportSaved(true)
      setTimeout(() => setExportSaved(false), 2500)
    } finally {
      setExportSaving(false)
    }
  }

  const toggleExporter = (key: string) => {
    setExportConfig(prev => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key]?.enabled },
    }))
    setExportSaved(false)
  }

  const playerUrl = tenantId && id
    ? `/player/run/${id}?encounter_id=PREVIEW-${previewKey}&tenant_id=${tenantId}`
    : null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── Top info bar ── */}
      <div className="flex items-center gap-4 px-6 py-3 bg-white border-b border-gray-200 shrink-0">
        {/* Assessment name + meta */}
        <div className="flex-1 min-w-0">
          {assessmentLoading ? (
            <div className="h-5 w-48 bg-gray-100 rounded animate-pulse" />
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-semibold text-gray-900 truncate">{assessment?.name}</span>
              <span className="font-mono text-xs text-gray-400">{assessment?.abbreviation}</span>
              <StatusBadge status={assessment?.status ?? ''} />
              {assessment?.active_version_number != null && (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <GitBranch className="w-3 h-3" />
                  Aktiv: v{assessment.active_version_number}
                </span>
              )}
              {assessment?.version_count != null && (
                <span className="text-xs text-gray-400">
                  {assessment.version_count} Version{assessment.version_count !== 1 ? 'en' : ''}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Publish button */}
        {assessment && (
          <button
            onClick={togglePublish}
            disabled={publishLoading}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50',
              assessment.status === 'published'
                ? 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600'
                : 'bg-green-50 text-green-700 hover:bg-green-100'
            )}
          >
            {publishLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : assessment.status === 'published' ? (
              <EyeOff className="w-3.5 h-3.5" />
            ) : (
              <Rocket className="w-3.5 h-3.5" />
            )}
            {assessment.status === 'published' ? 'Deaktivieren' : 'Veröffentlichen'}
          </button>
        )}
      </div>

      {/* Publish error */}
      {publishError && (
        <div className="flex items-center gap-2 px-6 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {publishError}
          <button onClick={() => setPublishError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* ── Human-in-the-loop hint ── */}
      <div className="flex items-center gap-3 px-6 py-2 bg-amber-50 border-b border-amber-200 shrink-0">
        <UserCheck className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="text-xs text-amber-700">
          Prüfe das Assessment in der Vorschau und schreibe Verbesserungsvorschläge in den Chat.
          KI-Änderungen werden immer als neue Version gespeichert.
        </span>
      </div>

      {/* ── Main split ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: Player preview */}
        <div className="flex-1 flex flex-col border-r border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50 shrink-0">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Vorschau</span>
            <button
              onClick={() => setPreviewKey(k => k + 1)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Neu starten
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {playerUrl ? (
              <iframe
                key={previewKey}
                src={playerUrl}
                className="w-full h-full border-0"
                title="Assessment Vorschau"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
              </div>
            )}
          </div>
        </div>

        {/* Right: Tabs (Chat | Versionen) */}
        <div className="w-96 flex flex-col bg-white shrink-0">

          {/* Tab bar */}
          <div className="flex border-b border-gray-200 shrink-0">
            {(['chat', 'versions', 'exports'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'flex-1 py-2.5 text-xs font-medium transition-colors',
                  activeTab === tab
                    ? 'border-b-2 border-alma-500 text-alma-600'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {tab === 'chat' ? 'KI-Assistent' : tab === 'versions' ? 'Versionen' : 'Exporte'}
              </button>
            ))}
          </div>

          {/* ── Chat tab ── */}
          {activeTab === 'chat' && (
            <>
              <div className="flex-1 overflow-auto p-4 space-y-4">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={cn(
                      'max-w-[85%] px-3 py-2 rounded-xl text-sm',
                      msg.role === 'user' ? 'bg-alma-500 text-white' : 'bg-gray-100 text-gray-800'
                    )}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>

                    {msg.pendingQuestions && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => applyUpdate(i, msg.pendingQuestions!)}
                          disabled={applying}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600 disabled:opacity-50"
                        >
                          {applying ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                          Übernehmen
                        </button>
                        <button
                          onClick={() => dismissUpdate(i)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-gray-50"
                        >
                          <XCircle className="w-3 h-3" />
                          Verwerfen
                        </button>
                      </div>
                    )}

                    {msg.applied && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-green-600">
                        <CheckCircle className="w-3 h-3" />
                        Neue Version angelegt und aktiviert
                      </div>
                    )}
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 px-3 py-2 rounded-xl">
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 border-t border-gray-200 flex gap-2 shrink-0">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="Verbesserungsvorschlag eingeben..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-alma-300"
                />
                <button
                  onClick={sendMessage}
                  disabled={chatLoading || !input.trim()}
                  className="p-2 bg-alma-500 text-white rounded-lg hover:bg-alma-600 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {/* ── Exports tab ── */}
          {activeTab === 'exports' && (
            <div className="flex-1 overflow-auto p-4 space-y-3">
              <p className="text-xs text-gray-500 leading-relaxed">
                Konfiguriere, welche Exporte nach jeder abgeschlossenen Session automatisch
                ausgeführt werden. HL7-Dateien werden in{' '}
                <code className="bg-gray-100 px-1 rounded text-gray-700">/app/exports/</code>{' '}
                abgelegt und können per Cron-Job ins KIS importiert werden.
              </p>

              <ExporterCard
                label="HL7 ORU^R01"
                description="Numerische Befunde (Scores, Subscores) als Observation-Nachricht — ideal für Orbis-Labor-Import."
                badge="Datei-Export (.hl7)"
                badgeColor="text-blue-700 bg-blue-50"
                enabled={exportConfig.hl7_oru?.enabled ?? false}
                onToggle={() => toggleExporter('hl7_oru')}
              />

              <ExporterCard
                label="HL7 MDM^T02"
                description="Formatiertes Ergebnisdokument (Base64) ins Patientenarchiv — für Dokumentenmanagement-Systeme."
                badge="Datei-Export (.hl7)"
                badgeColor="text-blue-700 bg-blue-50"
                enabled={exportConfig.hl7_mdm?.enabled ?? false}
                onToggle={() => toggleExporter('hl7_mdm')}
              />

              <ExporterCard
                label="FHIR R4"
                description="QuestionnaireResponse + Observation als FHIR-Bundle — wird im API-Response zurückgegeben."
                badge="In Vorbereitung"
                badgeColor="text-gray-500 bg-gray-100"
                enabled={false}
                disabled
                onToggle={() => {}}
              />

              <button
                onClick={saveExportConfig}
                disabled={exportSaving}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  exportSaved
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-alma-500 text-white hover:bg-alma-600 disabled:opacity-50'
                )}
              >
                {exportSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : exportSaved ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {exportSaved ? 'Gespeichert' : 'Konfiguration speichern'}
              </button>
            </div>
          )}

          {/* ── Versions tab ── */}
          {activeTab === 'versions' && (
            <div className="flex-1 overflow-auto p-4 space-y-3">

              {/* Clone button */}
              {assessment?.active_version_id && (
                <div>
                  {!showCloneForm ? (
                    <button
                      onClick={() => setShowCloneForm(true)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-alma-500 text-white rounded-lg text-sm font-medium hover:bg-alma-600 transition-colors"
                    >
                      <GitBranch className="w-4 h-4" />
                      Neue Version anlegen
                    </button>
                  ) : (
                    <div className="bg-alma-50 border border-alma-200 rounded-xl p-4 space-y-3">
                      <p className="text-sm font-medium text-alma-800">
                        Neue Version aus v{assessment.active_version_number}
                      </p>
                      <p className="text-xs text-alma-600">
                        Alle Fragen werden kopiert. Die neue Version wird sofort aktiv —
                        neue Player-Sessions nutzen sie ab jetzt.
                      </p>
                      <input
                        type="text"
                        value={cloneChangelog}
                        onChange={e => setCloneChangelog(e.target.value)}
                        placeholder={`Changelog (z.B. "Item 3 präzisiert")`}
                        className="w-full px-3 py-2 border border-alma-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-alma-300 bg-white"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={cloneActiveVersion}
                          disabled={cloning}
                          className="flex items-center gap-1.5 px-4 py-2 bg-alma-500 text-white rounded-lg text-sm font-medium hover:bg-alma-600 disabled:opacity-50"
                        >
                          {cloning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          Anlegen & aktivieren
                        </button>
                        <button
                          onClick={() => { setShowCloneForm(false); setCloneChangelog('') }}
                          className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Version list */}
              {versionsLoading && (
                <div className="text-xs text-gray-400 text-center py-4">Lade Versionen…</div>
              )}

              {!versionsLoading && (!versions || versions.length === 0) && (
                <div className="text-xs text-gray-400 text-center py-4">
                  Noch keine Versionen. Erstelle eine via KI-Chat oder PDF-Upload.
                </div>
              )}

              {versions?.map((v: Version) => (
                <div
                  key={v.id}
                  className={cn(
                    'rounded-xl border p-3 text-sm',
                    v.is_active
                      ? 'border-alma-300 bg-alma-50'
                      : 'border-gray-200 bg-white'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-900">
                      Version {v.version_number}
                    </span>
                    {v.is_active ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-alma-100 text-alma-700 font-medium">
                        Aktiv
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        Inaktiv
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{v.question_count} Fragen</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(v.created_at).toLocaleDateString('de-DE', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                      })}
                    </span>
                  </div>
                  {v.changelog && (
                    <p className="mt-1 text-xs text-gray-500 italic">{v.changelog}</p>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function ExporterCard({
  label, description, badge, badgeColor, enabled, disabled, onToggle,
}: {
  label: string
  description: string
  badge: string
  badgeColor: string
  enabled: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <div className={cn(
      'rounded-xl border p-4 transition-colors',
      disabled ? 'bg-gray-50 border-gray-200 opacity-60' : enabled ? 'border-alma-200 bg-alma-50' : 'border-gray-200 bg-white',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <FileDown className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="font-medium text-sm text-gray-900">{label}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${badgeColor}`}>{badge}</span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
        </div>
        {/* Toggle */}
        <button
          onClick={onToggle}
          disabled={disabled}
          className={cn(
            'shrink-0 w-10 h-6 rounded-full transition-colors relative',
            disabled ? 'cursor-not-allowed bg-gray-200' : enabled ? 'bg-alma-500' : 'bg-gray-300 hover:bg-gray-400',
          )}
          title={enabled ? 'Deaktivieren' : 'Aktivieren'}
        >
          <span className={cn(
            'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform',
            enabled ? 'translate-x-5' : 'translate-x-1',
          )} />
        </button>
      </div>
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
