import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ChevronRight, ChevronLeft, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { playerApi } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Question {
  id: string
  key: string
  position: number
  text: string
  help_text?: string
  type: string
  is_required: boolean
  skip_value?: number
  meta: Record<string, unknown>
  options: Array<{ id: string; label: string; value: string; score?: number; position: number }>
}

interface Session {
  session_id: string
  assessment: { name: string; abbreviation: string; version: number }
  questions: Question[]
}

type Answers = Record<string, string>

export default function AssessmentPlayer() {
  const { assessmentId } = useParams<{ assessmentId: string }>()
  const [searchParams] = useSearchParams()
  const encounterId = searchParams.get('encounter_id') || ''
  const tenantId = searchParams.get('tenant_id') || ''
  const patientId = searchParams.get('patient_id') || undefined
  const patientName = searchParams.get('patient_name') || undefined
  const patientDob = searchParams.get('patient_dob') || undefined

  const [session, setSession] = useState<Session | null>(null)
  const [answers, setAnswers] = useState<Answers>({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [status, setStatus] = useState<'loading' | 'active' | 'submitting' | 'done' | 'error'>('loading')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Initialize session
  useEffect(() => {
    if (!assessmentId || !encounterId || !tenantId) {
      setError('Fehlende URL-Parameter: assessment_id, encounter_id und tenant_id sind erforderlich.')
      setStatus('error')
      return
    }
    playerApi.initSession({
      assessment_id: assessmentId,
      encounter_id: encounterId,
      tenant_id: tenantId,
      patient_id: patientId,
      patient_name: patientName,
      patient_dob: patientDob,
    })
      .then(s => { setSession(s); setStatus('active') })
      .catch(() => {
        setError('Assessment konnte nicht geladen werden.')
        setStatus('error')
      })
  }, [assessmentId])

  const questions = session?.questions || []
  const current = questions[currentIndex]
  const progress = questions.length ? ((currentIndex) / questions.length) * 100 : 0
  const isLast = currentIndex === questions.length - 1

  const setAnswer = (key: string, value: string) => {
    setAnswers(prev => ({ ...prev, [key]: value }))
  }

  const goNext = async () => {
    if (isLast) {
      await submit()
    } else {
      setCurrentIndex(i => i + 1)
    }
  }

  const submit = async () => {
    if (!session) return
    setStatus('submitting')
    try {
      // Save all responses
      const responsePayload = Object.entries(answers).map(([key, value]) => {
        const q = questions.find(q => q.key === key)!
        return { question_id: q.id, question_key: key, value }
      })
      await playerApi.saveResponses(session.session_id, responsePayload)

      // Complete and score
      const completionResult = await playerApi.complete(session.session_id, ['fhir', 'hl7_oru'])
      setResult(completionResult)
      setStatus('done')
    } catch {
      setError('Fehler beim Speichern der Antworten.')
      setStatus('error')
    }
  }

  // ── Render states ─────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <PlayerShell>
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-alma-500" />
          <p className="text-sm text-gray-500">Lade Assessment...</p>
        </div>
      </PlayerShell>
    )
  }

  if (status === 'error') {
    return (
      <PlayerShell>
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-red-600">
          <AlertCircle className="w-8 h-8" />
          <p className="text-sm text-center">{error}</p>
        </div>
      </PlayerShell>
    )
  }

  if (status === 'done' && result) {
    const score = result.score as Record<string, unknown>
    return (
      <PlayerShell>
        <div className="text-center py-8">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Assessment abgeschlossen</h2>
          <p className="text-sm text-gray-500 mb-6">
            {session?.assessment.name} (v{session?.assessment.version})
          </p>
          <div className="bg-gray-50 rounded-xl p-6 text-left max-w-sm mx-auto">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-gray-500">Gesamtscore</span>
              <span className="text-2xl font-bold text-alma-600">
                {String(score.total_score)}
              </span>
            </div>
            <p className="text-sm text-gray-700 font-medium">{String(score.interpretation)}</p>
            {Array.isArray(score.skipped_items) && score.skipped_items.length > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                Übersprungen (Code 9): {(score.skipped_items as string[]).join(', ')}
              </p>
            )}
          </div>
        </div>
      </PlayerShell>
    )
  }

  if (status === 'submitting') {
    return (
      <PlayerShell>
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-alma-500" />
          <p className="text-sm text-gray-500">Wird ausgewertet...</p>
        </div>
      </PlayerShell>
    )
  }

  if (!current) return null

  const isSection = current.type === 'section'
  const isAnswered = answers[current.key] !== undefined && answers[current.key] !== ''
  const canProceed = isSection || !current.is_required || isAnswered

  return (
    <PlayerShell>
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex justify-between text-xs text-gray-400 mb-1.5">
          <span>{session?.assessment.name}</span>
          <span>{currentIndex + 1} / {questions.length}</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-alma-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question — sections get a distinct layout */}
      {isSection ? (
        <SectionDivider question={current} />
      ) : (
        <>
          <div className="mb-8">
            <p className="text-xs font-medium text-alma-500 uppercase tracking-wider mb-2">
              Item {current.position}
            </p>
            <h2 className="text-lg font-semibold text-gray-900 leading-snug mb-2">
              {current.text}
            </h2>
            {current.help_text && (
              <p className="text-sm text-gray-500 leading-relaxed">{current.help_text}</p>
            )}
          </div>

          {/* Answer input */}
          <QuestionInput
            question={current}
            value={answers[current.key] || ''}
            onChange={v => setAnswer(current.key, v)}
          />
        </>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        <button
          onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          className="flex items-center gap-1 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-30"
        >
          <ChevronLeft className="w-4 h-4" /> Zurück
        </button>
        <button
          onClick={goNext}
          disabled={!canProceed}
          className={cn(
            'flex items-center gap-1 px-6 py-2 rounded-lg text-sm font-medium transition-colors',
            canProceed
              ? 'bg-alma-500 text-white hover:bg-alma-600'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          )}
        >
          {isLast ? 'Abschließen' : 'Weiter'}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </PlayerShell>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionDivider({ question }: { question: Question }) {
  return (
    <div className="py-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-px flex-1 bg-alma-100" />
        <span className="text-xs font-semibold text-alma-500 uppercase tracking-widest px-1">
          Abschnitt
        </span>
        <div className="h-px flex-1 bg-alma-100" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">{question.text}</h2>
      {question.help_text && (
        <p className="text-sm text-gray-500 leading-relaxed">{question.help_text}</p>
      )}
    </div>
  )
}

function PlayerShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-6 pt-12">
      <div className="w-full max-w-xl">
        {/* ALMA Player Logo */}
        <div className="flex items-center gap-2 mb-4 px-1">
          <div className="w-6 h-6 bg-alma-500 rounded-md flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-xs">A</span>
          </div>
          <span className="font-semibold text-gray-700 text-sm">ALMA</span>
          <span className="text-xs bg-alma-100 text-alma-700 px-1.5 py-0.5 rounded font-medium">
            Player
          </span>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {children}
        </div>
      </div>
    </div>
  )
}

interface QuestionInputProps {
  question: Question
  value: string
  onChange: (v: string) => void
}

function QuestionInput({ question, value, onChange }: QuestionInputProps) {
  const { type, options, skip_value } = question

  if (type === 'scale' || type === 'single_select') {
    return (
      <div className="space-y-2">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left text-sm transition-all',
              value === opt.value
                ? 'border-alma-400 bg-alma-50 text-alma-800'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            )}
          >
            <span className={cn(
              'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0',
              value === opt.value ? 'border-alma-500' : 'border-gray-300'
            )}>
              {value === opt.value && (
                <span className="w-2.5 h-2.5 rounded-full bg-alma-500" />
              )}
            </span>
            {opt.score !== null && opt.score !== undefined && (
              <span className={cn(
                'font-mono font-bold text-xs w-5 text-center shrink-0',
                String(opt.value) === String(skip_value) ? 'text-gray-300' : 'text-alma-400'
              )}>
                {opt.value}
              </span>
            )}
            <span>{opt.label}</span>
          </button>
        ))}
      </div>
    )
  }

  if (type === 'text') {
    return (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={4}
        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-alma-300"
        placeholder="Freitext eingeben..."
      />
    )
  }

  if (type === 'number') {
    return (
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-32 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-alma-300"
      />
    )
  }

  if (type === 'checkbox') {
    return (
      <button
        onClick={() => onChange(value === 'true' ? 'false' : 'true')}
        className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm transition-all',
          value === 'true' ? 'border-alma-400 bg-alma-50' : 'border-gray-200 bg-white'
        )}
      >
        <div className={cn(
          'w-5 h-5 rounded border-2 flex items-center justify-center',
          value === 'true' ? 'bg-alma-500 border-alma-500' : 'border-gray-300'
        )}>
          {value === 'true' && <span className="text-white text-xs">✓</span>}
        </div>
        Ja
      </button>
    )
  }

  // section is handled by SectionDivider above — QuestionInput never receives it
  return null
}
