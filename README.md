# Keyrus Dataset Analyzer

A React/Tailwind web app for consultant-first data assessment — currently in **planning phase**.

## Summary

This project will help consultants quickly profile and assess raw customer datasets (orders, transactions, etc.) and produce a business-friendly assessment: a data dictionary, data-quality checks, KPI suggestions, insights, and recommended questions for the client.

The app is designed to run entirely in the browser with no backend: client-side parsing and transformation (Arquero), plus LLM-driven narrative generation for human-friendly output.

## Current Status

- **Phase: Planning** — Development roadmap and project description defined
- **Source code: Not started** — No React app code exists yet (no `src/` directory)
- **Planning artifacts:**
  - [docs/project-description.md](docs/project-description.md) — the spec and requirements
  - [docs/development-process.md](docs/development-process.md) — the phased roadmap (5 phases, 17 milestones, 65+ tasks)
  - [.vibe/skills/generate-development-process/](.vibe/skills/generate-development-process/) — skill used to generate the roadmap
  - [.vibe/skills/orchestrate-development-process/](.vibe/skills/orchestrate-development-process/) — skill for multi-agent execution

## Goals

1. Accept CSV, TSV, XLS, XLSX and SQL files in the browser.
2. Parse and normalize datasets client-side.
3. Compute data profiles (nulls, duplicates, inconsistencies, outliers).
4. Generate a data dictionary and business insights via an LLM.
5. Present findings in a clear, consultant-facing UI.

## Next Steps

1. **Phase 1 — Project Foundation & File Upload:** Initialize Vite + React + TypeScript + Tailwind project, create responsive shell, implement drag-and-drop file upload component with file type validation.
2. **Phase 2 — Data Ingestion Pipeline:** Integrate parsers for CSV/TSV (native), XLS/XLSX (SheetJS), SQL (DDL+DML extraction), normalize all formats into Arquero tables.
3. **Phase 3 — Data Analysis Engine:** Column/type inference, descriptive statistics, outlier/duplicate/missing-value/mixed-type detection, date normalization.
4. **Phase 4 — LLM-Powered Insights:** Configure LLM provider, create prompt templates for data dictionary, business insights, and client questions.
5. **Phase 5 — Results Presentation & Polish:** Tabbed results UI, responsive/keyboard/cross-browser polish, downloadable report.

Full task-level detail lives in [docs/development-process.md](docs/development-process.md).

## How to Contribute

- Open an issue describing the feature or bug.
- Start a branch named `feat/<short-name>` or `fix/<short-name>`.
- Keep changes focused and small; prefer small PRs with a single goal.

## License

CC-BY-4.0
