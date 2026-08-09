# Keyrus Dataset Analyzer

A React/Tailwind web app for consultant-first data assessment — **MVP complete (Phases 1–5)**.

## Summary

This project helps consultants quickly profile and assess raw customer datasets (orders, transactions, etc.) and produce a business-friendly assessment: a data dictionary, data-quality checks, KPI suggestions, insights, and recommended questions for the client.

The app runs entirely in the browser with no backend: client-side parsing and transformation (Arquero), plus LLM-driven narrative generation for human-friendly output.

## Current Status

- **MVP complete, not yet a fully developed product.** Phases 1–5 (Foundation & Upload, Data Ingestion Pipeline, Data Analysis Engine, LLM-Powered Insights, Results Presentation & Polish) are done; see [docs/development-process.md](docs/development-process.md) for the fully checked-off task list. Live MVP testing showed the interface is comprehensive at a data-analysis level but not yet easy to use for non-technical, non-data-educated users — **Phases 6–11**, planned from [docs/beyond-MVP.md](docs/beyond-MVP.md), rework the app into a persistent, dashboard-style tool (local multi-dataset history, an automatic LLM analysis pipeline, a top-bar/sidebar shell, business-facing dashboard views, and a real PDF report) and are the next step before this is a fully developed product, not an afterthought. **Phases 6 and 7 are now done** — the app persists across reloads via IndexedDB, and the interface has moved to the new top-bar/sidebar/viewport shell.
- **The app now remembers your datasets.** Every upload is saved locally (IndexedDB, no server involved) and survives closing the tab. A History panel lists every dataset you've analyzed — switch between them instantly (no re-parsing, no new LLM calls), delete ones you no longer need, or start a new one. Reopen the app and your most recent dataset loads automatically; only a brand-new browser profile with nothing saved yet shows the "Upload a dataset" prompt.
- **The interface is now a dashboard shell, not a single scrolling page.** A top bar (logo, a KPI-card region reserved for Phase 8, the History button) sits above a left sidebar with two groups — Business information (Dashboard, Explanation, Business Insights, Questions) and Data (Overview, Data Dictionary, Quality, Datasets) — collapsible on mobile. Clicking a sidebar item switches the center viewport instantly, no scrolling required; the five sections with real content today (Overview, Quality, Data Dictionary, Business Insights, Client Questions) stay mounted in the background so switching away and back never loses generated data or re-fires an LLM call. The other three destinations (Dashboard, Explanation, Datasets) show honest "coming in a later phase" placeholders until Phases 9–10 build them out.
- **Source code:** Vite + React + TypeScript + Tailwind v4 app in `src/`, building and linting clean (`npm run build`, `npm run lint`, `npx tsc -b --noEmit`).
- **The app is now end-to-end functional.** Drop in a CSV/TSV/XLS/XLSX/SQL file and get a real assessment, routed through the sidebar described above:
  - Drag-and-drop (or click-to-browse) upload with extension validation and status feedback, feeding real parsers for all five formats (`src/lib/parsers/`) normalized into Arquero tables.
  - A full data-analysis engine (`src/lib/analysis/`) runs automatically on upload: column/type inference, descriptive statistics with IQR outlier detection, data-quality checks (missing values, duplicates, near-duplicate categoricals, mixed types), and date detection/range/normalization to YYYY-MM-DD.
  - LLM-powered insights via a shared, schema-validated content contract (`src/lib/llm/schema.ts`) so the UI renders and filters any generated content generically, by type and by tag, without hardcoding layout or fixed item counts. The data dictionary generates automatically on upload; business insights and client questions generate on demand (per-tab "Generate" button, to avoid burning API calls on every casual upload). Data dictionary and business insights run on Mistral, client questions on Google AI Studio (Gemini) — all real-verified against live API calls, with response parsing hardened against malformed LLM output (fence-stripping, bracket-aware extraction, `jsonrepair`).
  - Copy-to-clipboard on individual insights/recommendations/questions, and a one-click Markdown report download bundling everything generated so far (a fully-formatted PDF export is the intended next step — see `src/lib/report/markdownReport.ts`).
  - Responsive from mobile to desktop and cross-browser tested (Chromium, Firefox, and Playwright's WebKit as the closest available Safari proxy on this Windows dev machine — see `NOTES.md` for what that honestly does and doesn't cover).
- **Planning & process artifacts:**
  - [docs/project-description.md](docs/project-description.md) — the spec and requirements
  - [docs/development-process.md](docs/development-process.md) — the phased roadmap (5 phases, 17 milestones, 65+ tasks)
  - [docs/orchestration-plan.md](docs/orchestration-plan.md) — the multi-agent execution plan: batching, checkpoints, verification per phase
  - [.vibe/skills/generate-development-process/](.vibe/skills/generate-development-process/) — skill used to generate the roadmap
  - [.vibe/skills/orchestrate-development-process/](.vibe/skills/orchestrate-development-process/) — skill for multi-agent execution
  - [.claude/skills/update-repo/](.claude/skills/update-repo/) — skill that syncs these docs and commits at each milestone/phase checkpoint
  - `NOTES.md` — development notes, process guidance, and issues encountered along the way

## Goals

1. ✅ Accept CSV, TSV, XLS, XLSX and SQL files in the browser.
2. ✅ Parse and normalize datasets client-side.
3. ✅ Compute data profiles (nulls, duplicates, inconsistencies, outliers).
4. ✅ Generate a data dictionary and business insights via an LLM.
5. ✅ Present findings in a clear, consultant-facing UI.

All five original goals are met. Development history:

1. ~~**Phase 1 — Project Foundation & File Upload**~~ ✅ Done — Vite/React/Tailwind scaffold, responsive shell, drag-and-drop upload with validation, CSV/TSV preview.
2. ~~**Phase 2 — Data Ingestion Pipeline**~~ ✅ Done — CSV/TSV, Excel, and SQL parsers, normalized into Arquero tables.
3. ~~**Phase 3 — Data Analysis Engine**~~ ✅ Done — column/type inference, descriptive statistics with outlier detection, data-quality checks, date detection/normalization.
4. ~~**Phase 4 — LLM-Powered Insights**~~ ✅ Done — Mistral + Google AI Studio clients, shared structured-output schema, data dictionary/business insights/client questions all generating and rendering real content.
5. ~~**Phase 5 — Results Presentation & Polish**~~ ✅ Done — real pipeline wired end-to-end, tabbed results UI, loading skeletons, copy-to-clipboard, responsive/keyboard/cross-browser polish, downloadable Markdown report.
6. ~~**Phase 6 — Persistent Storage & Multi-Dataset History**~~ ✅ Done — IndexedDB persistence layer (`src/lib/storage/`), History sidebar with dataset switching and delete, and a conditional "Upload a dataset" modal that only appears when there's nothing saved yet.
7. ~~**Phase 7 — Application Shell Redesign**~~ ✅ Done — top bar with a conditionally-visible History button, collapsible left sidebar with all 8 destinations, and sidebar-routed center viewport that replaces Phase 5's scroll-spy tab bar entirely.
8. **Phase 8 — Automated Sequential LLM Pipeline & Loading Experience (next):** planned — chained-context LLM calls replacing manual "Generate" buttons, stage-by-stage loading overlay, business-facing KPI cards.
9. **Phase 9 — Business-Facing Views:** planned — Dashboard (Recharts, cross-widget filters), Explanation, filter/sort Business Insights and Questions cards.
10. **Phase 10 — Data Views Rework:** planned — Overview/Data Dictionary migration, a new transformation-audit-log for Quality, raw-vs-cleaned Datasets comparison with downloads.
11. **Phase 11 — PDF Report & Final Polish:** planned — real PDF report export (jsPDF + html2canvas), cross-cutting re-verification of the new shell.

Full task-level detail lives in [docs/development-process.md](docs/development-process.md); the execution/batching plan is in [docs/orchestration-plan.md](docs/orchestration-plan.md).

## Development time use

Time actually spent, derived from `git log` timestamps (all commits landed same-day, 2026-08-08), plus the untracked planning/setup work that preceded the first commit.

### MVP (Phases 1–5) — actual

| Stage | Span | Duration |
|---|---|---|
| Planning & tool readiness *(MCPs, CLI, Skills, GitHub repo setup — not captured in commit history)* | before 09:42 | ~2h 00m |
| Init commit → Phase 1 (upload UI + preview) | 09:42 → 10:07 | 24m |
| Phase 2 (multi-format parsers + Arquero integration) | 10:07 → 10:51 | 44m |
| README sync (Phase 1–2) | 10:51 → 10:54 | 3m |
| `.claude/` tooling sync + orchestration skill | 10:54 → 11:17 | 23m |
| Phase 3 (data analysis engine) | 11:17 → 11:57 | 40m |
| Phase 4 (LLM-powered insights) | 11:57 → 13:21 | 1h 24m |
| Phase 5 (full wiring, provider swap, rename, final code review + bug fixes) | 13:21 → 16:34 | 3h 13m |
| AFK Time for lunch and other personal affairs | 12:00 → 13:00 / 14:00 → 16:00 | 3h |
| **Total, planning through MVP close-out** | 09:42 → 16:34 (+2h pre-work - 3h AFK) | **~5h 52m** |

### Phases 6–11 (beyond-MVP batch) — actual vs. estimated

Phase 6 is done, timed for real from `git log`/session timestamps; Phases 7–11 remain estimates, sized from each phase's scope in [docs/orchestration-plan.md](docs/orchestration-plan.md) relative to the actual MVP phases above (e.g. Phase 8's live-LLM-call complexity is sized against Phase 4's actual 1h 24m; Phase 11's mandatory close-out review is sized against Phase 5's).

| Phase | Actual | Estimate | Why |
|---|---|---|---|
| 6 — Persistent Storage & Multi-Dataset History | **23m** (05:10 → 05:33) | — | Done — came in well under the original 1.0–1.5h estimate; a self-contained data layer, similar shape to Phase 2's parser work |
| 7 — Application Shell Redesign | — | 1.5–2.0h | Full navigation-model replacement; first user-visible checkpoint |
| 8 — Automated Sequential LLM Pipeline & Loading Experience | — | 2.0–2.5h | Highest-risk phase — live chained LLM calls, prompt-context correctness, mandatory checkpoint |
| 9 — Business-Facing Views | — | 2.0–2.5h | Four parallel workstreams, one new dependency (Recharts), new dashboard-wide filtering logic |
| 10 — Data Views Rework | — | 1.5–2.0h | Mostly migration of existing components, plus new audit-trail core logic |
| 11 — PDF Report & Final Polish | — | 2.0–2.5h | New PDF pipeline (jsPDF + html2canvas) plus full responsive/keyboard/cross-browser re-verification and a mandatory close-out code review, mirroring Phase 5's cost |
| **Total, Phases 6–11** | **23m so far** | **~9–12h remaining** | |

**Projected grand total (planning → Phases 1–11 complete): ~20–23h.**

## Possible future work

Not required by the original spec, but natural next steps if this continues past its current scope:
- **Fully-formatted PDF report export**, replacing/complementing the current Markdown download (flagged as the intended goal in `src/lib/report/markdownReport.ts`).
- **Bundle size / code-splitting** — the production bundle is sizable now that Arquero, the format parsers, and the LLM SDKs are wired in for real; the three LLM panels are already lazy-loaded, but there's more room (e.g. splitting Excel/SQL parsing out of the main chunk).
- **Real Safari verification** — cross-browser testing so far used Playwright's WebKit build on Windows as the closest available proxy, not literal Safari on macOS.
- Anything in `docs/development-process.md`'s "Deferred / out of scope" section (auth, backend, database, etc.) — all explicitly excluded by the original spec, not gaps.

## How to Contribute

- Open an issue describing the feature or bug.
- Start a branch named `feat/<short-name>` or `fix/<short-name>`.
- Keep changes focused and small; prefer small PRs with a single goal.

## License

CC-BY-4.0

**Developed by:** Daniel Peraza
**Co-Authors:** Mistral Vibe & Claude Code