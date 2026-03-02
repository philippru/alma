# ALMA
### AI-based Logic & Medical Assessments

> **Clinical assessments — digitally captured, automatically scored, seamlessly exported to your HIS.**

ALMA eliminates paper-based assessment workflows in psychiatric and psychosomatic clinics. A clinician opens a link in the hospital information system (HIS) → the patient or clinician completes the assessment in the browser → ALMA calculates the score, generates a PDF protocol, and automatically exports the result as an HL7 message to Orbis. No manual data entry. No paper. No data loss.

New assessments are not programmed — they are **uploaded as PDFs**. The AI extracts the structure, creates questions and answer options automatically. What used to take weeks takes minutes.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Quick Start (Docker)](#quick-start-docker)
  - [Environment Variables](#environment-variables)
- [Workflows](#workflows)
- [Exports](#exports)
- [Roadmap](#roadmap)

---

## Features

| Feature | Status |
|---------|--------|
| Import assessment from PDF (AI) | ✅ |
| Assessment editor (questions, options, scoring) | ✅ |
| Versioning with activation | ✅ |
| Browser player (iFrame-compatible) | ✅ |
| Scoring engine (HoNOS, extensible) | ✅ |
| Automatic PDF protocol | ✅ |
| HL7 ORU + MDM export | ✅ |
| FHIR R4 QuestionnaireResponse + Observation (internal) | ✅ |
| Orbis integration (Picker + REST API) | ✅ |
| Multi-tenant | ✅ |
| Studio dashboard & results list | ✅ |
| On-premise deployment (Docker, no internet required) | ✅ |
| FHIR R4 Bundle with subscale observations + return flow | 🔜 Next |
| Authentication / roles | 🔜 Next |
| Mobile-optimised player | 🔜 Next |
| Talk to Assessment (chat interface) | 💡 Planned |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ALMA Studio                              │
│  (Management: Assessments, Versions, Results, Exports)          │
└───────────────────────┬─────────────────────────────────────────┘
                        │  REST API
┌───────────────────────▼─────────────────────────────────────────┐
│                    ALMA Backend                                  │
│  FastAPI · PostgreSQL · Scoring Engine · Exporter Pipeline      │
└────────┬──────────────┬──────────────────────────────┬──────────┘
         │              │                              │
    ┌────▼────┐   ┌──────▼──────┐             ┌───────▼──────┐
    │  FHIR   │   │  HL7 ORU    │             │  HL7 MDM     │
    │  R4     │   │  (Result)   │             │  (Document)  │
    └─────────┘   └─────────────┘             └──────────────┘
                        │ File drop                   │
                  ┌─────▼─────────────────────────────▼───┐
                  │           Orbis / HIS                  │
                  │   (automatic HL7 import)               │
                  └────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| Backend | Python · FastAPI · SQLAlchemy async · PostgreSQL |
| Frontend | React 18 · TypeScript · Tailwind CSS · Vite |
| AI | Claude (Anthropic) · Gemini 2.5 Flash |
| Export | HL7 v2.5 · FHIR R4 · fpdf2 |
| Operations | Docker Compose · nginx · Alembic |
| Deployment | On-premise (isolated network) or cloud |

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) v2+
- An [Anthropic API key](https://console.anthropic.com/) (for AI-based PDF parsing)
- Optional: A [Google Gemini API key](https://aistudio.google.com/app/apikey)

### Quick Start (Docker)

```bash
# 1. Clone the repository
git clone https://github.com/philippru/alma.git
cd alma

# 2. Create your environment file
cp .env.example .env

# 3. Edit .env and fill in your API keys (at minimum: ANTHROPIC_API_KEY)
# See the Environment Variables section below

# 4. Start all services
docker compose up -d

# 5. Open ALMA Studio in your browser
open http://localhost:3000
```

The following services will be started:

| Service | URL | Description |
|---------|-----|-------------|
| Frontend (Studio + Player) | http://localhost:3000 | React UI |
| Backend (API) | http://localhost:8000 | FastAPI |
| pgAdmin | http://localhost:5050 | Database management UI |
| PostgreSQL | localhost:5432 | Database |

### Environment Variables

Copy `.env.example` to `.env` and configure the values:

```env
# PostgreSQL
POSTGRES_USER=alma
POSTGRES_PASSWORD=change_me
POSTGRES_DB=alma

# pgAdmin
PGADMIN_EMAIL=admin@alma.local
PGADMIN_PASSWORD=change_me

# Backend
SECRET_KEY=change_me_in_production_use_openssl_rand_hex_32
ENVIRONMENT=development
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# AI providers
ANTHROPIC_API_KEY=sk-ant-...     # Required for PDF parsing
GEMINI_API_KEY=                   # Optional

# Frontend
VITE_API_URL=http://localhost:8000

# Public URL for player links in HIS orders
ALMA_PUBLIC_URL=http://localhost:3000
```

> **Production deployment:** See `.env.prod.example` and `docker-compose.prod.yml` for a production-ready setup with nginx reverse proxy.

---

## Workflows

### 1 — Import an assessment from PDF

```
Upload PDF  →  AI analyses structure  →  Review draft  →  Publish
     │                  │                      │
  Any standard      Claude / Gemini        Studio editor:
  assessment        detects questions,     questions, answers,
  as PDF            answer scales,         scoring logic
                    scoring rules          adjustable
```

### 2 — Order an assessment in the HIS (Orbis integration)

**Option A — Picker page** *(no integration effort)*
```
Orbis opens URL:
  http://alma/player/pick?tenant_id=X&encounter_id=2024/1234&patient_id=P-99

→ ALMA shows selection list of all available instruments
→ Click instrument → directly into the player
```

**Option B — REST API** *(for automated workflows)*
```
GET  /api/v1/integrations/assessments?tenant_id=X
     → Instrument catalogue (name, abbreviation, question count)

POST /api/v1/integrations/orders
     { assessment_id, encounter_id, patient_id, … }
     → { player_url }   ← add to Orbis worklist
```

### 3 — Complete in the browser player

The player is fully iFrame-compatible and works on any device. Answers are saved incrementally — no data loss on connection interruption.

### 4 — Automatic scoring & export

Once an assessment is completed, ALMA automatically:
- Calculates the total score and subscale scores
- Generates a PDF protocol (cover page, all items, subscores)
- Exports an HL7 ORU message (lab result format for the HIS)
- Exports an HL7 MDM message (document with embedded PDF for the HIS archive)
- Creates FHIR R4 `QuestionnaireResponse` + `Observation` resources (internal)

All exports are available for download in ALMA Studio. Fully automatic. No manual steps.

---

## Exports

| Format | Description | Target |
|--------|-------------|--------|
| PDF | Assessment protocol with all items and scores | Studio download / HL7 MDM |
| HL7 ORU | Numeric score as lab result | Orbis lab/result system |
| HL7 MDM | Document with embedded PDF | Orbis archive |
| FHIR R4 | `QuestionnaireResponse` + `Observation` | Internal / future return flow |

HL7 files are written to `./exports/{tenant}/{encounter}.hl7` and picked up automatically by the HIS.

---

## Roadmap

- **FHIR R4 return flow** — Full Bundle with subscale observations, file-based export and HTTP POST to a FHIR endpoint
- **Authentication & roles** — Login and role model for Studio admins
- **Mobile-optimised player** — Responsive layout for smartphones and tablets
- **Generic scoring** — Each questionnaire defines its own scoring logic (sum, subscales, cut-off values)
- **Talk to Assessment** — Chat interface: the clinician talks to the assessment; Claude extracts answers from natural language and populates the fields automatically

---

*ALMA — built for clinical practice. No cloud dependency. No vendor lock-in. No paper.*
