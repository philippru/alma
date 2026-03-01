# Features & User Stories

## Status-Legende
- `[ ]` offen – noch nicht besprochen
- `[~]` in Diskussion – wird gerade besprochen/geplant
- `[x]` umgesetzt – implementiert und abgenommen

---

## ALMA Studio (Admin)

- `[x]` **PDF-Upload & KI-Parsing** – Als Admin kann ich ein Assessment-PDF hochladen, damit ALMA es per KI automatisch in eine strukturierte Fragebogen-Definition umwandelt.
- `[ ]` **KI-Mapping validieren** – Als Admin kann ich das KI-generierte Mapping reviewen und manuell korrigieren, bevor es aktiviert wird.
- `[ ]` **Schnittstellen konfigurieren** – Als Admin kann ich pro Assessment festlegen, welche Exporter (FHIR, HL7 ORU, HL7 MDM) aktiv sind und wie sie konfiguriert sind.

---

## ALMA Player (Klinischer Alltag)

- `[x]` **Assessment ausfüllen via iFrame** – Als Arzt oder Patient kann ich einen Fragebogen direkt im KIS (Orbis) ausfüllen, ohne die Anwendung zu wechseln.
- `[x]` **Patientenkontext via URL** – Als KIS kann ich den Player mit `encounter_id` (Pflicht) und optional `patient_id`, `patient_name`, `dob` aufrufen, damit der Kontext automatisch gesetzt wird.
- `[x]` **Anonyme Speicherung** – Als Datenschutzverantwortlicher will ich, dass Antworten ohne `patient_id` anonym unter der `encounter_id` gespeichert werden.

---

## Assessments / Fragebögen

- `[x]` **HoNOS** – Health of the Nation Outcome Scales (12 Items, Summenscore ohne Wert 9, 4 Subskalen A–D)
- `[ ]` **PHQ-9** – Patient Health Questionnaire (Selbstbild, Depression)
- `[ ]` **GAD-7** – Generalized Anxiety Disorder Scale (Selbstbild, Angst)
- `[ ]` **BDI-II** – Beck-Depressions-Inventar (Selbstbild, Depression)
- `[ ]` **ISR** – ICD-10-Symptom-Rating (Selbstbild, Breitband)
- `[ ]` **BPRS** – Brief Psychiatric Rating Scale (Fremdbild, Psychosen)
- `[ ]` **HAM-D** – Hamilton Depression Scale (Fremdbild, Depression)
- `[ ]` **MMST** – Mini-Mental-Status-Test (Fremdbild, Demenz/Kognition)
- `[ ]` **PANSS** – Positive and Negative Syndrome Scale (Fremdbild, Schizophrenie)
- `[ ]` **ZAS** – Zung Self-Rating Anxiety Scale (Selbstbild, Angst)

---

## Scoring

- `[x]` **HoNOS-Scoring** – Automatische Berechnung von Gesamt- und Subskalenscore (Wert 9 = Skip).
- `[ ]` **Generisches Scoring** – Jeder Fragebogen definiert seine eigene Scoring-Logik (Summe, Subskalen, Cut-off-Werte).

---

## Exporter ("Beine")

- `[x]` **FHIR-Exporter** – Erzeugt `Observation` oder `QuestionnaireResponse` (FHIR R4).
- `[x]` **HL7 ORU-Exporter** – Sendet numerische Scores an das KIS-Labor/Befundsystem.
- `[x]` **HL7 MDM-Exporter** – Überträgt ein fertiges Ergebnis-Dokument archivfest in die Akte.

---

## KIS-Integration

- `[ ]` **Orbis-Integration** – Als Krankenhaus kann ich ALMA als iFrame in Orbis einbetten und den Patientenkontext per URL übergeben.
- `[ ]` **Generische HL7/FHIR-Integration** – Als Nicht-Orbis-Krankenhaus kann ich ALMA über Standard-HL7/FHIR anbinden.

---

## Infrastruktur

- `[x]` **Docker-Setup** – Lokale Entwicklungsumgebung mit Docker Compose (Backend, Frontend, PostgreSQL, pgAdmin).
- `[ ]` **AWS-Deployment** – Produktivbetrieb auf AWS.
- `[ ]` **Authentifizierung** – Login/Rollenkonzept für Studio-Admins (nach MVP).

