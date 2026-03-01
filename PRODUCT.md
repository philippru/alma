# ALMA
### AI-based Logic & Medical Assessments

> **Klinische Assessments — automatisiert erfasst, strukturiert ausgewertet, nahtlos ins KIS exportiert.**

---

## Die große Idee

Psychiatrische und psychosomatische Kliniken nutzen dutzende standardisierte Assessments (HoNOS, PHQ-9, GAF, PANSS, …). In der Praxis werden diese Bögen heute meist **auf Papier** ausgefüllt, manuell eingetippt und als Freitext ins KIS übertragen. Scoring, Verlaufsdokumentation und HL7-Export passieren — wenn überhaupt — händisch.

**ALMA schließt diese Lücke:**

Ein Arzt öffnet einen Link im KIS → der Patient füllt das Assessment am Tablet aus → ALMA berechnet den Score, erstellt ein PDF-Protokoll und exportiert das Ergebnis vollautomatisch als HL7-Nachricht an Orbis. Keine manuelle Übertragung. Kein Papier. Kein Datenverlust.

Neue Assessments werden nicht programmiert — sie werden als **PDF hochgeladen**. Die KI extrahiert die Struktur, erstellt Fragen und Antwortoptionen automatisch. Was früher Wochen dauerte, dauert Minuten.

---

## Architektur auf einen Blick

```
┌─────────────────────────────────────────────────────────────────┐
│                        ALMA Studio                              │
│  (Verwaltung: Assessments, Versionen, Ergebnisse, Exports)      │
└───────────────────────┬─────────────────────────────────────────┘
                        │  REST API
┌───────────────────────▼─────────────────────────────────────────┐
│                    ALMA Backend                                  │
│  FastAPI · PostgreSQL · Scoring-Engine · Exporter-Pipeline      │
└────────┬──────────────┬──────────────────────────────┬──────────┘
         │              │                              │
    ┌────▼────┐   ┌──────▼──────┐             ┌───────▼──────┐
    │  FHIR   │   │  HL7 ORU    │             │  HL7 MDM     │
    │  R4     │   │  (Befund)   │             │  (Dokument)  │
    └─────────┘   └─────────────┘             └──────────────┘
                        │ Datei-Drop                  │
                  ┌─────▼─────────────────────────────▼───┐
                  │           Orbis / KIS                  │
                  │   (automatischer HL7-Import)           │
                  └────────────────────────────────────────┘
```

---

## Hauptworkflows

### 1 — Assessment aus PDF importieren

```
PDF hochladen  →  KI analysiert Struktur  →  Entwurf prüfen  →  Publizieren
     │                    │                        │
  Beliebiges          Claude / Gemini         Studio-Editor:
  Erhebungsinstrument  erkennt Fragen,         Fragen, Antworten,
  als PDF              Antwortskalen,          Scoring-Logik
                       Scoring-Regeln          anpassen
```

Kein Programmieren. Kein Datenbankschema anlegen. Ein Upload genügt.

---

### 2 — Assessment im KIS anordnen (Orbis-Integration)

**Option A — Picker-Seite** *(kein Integrationsaufwand)*
```
Orbis öffnet URL:
  http://alma/player/pick?tenant_id=X&encounter_id=2024/1234&patient_id=P-99

→ ALMA zeigt Auswahlliste aller verfügbaren Verfahren
→ Klick auf Verfahren → direkt in den Player
```

**Option B — REST-API** *(für automatisierte Workflows)*
```
GET  /api/v1/integrations/assessments?tenant_id=X
     → Verfahrenskatalog (Name, Kürzel, Fragenzahl)

POST /api/v1/integrations/orders
     { assessment_id, encounter_id, patient_id, … }
     → { player_url }   ← in Orbis-Worklist eintragen
```

---

### 3 — Durchführung im Browser-Player

```
Patient / Kliniker öffnet player_url (iFrame oder Vollbild)

  ┌─────────────────────────────────────┐
  │  HoNOS — Item 3 von 12             │
  │                                     │
  │  Problemverhalten                   │
  │                                     │
  │  ○ 0 — Kein Problem                │
  │  ● 1 — Geringfügig                 │
  │  ○ 2 — Leicht                      │
  │  ○ 3 — Mäßig                       │
  │  ○ 4 — Schwer                      │
  │                                     │
  │          [Weiter →]                 │
  └─────────────────────────────────────┘

→ Antworten werden schrittweise gespeichert
→ Keine Datenverlust bei Verbindungsabbruch
```

---

### 4 — Automatische Auswertung & Export

```
Assessment abgeschlossen
        │
        ▼
  Scoring-Engine          →  Gesamtscore + Interpretation
  (HoNOS, Summe, …)          Subskalen (A–D bei HoNOS)
        │
        ├──▶  PDF-Protokoll     →  Gespeichert + downloadbar im Studio
        │     (Deckblatt,
        │      alle Items,
        │      Subscores)
        │
        ├──▶  HL7 ORU           →  /exports/{tenant}/{encounter}.hl7
        │     (Laborbefund-         (Orbis liest automatisch ein)
        │      Format)
        │
        ├──▶  HL7 MDM           →  Dokument mit eingebettetem PDF
        │     (Dokumenten-          (Orbis Archiv)
        │      Format)
        │
        └──▶  FHIR R4           →  QuestionnaireResponse + Observation
              (heute: intern)       (Gesamtscore — Return-Flow geplant)
```

---

### 4a — FHIR Observations Return-Flow *(geplant)*

Heute erzeugt ALMA intern bereits eine `QuestionnaireResponse` mit allen Item-Antworten und eine `Observation` für den Gesamtscore. Diese Ressourcen werden aber noch nicht nach außen transportiert — das ist der nächste Schritt.

**Was FHIR heute liefert (intern):**
```json
QuestionnaireResponse
  status: completed
  item: [ { linkId: "honos_1", answer: "0" }, … ]   ← alle 12 Items

Observation
  code: LOINC 72133-2  (Mental health assessment score)
  valueQuantity: 14 { unit: "score" }
  derivedFrom: QuestionnaireResponse/…
```

**Was der vollständige Return-Flow liefern soll:**

```
ALMA (nach Abschluss)
        │
        ▼
  FHIR R4 Bundle
  ┌─────────────────────────────────────────────────────────┐
  │  QuestionnaireResponse   ← alle Item-Antworten          │
  │                                                         │
  │  Observation: Gesamtscore    LOINC 72133-2   →  14      │
  │                                                         │
  │  Observation: Subskala A     LOINC …         →   4      │
  │  Observation: Subskala B     LOINC …         →   3      │
  │  Observation: Subskala C     LOINC …         →   5      │
  │  Observation: Subskala D     LOINC …         →   2      │
  │                                                         │
  │  Observation: Item 1 (Überaktivität)          →   0      │
  │  Observation: Item 2 (Selbstverletzung)        →   1      │
  │  …  (je Item eine eigene Observation)                   │
  └─────────────────────────────────────────────────────────┘
        │
        ├──▶  Bundle.json schreiben   →  /exports/{tenant}/fhir/
        │     (dateibasierter Import      KIS holt Datei ab wie HL7)
        │
        └──▶  HTTP POST an FHIR-Server  →  http://kis-fhir/Bundle
              (wenn Endpunkt konfiguriert)  (aktive Übergabe, kein Polling)
```

**Konfiguration pro Assessment (im Studio):**
```json
export_config: {
  "fhir": {
    "enabled": true,
    "loinc_total": "72133-2",
    "loinc_subscales": {
      "A": "72106-8",
      "B": "72107-6"
    },
    "fhir_endpoint": "http://orbis-fhir.intern:8080/fhir"
  }
}
```

**Warum das wichtig ist:** Neuere KIS-Generationen (i.s.h.med, Telekom Medicus, künftig Orbis) unterstützen FHIR R4 nativ. Wer heute HL7 v2 exportiert, muss morgen FHIR können. ALMA ist strukturell bereit — der Return-Flow schließt die letzte Lücke.

---

### 5 — Auswertungen im Studio

```
Studio → Auswertungen

┌──────────────┬────────────┬───────────┬──────────┬────────────────┐
│ Encounter    │ Assessment │ Datum     │ Score    │ Exporte        │
├──────────────┼────────────┼───────────┼──────────┼────────────────┤
│ 2024/001234  │ HoNOS v2   │ 01.03.26  │  14      │ ✓ HL7 ORU  ↓  │
│              │            │ 10:32     │ Erhöht   │ ✓ HL7 MDM  ↓  │
│              │            │           │          │ ✓ PDF      ↓  │
└──────────────┴────────────┴───────────┴──────────┴────────────────┘
```

Alle Exporte direkt downloadbar. Vollautomatisch. Kein manueller Schritt.

---

## Top-Idee: Talk to Assessment

> *"Statt Fragen anzuklicken — einfach mit dem Assessment sprechen."*

Standardisierte Assessments wie der HoNOS oder PHQ-9 sind für erfahrene Kliniker intuitiv, aber die digitale Erfassung bleibt ein Bruch: Formular öffnen, Item für Item durchklicken, abschicken. Gerade im Stations-Alltag kostet das Zeit, die eigentlich beim Patienten fehlt.

**Die Idee:** Der Kliniker chattet mit dem Assessment — auf Basis der vorliegenden Items und Antwortoptionen führt Claude ein strukturiertes Gespräch, extrahiert die klinisch relevanten Werte und belegt die Felder automatisch. Das Ergebnis landet als vollständige, scorte Session im System — mit allen Exporten wie gehabt.

```
Kliniker                            ALMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"Starte HoNOS für Fall 2024/1234."
                                    "Bereit. Ich gehe die 12 Items
                                     durch. Beginnen wir mit Item 1
                                     (Überaktivität / Aggression):
                                     Wie war das Verhalten des
                                     Patienten in der letzten Woche?"

"Keine Auffälligkeiten, ruhig
 und kooperativ."
                                    [Item 1 = 0 — kein Problem]

                                    "Item 2 (Selbstverletzung):
                                     Gab es Hinweise auf
                                     selbstgefährdendes Verhalten?"

"Nein, nichts dergleichen."
                                    [Item 2 = 0]

"Item 6 würde ich mit 2 setzen,
 er hat deutliche depressive
 Stimmung, aber noch keine
 schweren Einschränkungen."
                                    [Item 6 = 2 — direkt übernommen]

"Fertig, bitte abschließen."
                                    Score: 8  |  Interpretation: Leicht
                                    PDF erstellt · HL7 exportiert ✓
```

**Warum das zählt:**
- Kliniker arbeiten wie sie denken — im Gespräch, nicht im Formular
- Items können übersprungen, direkt gesetzt oder aus Freitext abgeleitet werden
- Unsichere Zuordnungen werden zur Bestätigung vorgelegt, nie still übernommen
- Der vollständige Audit-Trail bleibt: jede Session ist nachvollziehbar und exportierbar
- Funktioniert für jedes Assessment im System — keine spezifische Programmierung nötig

**Technisch:**
- Chat-Interface direkt im Studio oder Player (Claude-API bereits eingebunden)
- Claude kennt die aktuelle Assessment-Struktur (Items, Skala, Scoring-Logik) als Kontext
- Antwortwerte werden schrittweise in die laufende Session geschrieben
- Abschluss triggert die bestehende Scoring- und Export-Pipeline — kein Sonderweg

---

## Was ALMA heute kann

| Feature | Status |
|---------|--------|
| Assessment aus PDF importieren (KI) | ✅ |
| Assessment-Editor (Fragen, Optionen, Scoring) | ✅ |
| Versionierung mit Aktivierung | ✅ |
| Browser-Player (iFrame-tauglich) | ✅ |
| Scoring-Engine (HoNOS, erweiterbar) | ✅ |
| PDF-Protokoll automatisch | ✅ |
| HL7 ORU + MDM Export | ✅ |
| FHIR R4 QuestionnaireResponse + Observation (intern) | ✅ |
| FHIR R4 Bundle mit Subscale-Observations + Return-Flow | 🔜 Nächster Schritt |
| Orbis-Integration (Picker + REST-API) | ✅ |
| Multi-Tenant | ✅ |
| Studio-Dashboard & Auswertungsliste | ✅ |
| On-Premise Deploy (Docker, kein Internet) | ✅ |
| Talk to Assessment (Chat-Interface) | 💡 Top-Idee |
| Authentifizierung / Rollen | 🔜 Nächster Schritt |
| Mobile-optimierter Player | 🔜 Nächster Schritt |

---

## Technologie

| Schicht | Stack |
|---------|-------|
| Backend | Python · FastAPI · SQLAlchemy async · PostgreSQL |
| Frontend | React 18 · TypeScript · Tailwind CSS · Vite |
| KI | Claude (Anthropic) · Gemini 2.5 Flash |
| Export | HL7 v2.5 · FHIR R4 · fpdf2 |
| Betrieb | Docker Compose · nginx · Alembic |
| Deployment | On-Premise (isoliertes Netz) oder Cloud |

---

*ALMA — gebaut für den klinischen Alltag. Keine Cloud-Pflicht. Keine Vendor-Lock-in. Kein Papier.*
