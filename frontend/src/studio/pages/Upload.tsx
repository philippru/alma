import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import { Upload, Link, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { studioApi, assessmentApi, tenantApi } from '@/lib/api'
import { cn } from '@/lib/utils'

type ParsedDraft = Record<string, unknown>

export default function UploadPage() {
  const [mode, setMode] = useState<'pdf' | 'url'>('pdf')
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState<ParsedDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [descInput, setDescInput] = useState('')

  const [tenantId, setTenantId] = useState<string>('')
  const navigate = useNavigate()

  useEffect(() => {
    tenantApi.list().then((tenants: { id: string }[]) => {
      if (tenants.length > 0) setTenantId(tenants[0].id)
    })
  }, [])

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    setLoading(true)
    setError(null)
    setDraft(null)
    try {
      const result = await studioApi.uploadPdf(file, tenantId)
      setDraft(result.parsed_draft)
    } catch (e: unknown) {
      setError('PDF-Analyse fehlgeschlagen. Bitte erneut versuchen.')
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  const handleUrlParse = async () => {
    if (!urlInput && !descInput) return
    setLoading(true)
    setError(null)
    setDraft(null)
    try {
      const result = await studioApi.parseUrl(urlInput, descInput)
      setDraft(result.parsed_draft)
    } catch (e: unknown) {
      setError('URL-Analyse fehlgeschlagen.')
    } finally {
      setLoading(false)
    }
  }

  const { getRootProps, getInputProps, isDragActive, open: openFilePicker } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    disabled: loading,
    noClick: true,
  })

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Neues Assessment erstellen</h1>
        <p className="mt-1 text-sm text-gray-500">
          Lade ein PDF hoch oder gib eine URL an — Claude extrahiert die Struktur automatisch.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setMode('pdf'); openFilePicker() }}
          disabled={loading}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            mode === 'pdf'
              ? 'bg-alma-500 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          )}
        >
          📄 PDF hochladen
        </button>
        <button
          onClick={() => setMode('url')}
          disabled={loading}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            mode === 'url'
              ? 'bg-alma-500 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          )}
        >
          🔗 URL / Beschreibung
        </button>
      </div>

      {/* PDF dropzone */}
      {mode === 'pdf' && (
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-xl p-12 text-center transition-colors',
            isDragActive
              ? 'border-alma-400 bg-alma-50'
              : 'border-gray-300 bg-white',
            loading && 'opacity-50'
          )}
        >
          <input {...getInputProps()} />
          <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">
            {isDragActive ? 'PDF hier ablegen...' : 'PDF hierher ziehen'}
          </p>
          <p className="text-sm text-gray-400 mt-1 mb-4">Max. 20 MB</p>
          <button
            type="button"
            onClick={openFilePicker}
            disabled={loading}
            className="px-4 py-2 bg-alma-500 text-white rounded-lg text-sm font-medium hover:bg-alma-600 disabled:opacity-50"
          >
            Datei auswählen
          </button>
        </div>
      )}

      {/* URL input */}
      {mode === 'url' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL (optional)
            </label>
            <input
              type="url"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="https://example.com/honos-assessment"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-alma-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Beschreibung / Anweisungen an die KI
            </label>
            <textarea
              value={descInput}
              onChange={e => setDescInput(e.target.value)}
              rows={4}
              placeholder="z.B. 'HoNOS — 12 Items, Skala 0–4, Item 9 wird nicht gewertet...'"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-alma-300"
            />
          </div>
          <button
            onClick={handleUrlParse}
            disabled={loading || (!urlInput && !descInput)}
            className="px-4 py-2 bg-alma-500 text-white rounded-lg text-sm font-medium hover:bg-alma-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <Link className="w-4 h-4" />
            Analysieren
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="mt-6 flex items-center gap-3 text-alma-600">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Claude analysiert das Assessment...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-6 flex items-center gap-2 text-red-600 bg-red-50 rounded-lg p-4">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Draft preview */}
      {draft && !draft.parse_error && (
        <div className="mt-6 bg-white rounded-xl border border-green-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="font-medium text-gray-900">KI-Entwurf erstellt — bitte prüfen</span>
          </div>
          <pre className="text-xs bg-gray-50 rounded-lg p-4 overflow-auto max-h-96">
            {JSON.stringify(draft, null, 2)}
          </pre>
          <div className="mt-4 flex gap-3">
            <button
              onClick={async () => {
                setLoading(true)
                setError(null)
                try {
                  const { id } = await assessmentApi.create({
                    tenant_id: tenantId,
                    name: draft.name as string || 'Neues Assessment',
                    abbreviation: draft.abbreviation as string || 'NEU',
                    description: draft.description as string,
                    scoring_logic: draft.scoring_logic as string,
                  })
                  const { version_id } = await studioApi.createVersion(id, {
                    questions: draft.questions,
                    changelog: 'KI-Import',
                  })
                  await studioApi.activateVersion(id, version_id)
                  navigate(`/assessments/${id}/edit`)
                } catch {
                  setError('Fehler beim Speichern. Bitte erneut versuchen.')
                } finally {
                  setLoading(false)
                }
              }}
              disabled={loading}
              className="px-4 py-2 bg-alma-500 text-white rounded-lg text-sm font-medium hover:bg-alma-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Im Editor öffnen →
            </button>
            <button
              onClick={() => setDraft(null)}
              className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
            >
              Erneut analysieren
            </button>
          </div>
        </div>
      )}

      {draft?.parse_error && (
        <div className="mt-6 bg-amber-50 rounded-xl border border-amber-200 p-6">
          <p className="text-sm font-medium text-amber-800 mb-2">KI-Antwort konnte nicht geparst werden:</p>
          <pre className="text-xs overflow-auto max-h-64">{draft.raw_response as string}</pre>
        </div>
      )}
    </div>
  )
}
