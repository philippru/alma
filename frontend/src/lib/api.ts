import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
})

// ── Assessment API ────────────────────────────────────────────────────────────

export const assessmentApi = {
  list: (tenantId: string) =>
    api.get('/assessments/', { params: { tenant_id: tenantId } }).then(r => r.data),

  get: (id: string) =>
    api.get(`/assessments/${id}`).then(r => r.data),

  create: (payload: object) =>
    api.post('/assessments/', payload).then(r => r.data),

  publish: (id: string) =>
    api.patch(`/assessments/${id}/publish`).then(r => r.data),

  unpublish: (id: string) =>
    api.patch(`/assessments/${id}/unpublish`).then(r => r.data),

  delete: (id: string) =>
    api.delete(`/assessments/${id}`).then(r => r.data),
}

// ── Studio API ────────────────────────────────────────────────────────────────

export const studioApi = {
  uploadPdf: (file: File, tenantId: string, sourceUrl?: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('tenant_id', tenantId)
    if (sourceUrl) form.append('source_url', sourceUrl)
    return api.post('/studio/upload-pdf', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },

  parseUrl: (url: string, description?: string) =>
    api.post('/studio/parse-url', { url, description }).then(r => r.data),

  chat: (message: string, context: object) =>
    api.post('/studio/chat', { message, context }).then(r => r.data),

  createVersion: (assessmentId: string, payload: object) =>
    api.post(`/studio/assessments/${assessmentId}/versions`, payload).then(r => r.data),

  activateVersion: (assessmentId: string, versionId: string) =>
    api.patch(`/studio/assessments/${assessmentId}/versions/${versionId}/activate`).then(r => r.data),

  listVersions: (assessmentId: string) =>
    api.get(`/studio/assessments/${assessmentId}/versions`).then(r => r.data),

  getVersionQuestions: (assessmentId: string, versionId: string) =>
    api.get(`/studio/assessments/${assessmentId}/versions/${versionId}/questions`).then(r => r.data),

  getStats: (tenantId: string) =>
    api.get('/studio/stats', { params: { tenant_id: tenantId } }).then(r => r.data),

  getExportConfig: (assessmentId: string) =>
    api.get(`/studio/assessments/${assessmentId}/export-config`).then(r => r.data),

  saveExportConfig: (assessmentId: string, config: object) =>
    api.patch(`/studio/assessments/${assessmentId}/export-config`, config).then(r => r.data),

  listSessions: (tenantId: string, limit = 100) =>
    api.get('/studio/sessions', { params: { tenant_id: tenantId, limit } }).then(r => r.data),

  getSessionPdfUrl: (sessionId: string) =>
    `${API_BASE}/api/v1/studio/sessions/${sessionId}/pdf`,

  getSessionHl7Url: (sessionId: string, fmt: string) =>
    `${API_BASE}/api/v1/studio/sessions/${sessionId}/hl7/${fmt}`,

  validateApiKey: () =>
    api.get('/studio/validate-api-key').then(r => r.data),
}

// ── Player API ────────────────────────────────────────────────────────────────

export interface PlayerInitParams {
  assessment_id: string
  encounter_id: string
  tenant_id: string
  patient_id?: string
  patient_name?: string
  patient_dob?: string
}

export const playerApi = {
  initSession: (params: PlayerInitParams) =>
    api.get('/player/session/init', { params }).then(r => r.data),

  saveResponses: (sessionId: string, responses: object[]) =>
    api.post(`/player/session/${sessionId}/respond`, { responses }).then(r => r.data),

  complete: (sessionId: string, exportFormats?: string[]) =>
    api.post(`/player/session/${sessionId}/complete`, null, {
      params: export_formats_to_params(exportFormats),
    }).then(r => r.data),
}

function export_formats_to_params(formats?: string[]) {
  if (!formats) return {}
  return formats.reduce((acc, f) => ({ ...acc, [`export_formats`]: f }), {})
}

// ── Integration API (KIS / Orbis) ─────────────────────────────────────────────

export const integrationApi = {
  listAssessments: (tenantId: string) =>
    api.get('/integrations/assessments', { params: { tenant_id: tenantId } }).then(r => r.data),
}

// ── Tenant API ────────────────────────────────────────────────────────────────

export const tenantApi = {
  list: () => api.get('/tenants/').then(r => r.data),
  create: (payload: object) => api.post('/tenants/', payload).then(r => r.data),
}
