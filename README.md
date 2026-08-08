# Keyrus Dataset Analyzer

A React/Tailwind web app for consultant-first data assessment — **Phases 1–2 complete, Phase 3 next**.

## Summary

This project helps consultants quickly profile and assess raw customer datasets (orders, transactions, etc.) and produce a business-friendly assessment: a data dictionary, data-quality checks, KPI suggestions, insights, and recommended questions for the client.

The app runs entirely in the browser with no backend: client-side parsing and transformation (Arquero), plus LLM-driven narrative generation for human-friendly output.

## Current Status

- **Phase: 3 of 5 in progress** — Phase 1 (Foundation & Upload) and Phase 2 (Data Ingestion Pipeline) complete; see [docs/development-process.md](docs/development-process.md) for the checked-off task list.
- **Source code:** Vite + React + TypeScript + Tailwind v4 app in `src/`, building and linting clean (`npm run build`, `npm run lint`, `npx tsc -b --noEmit`).
- **Working today:**
  - Responsive upload shell with drag-and-drop (and click-to-browse), extension validation (`.csv .tsv .xls .xlsx .sql`), and status feedback.
  - A first-look preview (first 100 rows + row/column/file-name summary) for CSV/TSV uploads.
  - Real parsers for all five formats — `src/lib/parsers/{csv,xlsx,sql}.ts` — normalized into Arquero tables through a single entry point (`src/lib/parsers/index.ts`), with cause-aware validation errors for empty/corrupt/unparseable files. Not yet wired into the upload UI (that lands as the parsers get consumed in later phases).
- **Planning & process artifacts:**
  - [docs/project-description.md](docs/project-description.md) — the spec and requirements
  - [docs/development-process.md](docs/development-process.md) — the phased roadmap (5 phases, 17 milestones, 65+ tasks)
  - [docs/orchestration-plan.md](docs/orchestration-plan.md) — the multi-agent execution plan: batching, checkpoints, verification per phase
  - [.vibe/skills/generate-development-process/](.vibe/skills/generate-development-process/) — skill used to generate the roadmap
  - [.vibe/skills/orchestrate-development-process/](.vibe/skills/orchestrate-development-process/) — skill for multi-agent execution
  - `NOTES.md` — development notes, process guidance, and issues encountered along the way

## Goals

1. Accept CSV, TSV, XLS, XLSX and SQL files in the browser.
2. Parse and normalize datasets client-side.
3. Compute data profiles (nulls, duplicates, inconsistencies, outliers).
4. Generate a data dictionary and business insights via an LLM.
5. Present findings in a clear, consultant-facing UI.

## Next Steps

1. ~~**Phase 1 — Project Foundation & File Upload**~~ ✅ Done — Vite/React/Tailwind scaffold, responsive shell, drag-and-drop upload with validation, CSV/TSV preview.
2. ~~**Phase 2 — Data Ingestion Pipeline**~~ ✅ Done — CSV/TSV, Excel, and SQL parsers, normalized into Arquero tables.
3. **Phase 3 — Data Analysis Engine (next):** Column/type inference, descriptive statistics, outlier/duplicate/missing-value/mixed-type detection, date normalization.
4. **Phase 4 — LLM-Powered Insights:** Configure DeepSeek + Google AI Studio clients (`.env`-sourced keys), create prompt templates for data dictionary, business insights, and client questions.
5. **Phase 5 — Results Presentation & Polish:** Tabbed results UI, responsive/keyboard/cross-browser polish, downloadable report.

Full task-level detail lives in [docs/development-process.md](docs/development-process.md); the execution/batching plan is in [docs/orchestration-plan.md](docs/orchestration-plan.md).

## How to Contribute

- Open an issue describing the feature or bug.
- Start a branch named `feat/<short-name>` or `fix/<short-name>`.
- Keep changes focused and small; prefer small PRs with a single goal.

## License

CC-BY-4.0

**Developed by:** Daniel Peraza
**Co-Authors:** Mistral Vibe & Claude Code