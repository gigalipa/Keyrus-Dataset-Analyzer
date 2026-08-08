# Orchestration Plan — Data Consultant App (Lakeside Provisions)

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
  - The dual-provider decision (DeepSeek for data-analysis calls, Google AI Studio for report-text generation)
    wasn't reflected in Milestone 4.1's task, and nothing said which of 4.2/4.3/4.4 uses which provider.
    **Fixed:** Milestone 4.1 now configures both clients explicitly, and Milestones 4.2–4.4 each carry a
    `**Provider:**` line. **Note:** the exact routing for 4.3 (business insights → DeepSeek) and 4.4 (client
    questions → Google AI Studio) is my best-fit reading of "DeepSeek for analysis / Google AI Studio for report
    text," not something the source docs state explicitly — both are marked as assumptions in the file itself.
    **Confirm this routing before Phase 4 dispatch.**
  - Date normalization to YYYY-MM-DD, error-cause disclosure on parse failure, and cross-browser testing were
    resolved decisions with no corresponding task. **Fixed:** added explicit tasks/done-when clauses to
    Milestones 3.4, 2.4, and 5.3 respectively.
- **Unclosable tasks:** none — every task has a concrete done-when. Clean.
- **Ordering:** no phase/task depends on something a later phase produces. Clean.
- **Architecture note (not a doc conflict, worth watching):** even with keys read from a build-time `.env`
  rather than entered via UI, the app still calls DeepSeek's and Google AI Studio's APIs directly from the
  browser. If either provider blocks direct browser-origin requests (CORS), that would force a proxy and
  collide with the "no backend" exclusion. Worth a quick confirmation before Phase 4, lower urgency than before
  since moving to `.env` was your call and doesn't itself introduce the risk — it was already inherent to a
  no-backend architecture calling third-party LLM APIs from the client.

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
- `llm-infra-agent` → Milestone 4.1 (DeepSeek + Google AI Studio client config via `.env`, `.env.example`,
  prompt-engineering helpers, error handling, loading states) → **runs first, alone** — 4.2–4.4 depend on it.
  Verified by: a smoke-test call to each configured provider returns a response; a missing/invalid key produces
  the user-friendly error path; `.env.example` is present and lists both key names.
- `data-dictionary-agent` → Milestone 4.2 (DeepSeek) — **parallel**
- `business-insights-agent` → Milestone 4.3 (DeepSeek, per the routing assumption above) — **parallel**
- `client-questions-agent` → Milestone 4.4 (Google AI Studio, per the routing assumption above) — **parallel**

  Each owns one prompt template + one LLM call + one display component, consuming Phase 3's output but not each
  other's. Apply the "LLM Integration Checklist" from development-process.md to all three. Verify against Phase
  3's sample-dataset output: data-dictionary has one entry per column; business-insights has 3–5 KPIs / 3–5
  insights / 3–5 recommendations; client-questions has 5–10 numbered questions.

**Checkpoint: Yes — mandatory, two reasons.**
1. **Credentials required.** Real `DEEPSEEK_API_KEY` and `GOOGLE_AI_STUDIO_API_KEY` values must exist in a local
   `.env` before `llm-infra-agent` can be built or smoke-tested.
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
- **Credentials needed before Phase 4:** a local `.env` with `DEEPSEEK_API_KEY` and `GOOGLE_AI_STUDIO_API_KEY`
  (never entered via the UI, per the resolved decision).
- **Open item carried into Phase 4:** confirm the DeepSeek/Google AI Studio routing assumption for Milestones
  4.3/4.4 before that phase's agents are briefed.
- **Verification data:** assemble one small fixture dataset with deliberately planted issues (duplicates,
  outliers, missing values, mixed types, a future date, mixed date formats, one non-UTF-8 file, one multi-sheet
  XLSX, one SQL dump with DDL+DML) once, early in Phase 1 or 2, and reuse it as the known-answer key for every
  phase's verification from Phase 2 onward.

## Sign-off

Per the skill's Step 5, live agent dispatch (Step 6) does not start until this plan is reviewed and confirmed.
No build-oriented subagents have been dispatched yet.
