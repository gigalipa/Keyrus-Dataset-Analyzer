# Orchestration Plan — Keyrus Dataset Analyzer (client: Lakeside Provisions)

Produced by the `orchestrate-development-process` skill from `docs/development-process.md` and
`docs/project-description.md`. This is a working plan, not a report — resume execution from here if a session
gets interrupted.

## Reconciliation summary

Full checks run: traceability, scope creep, internal contradictions, unclosable tasks, ordering, live open
questions (see `.vibe/skills/orchestrate-development-process/SKILL.md` Step 2 for what each checks).

- **Traceability:** every hard requirement and expected outcome in project-description.md maps to at least one
  phase/task. Clean.
- **Scope creep:** none of the excluded items (auth, DB, backend, deployment, accounts, real-time collab) are
  reintroduced. Clean.
- **Internal contradictions — found and fixed:**
  - File-size limit was 50MB in three places (Milestone 2.1, File Parser Checklist, Deferred-backend rationale)
    vs. 15MB in the resolved Open Questions answer. **Fixed:** all three now read 15MB.
  - Milestone 4.1 allowed API keys "via environment variable or UI input," but the resolved Open Questions
    decision explicitly rules out UI-based key entry (no-backend policy). **Fixed:** task now requires `.env`
    only; a companion `.env.example` task was added since keys can never be entered through the UI.
- **Traceability gaps — found and fixed:**
  - The dual-provider decision (a data-analysis provider for Milestones 4.2/4.3, Google AI Studio for
    report-text generation in 4.4) wasn't reflected in Milestone 4.1's task, and nothing said which of
    4.2/4.3/4.4 uses which provider. **Fixed:** Milestone 4.1 now configures both clients explicitly, and
    Milestones 4.2–4.4 each carry a `**Provider:**` line.
  - Date normalization to YYYY-MM-DD, error-cause disclosure on parse failure, and cross-browser testing were
    resolved decisions with no corresponding task. **Fixed:** added explicit tasks/done-when clauses to
    Milestones 3.4, 2.4, and 5.3 respectively.
- **Unclosable tasks:** none — every task has a concrete done-when. Clean.
- **Ordering:** no phase/task depends on something a later phase produces. Clean.
- **Architecture note (not a doc conflict, worth watching):** even with keys read from a build-time `.env`
  rather than entered via UI, the app still calls its LLM providers directly from the browser. If a provider
  blocks direct browser-origin requests (CORS), that would force a proxy and collide with the "no backend"
  exclusion. **Resolved during Milestone 4.1:** verified with real API keys — Mistral
  (`https://api.mistral.ai/v1/chat/completions`) and Google AI Studio's Generative Language API
  (`https://generativelanguage.googleapis.com`) both return `Access-Control-Allow-Origin` echoing the request's
  `Origin` header on both the CORS preflight and the actual POST response — direct browser-origin calls are
  permitted by both providers. No backend proxy is needed. Mistral is configured with both a primary and a
  fallback model id (`VITE_MISTRAL_MODEL_ID` / `VITE_MISTRAL_FALLBACK_MODEL_ID`), matching Google AI Studio's
  existing primary/fallback pattern, so a provider-side capacity limit on the primary model degrades to a
  second model rather than failing outright.

**Status:** all identified contradictions and gaps were fixed directly in `development-process.md` per your
instruction. One assumption (4.3/4.4 provider routing) is carried forward as a Phase 4 checkpoint item since it
required a judgment call rather than a documented fact.

## Execution batches

### Phase 1 — Project Foundation & File Upload
**Mode:** sequential
**Agents:**
- `scaffold-agent` → Milestone 1.1 (Vite+React+Tailwind init, folder structure, ESLint/Prettier, git init) →
  verified by: `npm run dev` boots without error, Tailwind classes render, `src/components|hooks|utils|lib|types`
  exist, lint/format run clean, `git status` shows an initial commit.
- `upload-ui-agent` → Milestone 1.2 (shell layout, drag-and-drop upload, file-type validation, status states) →
  verified by: dragging a `.csv` and a `.txt` produce correct accept/reject behavior; all four status strings are
  reachable.
- `preview-agent` → Milestone 1.3 (raw data preview table, dataset summary bar) → verified by: uploading a sample
  CSV shows first 100 rows plus row/column count and file name.

**Checkpoint: Yes — first user-visible behavior.** This is the first phase producing an end-to-end flow the user
can click through (upload → see raw data). Cheap to correct now, expensive after later phases build on it.

### Phase 2 — Data Ingestion Pipeline
**Mode:** mixed — parallel parser batch, then sequential integration
**Agents:**
- `csv-tsv-parser-agent` → Milestone 2.1 (CSV/TSV reader, streaming up to 15MB, encoding detection) → verified
  by: parsing 3+ sample CSV/TSV files (including one non-UTF-8) without UI freeze, and confirming a file just
  over 15MB triggers the warn/limit behavior.
- `excel-parser-agent` → Milestone 2.2 (SheetJS integration, multi-sheet handling) → verified by: parsing a
  multi-sheet XLSX sample, confirming default-to-sheet-1 and correct header extraction.
- `sql-parser-agent` → Milestone 2.3 (SQL dump parser: CREATE TABLE + INSERT, 1000-row cap) → verified by:
  parsing a sample mysqldump-style file, schema from DDL, data from DML, capped at 1000 rows.

  These three run **in parallel** — different libraries, different new files
  (`src/lib/parsers/{csv,xlsx,sql}.ts`), no shared state, independently verifiable done-when conditions.

- `arquero-integration-agent` → Milestone 2.4 (Arquero import, normalize all three outputs, validation step with
  cause-disclosure) → **sequential, after the three parser agents** — consumes their outputs. Verified by:
  uploading one file of each type and confirming structurally equivalent Arquero tables, plus a corrupt file
  showing both an error and its detected cause.

**Checkpoint:** None required — the 15MB limit is now settled and consistent across the file, and this phase's
done-when conditions are mechanically verifiable.

### Phase 3 — Data Analysis Engine
**Mode:** mixed — sequential foundation, then parallel analysis dimensions
**Agents:**
- `structural-analysis-agent` → Milestone 3.1 (column metadata, type inference, basic stats) → **runs first,
  alone.** Verified against a sample dataset with a hand-checked answer key.
- `numeric-analysis-agent` → Milestone 3.2 (descriptive stats, IQR outliers) — **parallel**
- `quality-checks-agent` → Milestone 3.3 (missing values, duplicates, inconsistent categoricals, mixed types) —
  **parallel**
- `date-analysis-agent` → Milestone 3.4 (date detection, range, future/old-date flags, **YYYY-MM-DD
  normalization**) — **parallel**

  These three consume Milestone 3.1's output but not each other's — independent-dimension parallel batch. Verify
  each against a fixed sample dataset with planted issues (3 duplicates, 2 outliers, 1 future date, mixed
  date formats to confirm normalization).

**Checkpoint:** None — pure computation, mechanically verifiable (exact counts, exact ranges, exact date format).

### Phase 4 — LLM-Powered Insights
**Mode:** mixed — sequential infrastructure, then parallel feature batch
**Agents:**
- `llm-infra-agent` → Milestone 4.1 (Mistral + Google AI Studio client config via `.env`, `.env.example`,
  prompt-engineering helpers, error handling, loading states) → **runs first, alone** — 4.2–4.4 depend on it.
  Verified by: a smoke-test call to each configured provider returns a response; a missing/invalid key produces
  the user-friendly error path; `.env.example` is present and lists both providers' key/model-id names.
- `data-dictionary-agent` → Milestone 4.2 (Mistral) — **parallel**
- `business-insights-agent` → Milestone 4.3 (Mistral, per the routing assumption above) — **parallel**
- `client-questions-agent` → Milestone 4.4 (Google AI Studio, per the routing assumption above) — **parallel**

  Each owns one prompt template + one LLM call + one display component, consuming Phase 3's output but not each
  other's. Apply the "LLM Integration Checklist" from development-process.md to all three. Verify against Phase
  3's sample-dataset output: data-dictionary has one entry per column; business-insights has 3–5 KPIs / 3–5
  insights / 3–5 recommendations; client-questions has 5–10 numbered questions.

**Checkpoint: Yes — mandatory, two reasons.**
1. **Credentials required.** Real `VITE_MISTRAL_API_KEY`, `VITE_MISTRAL_MODEL_ID`,
   `VITE_MISTRAL_FALLBACK_MODEL_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_MODEL_ID`, and
   `VITE_GOOGLE_FALLBACK_MODEL_ID` values must exist in a local `.env` before `llm-infra-agent` can be built or
   smoke-tested.
2. **Confirm the provider-routing assumption** for 4.3 and 4.4 before dispatch (see Reconciliation summary) —
   it's a reasonable reading of the source docs, not a documented fact.

### Phase 5 — Results Presentation & Polish
**Mode:** sequential
**Agents:**
- `results-ui-agent` → Milestone 5.1 (overview card, quality summary, column detail view) → verified by: each
  component renders real Phase 3/4 output for the sample dataset, no placeholder data.
- `navigation-agent` → Milestone 5.2 (tab navigation, sticky nav, scroll-to-section) → **after**
  `results-ui-agent`, since it wires navigation around 5.1's components. Verified by: each tab scrolls to/reveals
  the matching section, tab bar stays visible on scroll.
- `polish-agent` → Milestone 5.3 (loading skeletons, copy-to-clipboard, responsive breakpoints, keyboard nav,
  download report, **cross-browser verification**) → **after** 5.1/5.2 — cross-cutting passes over shared
  components, sequential to avoid conflicting edits. Verified by: manual pass at <640px/640–1024px/>1024px,
  Tab/Shift+Tab/Enter reaching all interactive elements, download button producing a complete PDF/Markdown, and
  a pass on latest Chrome/Firefox/Safari/Edge.

**Checkpoint: Yes — mandatory, end of roadmap.** Also the point to run
`superpowers:requesting-code-review` / `superpowers:code-review` across the full diff before
`superpowers:finishing-a-development-branch`.

## Notes for execution

- **Shared setup:** Phase 1's `scaffold-agent` must fully complete before any later agent starts — everything
  else writes into the structure it creates.
- **Credentials needed before Phase 4:** a local `.env` with `VITE_MISTRAL_API_KEY`, `VITE_MISTRAL_MODEL_ID`,
  `VITE_MISTRAL_FALLBACK_MODEL_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_MODEL_ID`, and
  `VITE_GOOGLE_FALLBACK_MODEL_ID` (never entered via the UI, per the resolved decision).
- **Open item carried into Phase 4:** confirm the Mistral/Google AI Studio routing assumption for Milestones
  4.3/4.4 before that phase's agents are briefed. (Resolved — see Reconciliation summary.)
- **Verification data:** assemble one small fixture dataset with deliberately planted issues (duplicates,
  outliers, missing values, mixed types, a future date, mixed date formats, one non-UTF-8 file, one multi-sheet
  XLSX, one SQL dump with DDL+DML) once, early in Phase 1 or 2, and reuse it as the known-answer key for every
  phase's verification from Phase 2 onward.

## Reconciliation summary — Phases 6-11 (beyond-MVP batch)

Second reconciliation pass, run against `docs/beyond-MVP.md` as an additional spec layered on top of the
original `docs/project-description.md`, per the `generate-development-process` skill's process. Phases 1-5
above are untouched and already executed; this section covers only the new Phase 6-11 material added to
`docs/development-process.md`.

- **Traceability:** every beyond-MVP.md behavior (top bar/sidebar/viewport shell, automatic chained LLM
  pipeline, loading-overlay status text, KPI cards, History sidebar + empty-state modal, Dashboard with
  filters, Explanation, Business Insights/Questions filter+sort, Overview/Data Dictionary/Quality/Datasets
  under "Data," raw-vs-cleaned comparison + downloads, localStorage-equivalent persistence, PDF report) maps
  to at least one Phase 6-11 milestone. Clean.
- **Scope creep:** no auth/backend/database reintroduced — persistence is IndexedDB, a client-side browser
  API, not a server. Clean.
- **Internal contradictions:** none found between Phase 6-11 tasks and the resolved Open Questions added for
  this batch.
- **Traceability gaps — found and fixed during drafting (not left for execution to discover):**
  - beyond-MVP.md's literal "localStorage" wording conflicts with the existing 15MB file-size limit (Open
    Questions, Phase 2) — localStorage's practical quota can't hold that. **Resolved with the user directly**
    (not silently): IndexedDB is the actual storage layer; recorded in development-process.md's Open
    Questions as a resolved item.
  - "How issues were managed" (Quality section) requires an audit trail the analysis engine doesn't currently
    produce — Phase 2/3 apply fixes (date normalization, encoding fallback) silently. **Fixed:** added as an
    explicit new core-logic task in Milestone 10.3, not assumed to already exist.
  - No charting library or PDF library existed in `package.json` before this batch. **Resolved with the
    user:** Recharts (Milestone 9.1) and jsPDF + html2canvas (Milestone 11.1).
- **Unclosable tasks:** none — every new task has a concrete done-when. Clean.
- **Ordering:** Phase 6 (persistence) precedes Phase 7 (shell, needs persistence for History/state) precedes
  Phase 8 (automated pipeline, needs both persistence to resume mid-sequence and the shell's loading overlay)
  precedes Phase 9/10 (business/data views, need real pipeline output to render) precedes Phase 11 (PDF report,
  needs every other section's real content to have something to export). No later-phase dependency violations.
- **Live open questions:** none blocking — all three raised during drafting (storage mechanism, charting
  library, PDF approach) were resolved with the user before this plan was written; see development-process.md
  Open Questions.

**Status:** clean. No unresolved contradictions carried into execution.

## Execution batches — Phases 6-11 (beyond-MVP batch)

### Phase 6 — Persistent Storage & Multi-Dataset History
**Mode:** sequential
**Agents:**
- `storage-layer-agent` → Milestone 6.1 (persisted-record shape, IndexedDB wrapper via `idb`, quota guard) →
  **runs first, alone** — Milestone 6.2 and every later phase read/write through this layer. Verified by: a
  save-then-reload round-trip test using the Phase 2 fixture dataset preserves every field, including the raw
  and cleaned Arquero tables.
- `history-ui-agent` → Milestone 6.2 (History panel, dataset switching, delete + auto-collapse, conditional
  upload modal) → **after** `storage-layer-agent`, since every task here calls its API. Verified by: uploading
  2 datasets, switching between them with no re-parse/re-call, deleting both, confirming the modal reappears.

**Checkpoint:** None — mechanically verifiable (save, reload, list, delete), matches the roadmap's own
assessment.

### Phase 7 — Application Shell Redesign
**Mode:** sequential
**Agents:**
- `shell-topbar-agent` → Milestone 7.1 (top bar: logo/title, KPI region stub, conditionally-visible History
  button with count badge) → verified by: badge count matches `listDatasets()` length; button hidden with zero
  datasets loaded.
- `shell-sidebar-agent` → Milestone 7.2 (two-section left sidebar, mobile collapse, footer action stubs) →
  **after** `shell-topbar-agent` only in that both mount into the same shell component — otherwise independent;
  can run in parallel if file boundaries stay clean (top bar vs. sidebar are separate components). Verified by:
  all 8 destinations present and routable; sidebar collapses <640px.
- `shell-routing-agent` → Milestone 7.3 (center-viewport routing, loading-overlay shell migration) → **after**
  both — consumes the nav structure from 7.2 and wraps the whole shell for 7.1/7.2's lock-during-load
  behavior. Verified by: each sidebar item shows its (placeholder) section; overlay renders over the full
  shell, not just the viewport.

**Checkpoint: Yes — first user-visible layout change of this batch.** Replaces Phase 5's entire navigation
model; confirm before Phase 8-10 build real content on top of it.

### Phase 8 — Automated Sequential LLM Pipeline & Loading Experience
**Mode:** sequential
**Agents:**
- `pipeline-core-agent` → Milestone 8.1 (step sequence + context contract, pipeline runner with per-step
  persistence/resume, prior-step-output chaining into prompts, manual-trigger removal) → **runs first, alone**
  — 8.2/8.3 depend on a working pipeline to have something to reflect. Verified by: running the fixture
  dataset through the full pipeline and inspecting the actual prompt payloads sent to confirm each later step's
  prompt includes earlier steps' output; confirming `BusinessInsightsPanel`/`ClientQuestionsPanel` no longer
  contain manual-trigger code.
- `loading-overlay-agent` → Milestone 8.2 (stage-by-stage status text, shell lock during processing) →
  **after** `pipeline-core-agent` — status text is driven by the pipeline's actual current step. Verified by:
  each of the 5 documented status strings appears at the correct point during a real fixture-dataset run.
- `kpi-cards-agent` → Milestone 8.3 (business-vs-data-stat KPI distinction in the prompt, top-bar KPI card
  rendering) → **after** `pipeline-core-agent` — needs real business-insights output to render. Can run in
  parallel with `loading-overlay-agent` (different files: prompt template vs. overlay component). Verified by:
  2-5 KPI cards render in the top bar after a real run, content read as business-facing (not column/row stats).

**Checkpoint: Yes — mandatory, same reason as MVP Phase 4.** Live LLM calls, real prompt-chaining behavior,
and removal of manual triggers all need a real look before Phase 9/10 build views on this output. Also the
first phase in this batch with no rollback-cheap undo — prompt-chaining behavior is expensive to redo if wrong.

### Phase 9 — Business-Facing Views
**Mode:** parallel
**Agents:**
- `dashboard-agent` → Milestone 9.1 (Recharts integration, dashboard layout, dashboard-wide filters) —
  **parallel**
- `explanation-agent` → Milestone 9.2 (explanation pipeline step + section) — **parallel**
- `insights-cards-agent` → Milestone 9.3 (importance field on the insights schema, filter/sort card rework
  per the Filterable Card List Checklist) — **parallel**
- `questions-cards-agent` → Milestone 9.4 (importance field on questions, filter/sort card rework) —
  **parallel**

  All four consume Phase 8's pipeline output but not each other's — independent destinations, independent
  files (`src/components/dashboard/`, `src/components/explanation/`, existing insights/questions component
  dirs). `insights-cards-agent` and `questions-cards-agent` should apply the exact same Filterable Card List
  Checklist so the two sections feel consistent, but that's a shared checklist reference, not shared state.
  Verify each against the fixture dataset's pipeline output: Dashboard filters affect every widget
  simultaneously; Explanation reads as prose, not a data dump; both card sections filter by tag and sort by
  importance correctly.

**Checkpoint:** None required beyond Phase 8's — display-layer work over already-verified pipeline output,
mechanically checkable.

### Phase 10 — Data Views Rework
**Mode:** mixed — parallel migrations, sequential audit-trail work
**Agents:**
- `overview-migration-agent` → Milestone 10.1 (migrate `DataOverviewCard`/`ColumnDetailView`) — **parallel**
- `dictionary-migration-agent` → Milestone 10.2 (migrate Data Dictionary panel) — **parallel**

  These two are pure relocations of already-correct Phase 5 components into the new shell — independent
  files, no shared state, safe to parallelize. Verified by: pixel/behavior parity with the Phase 5 originals,
  now reachable via the new sidebar.

- `audit-trail-agent` → Milestone 10.3 (new transformation-audit-log core logic in
  `src/lib/analysis/`/`src/lib/parsers/`, migrated `DataQualitySummaryCard`, new "how issues were managed"
  section) → **sequential, own batch** — this is new core logic (not a migration) touching the same analysis
  modules Phase 2/3 built, so it runs alone to avoid conflicting edits with anything else touching those files
  this phase. Verified against the fixture dataset's known planted issues (3 duplicates, 2 outliers, 1 future
  date, mixed date formats) — each planted issue's fix should produce a corresponding audit-log entry.
- `datasets-comparison-agent` → Milestone 10.4 (side-by-side raw/cleaned view, full downloads) →
  **parallel with `audit-trail-agent`** — reads from Milestone 6.1's persisted record, doesn't touch the
  analysis engine. Verified by: first 50 rows match on both sides for unchanged columns and differ exactly
  where Phase 2/3 transformations apply; both downloads produce complete (non-truncated) CSVs.

**Checkpoint:** None required — migrations are mechanically verifiable against Phase 5's existing behavior,
and the audit-trail addition checks against the same known fixture-dataset issues used since Phase 2.

### Phase 11 — PDF Report & Final Polish
**Mode:** sequential
**Agents:**
- `pdf-report-agent` → Milestone 11.1 (jsPDF + html2canvas integration, full report generator, sidebar button
  wiring) → verified by: "Download PDF Report" produces a multi-page PDF covering Dashboard/Explanation/
  Insights/Questions/Quality for the fixture dataset, opened and visually checked, not just checked for file
  existence.
- `final-polish-agent` → Milestone 11.2 (responsive/keyboard/cross-browser re-verification across the entire
  new shell) → **after** `pdf-report-agent`, so polish covers the finished PDF button too, not a stub.
  Verified by: manual pass at <640px/640-1024px/>1024px including the History panel and collapsed sidebar,
  Tab/Shift+Tab/Enter reaching every new interactive control, and a pass on latest Chrome/Firefox/Safari/Edge.

**Checkpoint: Yes — mandatory, end of this batch.** Same pattern as the MVP's Phase 5 checkpoint: run a full
`code-review` pass across the diff before considering Phases 6-11 closed.

## Notes for execution — Phases 6-11

- **No new credentials needed.** This batch adds no new external services — Recharts, jsPDF, html2canvas, and
  `idb` are all client-side libraries with no API keys.
- **Shared setup:** Phase 6's `storage-layer-agent` must fully complete before any later agent starts — Phase
  7's shell, Phase 8's pipeline resume logic, and Phase 10's comparison view all read/write through it.
- **Highest-risk phase:** Phase 8 — the chained-context pipeline is the actual behavioral core of
  beyond-MVP.md and the most expensive to get wrong (live LLM calls, prompt-chaining correctness). Budget
  real review time at its checkpoint rather than treating it as routine.
- **Verification data:** reuse the same fixture dataset established in Phase 1/2 (duplicates, outliers,
  missing values, mixed types, future date, mixed date formats, non-UTF-8 file, multi-sheet XLSX, SQL dump)
  for every phase's verification in this batch too — no new fixture needed.
- **`update-repo`** should still run at the end of every phase in this batch (6 through 11), and after any
  milestone within them that turns out unusually difficult or delicate, per the existing project convention.

## Sign-off

Per the skill's Step 5, live agent dispatch (Step 6) does not start until this plan is reviewed and confirmed.
Phases 1-5 above were dispatched and completed in an earlier session. **Phases 6-11 (the beyond-MVP batch) are
planned but not yet dispatched** — awaiting the user's go-ahead before `storage-layer-agent` (Phase 6,
Milestone 6.1) is launched.
