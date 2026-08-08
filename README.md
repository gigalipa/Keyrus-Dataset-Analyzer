# Keyrus Dataset Analyzer

A React/Tailwind web app for consultant-first data assessment — **MVP complete (Phases 1–5)**.

## Summary

This project helps consultants quickly profile and assess raw customer datasets (orders, transactions, etc.) and produce a business-friendly assessment: a data dictionary, data-quality checks, KPI suggestions, insights, and recommended questions for the client.

The app runs entirely in the browser with no backend: client-side parsing and transformation (Arquero), plus LLM-driven narrative generation for human-friendly output.

## Current Status

- **MVP complete, not yet a fully developed product.** Phases 1–5 (Foundation & Upload, Data Ingestion Pipeline, Data Analysis Engine, LLM-Powered Insights, Results Presentation & Polish) are done; see [docs/development-process.md](docs/development-process.md) for the fully checked-off task list. Live MVP testing has shown the interface is comprehensive at a data-analysis level but not yet easy to use for non-technical, non-data-educated users — **Phase 6 (Refining Interface & Usage After MVP Testing)** and further testing are the next step before this is a fully developed product, not an afterthought.
- **Source code:** Vite + React + TypeScript + Tailwind v4 app in `src/`, building and linting clean (`npm run build`, `npm run lint`, `npx tsc -b --noEmit`).
- **The app is now end-to-end functional.** Drop in a CSV/TSV/XLS/XLSX/SQL file and get a real, tabbed assessment:
  - Drag-and-drop (or click-to-browse) upload with extension validation and status feedback, feeding real parsers for all five formats (`src/lib/parsers/`) normalized into Arquero tables.
  - A full data-analysis engine (`src/lib/analysis/`) runs automatically on upload: column/type inference, descriptive statistics with IQR outlier detection, data-quality checks (missing values, duplicates, near-duplicate categoricals, mixed types), and date detection/range/normalization to YYYY-MM-DD.
  - Results are organized into a sticky, keyboard-navigable tab bar — Overview, Data Quality, Data Dictionary, Business Insights, Client Questions — with scroll-spy highlighting and loading skeletons.
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
6. **Phase 6 — Refining Interface & Usage After MVP Testing (next):** not yet planned — usability changes for non-technical, non-data-educated users, based on live MVP testing.

Full task-level detail lives in [docs/development-process.md](docs/development-process.md); the execution/batching plan is in [docs/orchestration-plan.md](docs/orchestration-plan.md).

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