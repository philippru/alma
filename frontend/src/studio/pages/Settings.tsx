import { useState } from 'react'
import { CheckCircle, XCircle, Loader2, KeyRound } from 'lucide-react'
import { studioApi } from '@/lib/api'

type ValidationResult = {
  valid: boolean
  provider: string
  detail?: string
} | null

export default function Settings() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ValidationResult>(null)

  const handleValidate = async () => {
    setLoading(true)
    setResult(null)
    try {
      const data = await studioApi.validateApiKey()
      setResult(data)
    } catch {
      setResult({ valid: false, provider: 'anthropic', detail: 'Request failed' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Einstellungen</h1>
        <p className="mt-1 text-sm text-gray-500">
          API-Schlüssel und Systemkonfiguration prüfen.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <KeyRound className="w-5 h-5 text-gray-500" />
          <h2 className="text-base font-medium text-gray-900">Anthropic API-Schlüssel</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Überprüft, ob der konfigurierte Anthropic-Schlüssel gültig ist und Anfragen akzeptiert werden.
        </p>

        <button
          onClick={handleValidate}
          disabled={loading}
          className="px-4 py-2 bg-alma-500 text-white rounded-lg text-sm font-medium hover:bg-alma-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Schlüssel validieren
        </button>

        {result && (
          <div className={`mt-4 flex items-start gap-3 rounded-lg p-4 ${result.valid ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {result.valid
              ? <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
              : <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
            }
            <div>
              <p className="text-sm font-medium">
                {result.valid ? 'API-Schlüssel ist gültig.' : 'API-Schlüssel ungültig oder nicht konfiguriert.'}
              </p>
              {result.detail && (
                <p className="text-xs mt-1 opacity-80">{result.detail}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
