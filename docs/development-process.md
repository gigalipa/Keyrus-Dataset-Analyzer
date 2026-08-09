# Development Process — Data Consultant App

## Purpose
This roadmap delivers a local React/Tailwind web application that enables consultants to upload client datasets (CSV, TSV, XLS, XLSX, SQL) and receive an immediate, honest assessment: data structure, quality issues, a data dictionary, business KPIs, insights, recommendations, and strategic client questions. The app runs entirely in-browser with no backend, no authentication, and no deployment — prioritizing a small, finished product over an ambitious, half-working one. It is sequenced to deliver visible value early (file upload and basic analysis first) while building toward the full LLM-powered insights.

Phases 1-5 delivered the MVP against `docs/project-description.md` and are complete. Phases 6-11 extend the MVP per `docs/beyond-MVP.md`, a second spec addressing live MVP-testing feedback: the interface was comprehensive at a data-analysis level but not easy to use for non-technical, non-data-educated users. This batch reworks the app into a persistent, dashboard-style tool — local multi-dataset history, an automatic (not manual-trigger) LLM analysis pipeline, a top-bar/sidebar/viewport shell, business-facing dashboard/explanation views, and a real PDF report — while preserving every no-backend/no-auth/no-database constraint from the original spec.

## Domains covered
- Scope/requirements — keep features focused, exclude auth/backend/database
- Data/architecture — multi-format parsing, Arquero processing pipeline
- UX/UI — responsive design, drag-and-drop upload, clear non-technical presentation
- Core logic/computation — data profiling, quality checks, statistical analysis
- Integration — LLM provider setup, prompt engineering, API calls
- Quality/validation — error handling, data validation, testing with sample datasets
- Delivery/packaging — local React app, browser-compatible, no installation
- **Data persistence — client-side IndexedDB storage, multi-dataset history, reload durability (Phase 6+)**
- **Data visualization — dashboard charts, filterable/sortable card UIs (Phase 6+)**

## Roadmap

### Phase 1 — Project Foundation & File Upload
**Purpose:** Establish the React/Tailwind project and enable users to upload files — the absolute minimum for a working prototype.
**Definition of done:** A responsive React app with drag-and-drop file upload that accepts CSV, TSV, XLS, XLSX, SQL files.

#### Milestone 1.1 — Initialize project
- [X] **Task:** Create React app with Vite and Tailwind — *why:* Foundation for the entire application — *done when:* `npm run dev` starts a working React app with Tailwind CSS applied globally
- [X] **Task:** Set up project folder structure — *why:* Organizes code for maintainability and future growth — *done when:* Directories exist: `src/components`, `src/hooks`, `src/utils`, `src/lib`, `src/types`
- [X] **Task:** Configure ESLint and Prettier — *why:* Ensures consistent code quality and formatting — *done when:* Code formatting runs on save without errors, linting passes
- [X] **Task:** Initialize Git repository — *why:* Enables version control from the start — *done when:* `git status` shows tracked files, initial commit exists

#### Milestone 1.2 — Create upload UI
- [X] **Task:** Build responsive shell layout — *why:* Provides visual container for all UI elements — *done when:* App has header with title, main content area, and footer that render correctly on mobile (≥320px) and desktop (≥1200px)
- [X] **Task:** Create file upload component with drag-and-drop — *why:* Primary user interaction mechanism — *done when:* Users can drag files onto a clearly marked zone OR click to select, with visual feedback (border highlight, file name preview)
- [X] **Task:** Add file type validation — *why:* Prevents processing of unsupported formats — *done when:* Only files with extensions .csv, .tsv, .xls, .xlsx, .sql are accepted; others show a clear error message
- [X] **Task:** Display upload status — *why:* Informs user of progress — *done when:* Shows "Ready to upload", "Processing...", "Upload complete", or "Error: [message]" states

#### Milestone 1.3 — Add basic data display
- [X] **Task:** Create raw data preview component — *why:* Immediate feedback that upload worked — *done when:* First 100 rows of uploaded data display in a scrollable table
- [X] **Task:** Add dataset summary bar — *why:* Quick overview of what was loaded — *done when:* Shows row count, column count, and file name at top of results

---

### Phase 2 — Data Ingestion Pipeline
**Purpose:** Read and normalize all supported file formats into a common structure for Arquero processing.
**Definition of done:** Any supported file type uploads and converts to an Arquero table without errors.

#### Milestone 2.1 — CSV/TSV parsing
- [X] **Task:** Implement CSV/TSV file reader — *why:* Most common format for Lakeside's data — *done when:* CSV and TSV files with various delimiters parse into JavaScript arrays of objects
- [X] **Task:** Handle large file streaming — *why:* Prevents browser freezing or crashes — *done when:* Files up to 15MB can be processed without UI freeze or memory errors
- [X] **Task:** Detect and handle encoding issues — *why:* Client files may use different encodings — *done when:* UTF-8, ISO-8859-1, and Windows-1252 files display correctly

#### Milestone 2.2 — Excel parsing
- [X] **Task:** Integrate SheetJS (xlsx) library — *why:* Enables reading Excel files in the browser — *done when:* XLS and XLSX files parse correctly, preserving sheet structure
- [X] **Task:** Handle multi-sheet Excel files — *why:* Client data may be spread across sheets — *done when:* User can select which sheet to analyze, defaulting to first sheet
- [X] **Task:** Extract data from selected sheet — *why:* Focuses analysis on relevant data — *done when:* Selected sheet's data is converted to array of objects with column headers

#### Milestone 2.3 — SQL parsing
- [X] **Task:** Create SQL file parser — *why:* Supports SQL dump exports — *done when:* SQL files are parsed to extract table schema and sample data
- [X] **Task:** Handle CREATE TABLE and INSERT statements — *why:* Most common SQL dump format — *done when:* Schema is extracted from CREATE TABLE, data from INSERT statements
- [X] **Task:** Limit sample data extraction — *why:* Performance consideration — *done when:* Only first 1000 rows are extracted from INSERT statements

#### Milestone 2.4 — Normalization & Arquero integration
- [X] **Task:** Import and configure Arquero — *why:* Core data processing engine — *done when:* Arquero is available via CDN or bundle, can create tables from parsed data
- [X] **Task:** Normalize all formats to Arquero table — *why:* Unified processing pipeline — *done when:* CSV, TSV, XLS, XLSX, SQL all produce equivalent Arquero tables
- [X] **Task:** Create data validation step — *why:* Catches parse errors early with helpful messages — *done when:* Empty files, corrupt files, or unparseable data show a clear error instead of crashing, including the detected cause when one can be identified (e.g., wrong delimiter, missing header row, unsupported encoding), per the resolved error-recovery decision

---

### Phase 3 — Data Analysis Engine
**Purpose:** Perform computational analysis to automatically understand dataset structure, quality, and characteristics.
**Definition of done:** Complete analysis including columns, data types, missing values, duplicates, and outliers for any uploaded dataset.

#### Milestone 3.1 — Structural analysis
- [X] **Task:** Extract column metadata — *why:* Foundation for all subsequent analysis — *done when:* Array of column objects exists with names, indices, and sample values
- [X] **Task:** Infer data types per column — *why:* Enables type-specific processing and validation — *done when:* Each column is classified as string, number, integer, float, date, boolean, or null
- [X] **Task:** Calculate basic dataset statistics — *why:* Quantitative understanding of the data — *done when:* Total rows, total columns, file size in MB are available

#### Milestone 3.2 — Numeric column analysis
- [X] **Task:** Calculate descriptive statistics — *why:* Core quantitative analysis — *done when:* For numeric columns: min, max, mean, median, mode, standard deviation, quartiles
- [X] **Task:** Identify outliers using IQR method — *why:* Flags potentially erroneous or interesting data points — *done when:* Numeric columns show outlier boundaries (Q1 - 1.5*IQR, Q3 + 1.5*IQR) and list flagged values

#### Milestone 3.3 — Data quality checks
- [X] **Task:** Detect missing values — *why:* Identifies data completeness issues — *done when:* Count and percentage of null/empty values reported per column
- [X] **Task:** Find duplicate rows — *why:* Identifies data integrity issues — *done when:* Total duplicate count and sample of first 5 duplicate rows available
- [X] **Task:** Check for inconsistent categorical values — *why:* Finds data entry errors or encoding issues — *done when:* For columns with <50 unique values, list all values and flag potential typos
- [X] **Task:** Detect mixed data types — *why:* Identifies columns with inconsistent typing — *done when:* Columns containing multiple inferred types are flagged with examples

#### Milestone 3.4 — Date analysis
- [X] **Task:** Identify date columns — *why:* Special handling for temporal data — *done when:* Columns with date-like strings (ISO, US, EU formats) are automatically detected
- [X] **Task:** Calculate date range — *why:* Provides temporal context — *done when:* For date columns, min and max dates with duration are available
- [X] **Task:** Flag future or very old dates — *why:* Identifies likely data errors — *done when:* Dates > today or < 1900 are flagged as potentially incorrect
- [X] **Task:** Normalize detected dates to YYYY-MM-DD — *why:* Consistent format for downstream display and LLM context, per the resolved date-format decision — *done when:* All values in detected date columns are converted to YYYY-MM-DD before being passed to analysis or display

---

### Phase 4 — LLM-Powered Insights
**Purpose:** Use large language models to generate human-readable understanding, business insights, and strategic questions from the analyzed data.
**Definition of done:** LLM generates accurate data dictionary, KPIs, business insights, recommendations, and client questions based on the uploaded dataset.

#### Milestone 4.1 — LLM infrastructure
- [X] **Task:** Configure Mistral and Google AI Studio clients — *why:* Enables the two providers the app relies on: Mistral for data-analysis calls, Google AI Studio for report-text generation — *done when:* Both clients read their keys and model ids from environment variables (`VITE_MISTRAL_API_KEY`, `VITE_MISTRAL_MODEL_ID`, `VITE_MISTRAL_FALLBACK_MODEL_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_MODEL_ID`, `VITE_GOOGLE_FALLBACK_MODEL_ID` — the `VITE_` prefix is required for Vite to expose them to browser code via `import.meta.env`, since this app calls both providers directly from the client with no backend). Model ids are configurable via `.env` rather than hardcoded, so swapping models later doesn't require a code change. No UI-based key entry — the no-backend/no-UI-key-entry decision means `.env` is the only supported path.
- [X] **Task:** Add `.env.example` — *why:* Documents the required secrets for anyone cloning the repo, since keys are never entered via the UI — *done when:* `.env.example` lists `VITE_MISTRAL_API_KEY`, `VITE_MISTRAL_MODEL_ID`, `VITE_MISTRAL_FALLBACK_MODEL_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_MODEL_ID`, and `VITE_GOOGLE_FALLBACK_MODEL_ID` as placeholders and is committed to the repo
- [X] **Task:** Define the shared structured-insight JSON schema — *why:* The app serves different business cases, so the UI must render and filter LLM output (KPIs, insights, recommendations, questions, dictionary entries) without hardcoding content-specific layout or fixed counts; a single schema shared by Milestones 4.2-4.4 prevents each from inventing an incompatible shape (the same drift that happened with Phase 2's three parsers) — *done when:* A shared type (e.g. `InsightItem { id, type, title, description, tags[], priority?, metadata? }` grouped into `InsightGroup { type, label, minItems, maxItems, items[] }`) exists with runtime validation (e.g. via `zod`), and per-type quantity bounds are declared in one place — not hardcoded per component — as configurable data: KPIs 2-5, insights 3-5, recommendations 3+ (no hard cap), questions 2+ (no hard cap), dictionary entries one per analyzed column
- [X] **Task:** Create prompt engineering utilities — *why:* Ensures consistent, high-quality outputs — *done when:* Helper functions exist for: building system prompts, adding context, formatting output, and instructing the model to return JSON conforming to the shared schema (including its quantity bounds) for every structured-output call
- [X] **Task:** Implement error handling for LLM calls — *why:* Prevents app crashes on API failures — *done when:* Network errors, rate limits, invalid responses, and schema-invalid JSON (with at least one retry) show user-friendly messages. JSON parsing is layered to significantly reduce broken-structure failures before they ever reach the retry path: markdown-fence stripping → bracket-depth-aware extraction of the outermost JSON substring (handles leading/trailing prose) → strict `JSON.parse` → `jsonrepair` fallback (fixes trailing commas, unquoted keys, single quotes, truncated/unbalanced brackets) → `JSON.parse` again. Anything that still doesn't match the shape (including jsonrepair's fallback of wrapping unparseable prose as a bare string) is caught by `schema.ts`'s zod validation, not left to crash on a raw parse error.
- [X] **Task:** Add loading states for LLM operations — *why:* Improves user experience during API calls — *done when:* Spinner and "Generating insights..." message appear during LLM processing

#### Milestone 4.2 — Data dictionary generation
**Provider:** Mistral (data-analysis call, per Open Questions' LLM provider split, per the actual .env configuration)
- [X] **Task:** Build data dictionary prompt template — *why:* Explains meaning of variables and dataset structure — *done when:* Prompt template includes: column names, sample values, data types, and dataset context, and requests output conforming to the shared `InsightItem`/`InsightGroup` schema (one dictionary-entry item per column)
- [X] **Task:** Implement LLM call for data dictionary — *why:* Automates data understanding — *done when:* Given column info, returns clear explanations of each field's purpose and meaning as schema-conformant, runtime-validated JSON
- [X] **Task:** Create data dictionary display component — *why:* Presents LLM output clearly and lets the UI filter/adapt to content generically — *done when:* Renders from the shared schema (not a bespoke shape): each column has name, description, type, example values in a card-based layout, with tag-based filtering (e.g. filter by data-quality concern, by data type)

#### Milestone 4.3 — Business insights generation
**Provider:** Mistral (data-analysis call, per Open Questions' LLM provider split, per the actual .env configuration). *Routing confirmed during Milestone 4.1's dispatch.*
- [X] **Task:** Build business insights prompt template — *why:* Extracts KPIs and recommendations from data — *done when:* Prompt template requests three schema-conformant `InsightGroup`s — KPIs (2-5 items), insights (3-5 items), recommendations (3 or more items) — each item tagged for filtering (e.g. by business domain, by confidence/severity)
- [X] **Task:** Prepare analysis summary for LLM context — *why:* Provides data foundation for insights — *done when:* Structured summary includes: column descriptions, data quality issues, statistical highlights
- [X] **Task:** Implement LLM call for business insights — *why:* Generates actionable business understanding — *done when:* Returns well-formatted KPIs, insights, and recommendations relevant to the data as schema-conformant, runtime-validated JSON meeting the quantity bounds above
- [X] **Task:** Create business insights display component — *why:* Presents insights professionally and lets the UI filter/adapt to content generically — *done when:* Renders from the shared schema: KPIs show as metrics cards, insights and recommendations as bullet points with clear headings, with tag-based filtering across all three groups

#### Milestone 4.4 — Client questions generation
**Provider:** Google AI Studio (report-text/narrative generation, per Open Questions' LLM provider split). *Routing confirmed during Milestone 4.1's dispatch.*
- [X] **Task:** Build strategic questions prompt template — *why:* Helps consultant engage the client effectively — *done when:* Prompt template requests a schema-conformant `InsightGroup` of 2 or more strategic questions a consultant should ask the client, each tagged by topic for filtering
- [X] **Task:** Include data context in prompt — *why:* Makes questions specific to the dataset — *done when:* Prompt includes: industry hints (if detectable), data quality concerns, gaps in the data
- [X] **Task:** Implement LLM call for client questions — *why:* Generates consultant-client dialogue starters — *done when:* Returns 2 or more well-structured questions organized by topic as schema-conformant, runtime-validated JSON
- [X] **Task:** Create client questions display component — *why:* Presents questions in usable format and lets the UI filter/adapt to content generically — *done when:* Renders from the shared schema: questions display as a numbered list with copy-to-clipboard functionality, with topic-tag filtering

---

### Phase 5 — Results Presentation & Polish
**Purpose:** Present all analysis results in a clear, non-technical format that a client's IT manager can understand.
**Definition of done:** Complete, polished UI that displays all analysis results understandably across all device sizes.

#### Milestone 5.1 — Analysis results UI
- [X] **Task:** Create data overview component — *why:* Shows dataset at a glance — *done when:* Displays: file name, row count, column count, file size, upload timestamp in a header card
- [X] **Task:** Create data quality summary component — *why:* Highlights data issues — *done when:* Visual summary shows: missing value counts, duplicate counts, outlier counts with severity indicators
- [X] **Task:** Create column detail view — *why:* Allows deep dive into specific columns — *done when:* Clicking a column shows: all statistics, sample values, quality issues for that column

#### Milestone 5.2 — Navigation and flow
- [X] **Task:** Implement tab-based navigation — *why:* Organizes different result types — *done when:* Tabs for: Overview, Data Quality, Data Dictionary, Business Insights, Client Questions
- [X] **Task:** Add sticky navigation — *why:* Easy access to sections in long results — *done when:* Tab bar stays visible at top when scrolling through results
- [X] **Task:** Implement scroll-to-section — *why:* Quick navigation — *done when:* Clicking a tab scrolls to the corresponding section

#### Milestone 5.3 — Polish and refinement
- [X] **Task:** Add loading skeletons — *why:* Smoother perceived performance — *done when:* Content areas show placeholder shapes while loading instead of empty space
- [X] **Task:** Add copy-to-clipboard buttons — *why:* Enables easy sharing of results — *done when:* Insights, recommendations, and questions can be copied with one click
- [X] **Task:** Implement responsive breakpoints — *why:* Ensures mobile usability — *done when:* UI tested and adjusted for: <640px (mobile), 640-1024px (tablet), >1024px (desktop)
- [X] **Task:** Add keyboard navigation — *why:* Accessibility and power user experience — *done when:* Tab, Shift+Tab, Enter work correctly for all interactive elements
- [X] **Task:** Add download report button — *why:* Allows saving results for offline review — *done when:* Click generates PDF or Markdown of all analysis results
- [X] **Task:** Verify cross-browser compatibility — *why:* Ensures the app works for all officially supported browsers, per the resolved browser-support decision — *done when:* App is manually tested and confirmed working on latest Chrome, Firefox, Safari, and Edge

---

### Phase 6 — Persistent Storage & Multi-Dataset History
**Source:** `docs/beyond-MVP.md` — "All the information remains stored in localstorage... The 'Upload a dataset' modal will only pop up if there's no dataset in the history" and the History sidebar spec.
**Purpose:** Build the local persistence layer everything else in Phase 6+ depends on — without it, there's nothing to route to on reload, nothing for a History sidebar to list, and no "cleaned vs raw" pair to compare later. Comes first because every later phase in this batch either writes to or reads from it.
**Definition of done:** A user can upload a dataset, close the tab, reopen the app, and see the same dataset/analysis/LLM output without any new network calls; multiple datasets can be stored, listed, switched between, and deleted.

#### Milestone 6.1 — IndexedDB data layer
- [X] **Task:** Design the persisted-dataset record shape — *why:* every later phase (history list, dashboard, data views, PDF export) reads from one consistent shape, so it must be defined before anything is built on top of it — *done when:* a documented TypeScript type covers: id, file name, upload timestamp, raw parsed table, cleaned/normalized Arquero table, full Phase 3 analysis result, and the LLM outputs (data dictionary, business insights/KPIs, explanation, questions) each with a status (`pending|running|done|error`) so the automated pipeline in Phase 8 can resume mid-sequence
- [X] **Task:** Implement the IndexedDB wrapper (`src/lib/storage/`) — *why:* IndexedDB's native API is callback-heavy; a thin wrapper (e.g. using the `idb` npm package) keeps call sites simple — *done when:* `createDataset`, `getDataset`, `listDatasets`, `updateDataset`, `deleteDataset` exist, are promise-based, and round-trip a full record (including the Arquero tables, serialized) without data loss, verified by a save-then-reload test using the fixture dataset from Phase 2
- [X] **Task:** Add a storage-quota guard — *why:* IndexedDB quotas are large but not unlimited, and the app must fail predictably rather than silently corrupt state — *done when:* a `navigator.storage.estimate()` check runs before each save; on likely-insufficient space, the user sees a clear message rather than a silent failure or a half-written record

#### Milestone 6.2 — History sidebar & empty-state flow
- [X] **Task:** Build the right-side History panel — *why:* per beyond-MVP.md, the History button (top bar, clock+counter-clockwise-arrow icon) rolls in a sidebar listing every stored dataset — *done when:* clicking History slides in a panel listing all datasets from `listDatasets()` (name, upload date), each with a Delete button, plus a "New dataset" button at the top
- [X] **Task:** Wire dataset switching — *why:* the consultant needs to move between previously analyzed client datasets without re-uploading — *done when:* clicking a history entry loads that record's data into the current view without any parsing/LLM calls (data comes straight from IndexedDB)
- [X] **Task:** Implement delete + auto-collapse-to-empty-state — *why:* explicit behavior from the spec: "If every dataset is deleted, the sidebar will collapse automatically and the 'Upload a dataset' modal will pop up" — *done when:* deleting the last remaining dataset closes the History panel and immediately shows the upload modal
- [X] **Task:** Implement the upload modal's conditional display — *why:* per the spec, the modal "will only pop up if there's no dataset in the history" — *done when:* on app load, if `listDatasets()` returns any record, the most recently used one loads automatically and no modal appears; if empty, the upload modal appears immediately

**Checkpoint:** None — this phase is self-contained and mechanically verifiable (save, reload, list, delete).

---

### Phase 7 — Application Shell Redesign
**Source:** `docs/beyond-MVP.md` — the top bar / left bar / center viewport layout description.
**Purpose:** Replace the current single-column tabbed layout with the dashboard-style shell (top bar + left sidebar + center viewport) beyond-MVP.md calls for, so later phases have somewhere to mount their content. Comes after Phase 6 because the top bar's History button and the sidebar's dataset-dependent state need a working persistence layer to be meaningful, not stubbed.
**Definition of done:** The app renders the new shell (top bar, collapsible left sidebar, center viewport) on both desktop and mobile, with navigation working end-to-end even before Phase 8-10 populate the destination sections with final content.

#### Milestone 7.1 — Top bar
- [X] **Task:** Build the top bar shell — *why:* fixed reference point across every view — *done when:* renders logo+title on desktop (logo only on mobile, per spec) in the left corner, a KPI-card region (populated for real in Phase 8/9), and a History button (clock, counter-clockwise-arrow icon) in the right corner
- [X] **Task:** Make the History button conditionally visible — *why:* per the user path, "the History button on the right side of the top bar becomes visible" only once processing completes — *done when:* the button is hidden while no dataset is loaded or the pipeline is still running, and appears once a dataset's pipeline reaches a displayable state
- [X] **Task:** Add an unread/count badge to the History button — *why:* spec calls it a "clock with counter-clockwise arrow" and the panel it opens is a *history* of datasets — *done when:* the button shows the current count of stored datasets

#### Milestone 7.2 — Left sidebar navigation
- [X] **Task:** Build the two-section left sidebar — *why:* the spec's core navigation structure — *done when:* renders a "Business information" group (Dashboard, Explanation, Business Insights, Questions) and a "Data" group (Overview, Data Dictionary, Quality, Datasets), each item routing to its section
- [X] **Task:** Implement mobile collapsibility — *why:* explicit spec requirement — *done when:* below the 640px breakpoint the sidebar collapses behind a toggle and doesn't obstruct the center viewport by default
- [X] **Task:** Add the sidebar footer action buttons (structural only) — *why:* per the user path, "Download PDF Report" and "Upload new dataset" appear at the bottom of the left bar once processing completes — *done when:* both buttons render conditionally (hidden until a dataset finishes processing) and are wired to stub handlers (real behavior lands in Phase 11 and Milestone 6.2's upload flow respectively)

#### Milestone 7.3 — Center viewport routing
- [X] **Task:** Implement client-side section routing — *why:* clicking a sidebar item must show that section in the center viewport without a page reload — *done when:* each of the 8 sidebar destinations renders a (possibly placeholder, pre-Phase-8/9/10) section in the center viewport, and the active sidebar item is visually highlighted
- [X] **Task:** Migrate the loading overlay to the new shell — *why:* the existing per-panel loading states (Phase 4/5) don't fit the new "one full-screen overlay while the whole pipeline runs" model from the user path — *done when:* a full-viewport overlay with a spinner exists and can display an arbitrary status line, wired for real content in Phase 8

**Checkpoint: Yes — first user-visible layout change.** This replaces the entire navigation model Phase 5 built; cheap to correct now, before Phase 8-10 wire real content into it.

---

### Phase 8 — Automated Sequential LLM Pipeline & Loading Experience
**Source:** `docs/beyond-MVP.md` — "The LLMs queries will run all automatically upon file uploading, one after the other, each one of them receiving feedback from the previous 'analysis' step" and the loading-overlay status-line behavior.
**Purpose:** Replace Phase 4's manual "Generate" buttons with an automatic, chained sequence so each LLM call has the richest possible context from the calls before it — this is the behavioral core of beyond-MVP.md's UX intent, not a cosmetic change.
**Definition of done:** Uploading a file triggers ETL/EDA (already-built Phase 2/3 pipeline) followed automatically by data dictionary → business insights/KPIs → explanation → client questions, each step's output available as input context to the next, with the loading overlay's status line reflecting the current step, and no manual trigger buttons remaining.

#### Milestone 8.1 — Chained context pipeline
- [ ] **Task:** Define the pipeline's step sequence and context contract — *why:* each step needs to know exactly what upstream output it receives — *done when:* a documented, ordered list of steps (parse → analyze → data dictionary → business insights/KPIs → explanation → client questions) exists, with each step's function signature explicitly accepting the accumulated context object from prior steps
- [ ] **Task:** Implement the pipeline runner (`src/lib/pipeline/`) — *why:* centralizes what today is scattered per-panel trigger logic — *done when:* a single function runs all steps in order against a freshly parsed file, persisting each step's result to IndexedDB (Milestone 6.1) as it completes (so a mid-pipeline reload can resume rather than restart), and stopping cleanly with a per-step error state if one step fails without blocking the ones already completed
- [ ] **Task:** Feed prior-step output into each subsequent LLM prompt — *why:* this is the actual point of automatic chaining per the spec ("each one of them receiving feedback from the previous... step") — *done when:* the business-insights prompt includes the generated data dictionary as context, the explanation prompt includes both, and the client-questions prompt includes all three — verified by inspecting the actual prompt payloads sent for the fixture dataset
- [ ] **Task:** Remove the manual "Generate"/"Regenerate" trigger buttons — *why:* superseded by automatic chaining; keeping both would be contradictory UX — *done when:* `BusinessInsightsPanel` and `ClientQuestionsPanel`'s manual-trigger code (added in Phase 4/5) is removed, and their content now renders directly from the pipeline-populated record; a single "Re-run analysis" affordance (not per-section) covers the retry case instead

#### Milestone 8.2 — Loading overlay content
- [ ] **Task:** Implement stage-by-stage status text — *why:* explicit user-path requirement — the spinner "spins while the system processes the dataset, the text line reflects the current status" — *done when:* the overlay (built structurally in Milestone 7.3) shows one of: "Understanding data...", "Cleaning data...", "Generating KPIs...", "Explaining business insights...", "Preparing client questions..." mapped to the pipeline's actual current step, not a fixed timer
- [ ] **Task:** Lock interaction during processing — *why:* per the spec, "everything locks under a loading overlay" — *done when:* the shell (sidebar, top bar KPI cards, viewport) is non-interactive and visually indicates the lock while the pipeline runs for the active dataset

#### Milestone 8.3 — Business-significant KPI cards
- [ ] **Task:** Distinguish business KPIs from data-profile stats — *why:* explicit spec correction — the top-bar cards are "not about the data itself but the information this data conveys about the business" (contrast with Phase 5's data-stat-focused overview card) — *done when:* the business-insights prompt (Milestone 8.1) explicitly separates "business KPIs" (e.g. estimated revenue concentration, customer segment split) from data-quality stats, using the existing KPI `InsightGroup` bounds (2-5 items) from `schema.ts`
- [ ] **Task:** Render KPI cards in the top bar — *why:* completes Milestone 7.1's stub region — *done when:* the top bar shows 2-5 compact KPI cards populated from the pipeline's business-insights output once the pipeline finishes, updating when the user switches datasets via History

**Checkpoint: Yes — mandatory, same reason as MVP Phase 4.** Live LLM calls, prompt-chaining behavior, and removal of the manual-trigger UX all need a real look before Phase 9/10 build views on top of this output.

---

### Phase 9 — Business-Facing Views
**Source:** `docs/beyond-MVP.md` — Dashboard, Explanation, Business Insights, and Questions section specs under "Business information."
**Purpose:** Build the four left-sidebar destinations aimed at the non-technical reader — this is the phase that most directly answers the original usability gap ("not yet easy to use for non-technical, non-data-educated users") that motivated this whole batch of work.
**Definition of done:** All four Business Information sections render real, pipeline-sourced content (no placeholders), with the Dashboard's filters affecting every piece of information shown in it, and Business Insights/Questions independently filterable by tag and sortable by importance.

#### Milestone 9.1 — Dashboard
- [ ] **Task:** Select and integrate Recharts — *why:* no charting library exists yet; needed for the interactive graphs the spec calls for — *done when:* `recharts` is added as a dependency and a first chart renders real data from the fixture dataset
- [ ] **Task:** Build the Dashboard layout — *why:* the spec's central business-facing view — *done when:* renders KPIs, notices (e.g. data-quality flags surfaced in business language), quick insights, and at least 2 chart types (e.g. a trend line and a category breakdown) sourced from the pipeline's business-insights output plus the underlying cleaned dataset
- [ ] **Task:** Implement dashboard-wide filters — *why:* explicit requirement — "filters which affect every piece of information shown in it" — *done when:* at least one filter control (e.g. a date-range or category filter, chosen based on what the fixture dataset supports) changes the KPIs, notices, insights, and every chart simultaneously, not just one widget

#### Milestone 9.2 — Explanation
- [ ] **Task:** Build the explanation prompt and section — *why:* spec calls for "a simple yet comprehensive explanation... business model, business health status, what's good, and the most important points to consider" — *done when:* the pipeline (Milestone 8.1) generates this narrative text as its own step, and the Explanation section renders it in plain, jargon-free prose, not a bulleted data dump

#### Milestone 9.3 — Business Insights rework
- [ ] **Task:** Add importance to the shared insight schema — *why:* the current `InsightItem` schema (`priority?`) needs a concrete, consistently-populated importance field for this section's sort — *done when:* `schema.ts`'s business-insights `InsightGroup` items reliably populate `priority` (e.g. high/medium/low) rather than leaving it optional/unused
- [ ] **Task:** Rebuild the Business Insights section as filter/sort cards — *why:* explicit UI requirement — "filter them by tags or importance, and sort them by importance" — *done when:* each insight renders as a card (title, description, importance, tags), with working tag-filter controls and an importance sort toggle; apply the "Filterable Card List Checklist" below

#### Milestone 9.4 — Questions rework
- [ ] **Task:** Add importance to client questions — *why:* mirrors the insights change; questions currently only carry topic tags — *done when:* the client-questions `InsightGroup` items carry a populated importance/priority field
- [ ] **Task:** Rebuild the Questions section as filter/sort cards — *why:* same requirement pattern as Business Insights — *done when:* renders per the "Filterable Card List Checklist," with tag and importance filter/sort matching Milestone 9.3's UX so the two sections feel consistent

**Checkpoint:** None required beyond the Phase 8 checkpoint already covering pipeline output — these are display-layer tasks over already-verified data, mechanically checkable against the fixture dataset.

---

### Phase 10 — Data Views Rework
**Source:** `docs/beyond-MVP.md` — Overview, Data Dictionary, Quality, and Datasets section specs under "Data."
**Purpose:** Migrate and extend Phase 5's existing data-analysis components into the new sidebar structure, and add the one genuinely new capability this section requires: an audit trail explaining *why* the system changed anything in the raw data, so a data analyst reviewing the app can trust it.
**Definition of done:** All four Data sections render under the new shell; Quality includes a real audit trail of every automated modification; Datasets shows a working raw-vs-cleaned comparison with both downloadable.

#### Milestone 10.1 — Overview migration
- [ ] **Task:** Migrate `DataOverviewCard`/`ColumnDetailView` into the Data → Overview destination — *why:* this content already exists and is correct (Phase 5); it only needs to move into the new navigation shell — *done when:* Overview renders identically to its Phase 5 behavior, reachable via the new left sidebar instead of the old tab bar

#### Milestone 10.2 — Data Dictionary migration
- [ ] **Task:** Migrate the Data Dictionary panel into the Data → Data Dictionary destination — *why:* existing, correct content (Phase 4/5), now auto-populated by the Phase 8 pipeline instead of its old standalone auto-effect — *done when:* renders the pipeline's data-dictionary output under the new navigation, with the tag-based filtering it already has intact

#### Milestone 10.3 — Quality + audit trail
- [ ] **Task:** Add a transformation audit log to the analysis engine — *why:* new core-logic requirement — the spec wants a data analyst to "understand the reason behind every modification to the raw dataset," which nothing in Phase 2/3 currently records — *done when:* `src/lib/analysis/` and `src/lib/parsers/` emit a structured log entry (what changed, why, how many rows affected) for each automated modification already being made silently today (e.g. date normalization to YYYY-MM-DD, encoding fallback, any value coercion), collected into the persisted record from Milestone 6.1
- [ ] **Task:** Migrate `DataQualitySummaryCard` into Data → Quality — *why:* existing content, new location — *done when:* renders identically to Phase 5 behavior under the new shell
- [ ] **Task:** Build the "how issues were managed" explanatory section — *why:* the new half of this destination, per the spec — *done when:* renders the audit log from the task above in plain language grouped by transformation type, with affected-row counts, positioned alongside the existing quality summary

#### Milestone 10.4 — Datasets (raw vs. cleaned comparison)
- [ ] **Task:** Build the side-by-side comparison view — *why:* explicit spec requirement so a reviewer can see exactly what changed — *done when:* renders the first 50 rows of the raw parsed table and the first 50 rows of the cleaned/normalized Arquero table side by side, both sourced from the Milestone 6.1 persisted record
- [ ] **Task:** Add full-dataset downloads for both versions — *why:* spec: "they're both fully downloadable from here" — *done when:* two download buttons produce a complete (not 50-row-limited) CSV of the raw and cleaned datasets respectively

**Checkpoint:** None required — migrations are mechanically verifiable against Phase 5's existing behavior, and the audit-trail addition is checkable against the fixture dataset's known planted issues (same fixture used since Phase 2).

---

### Phase 11 — PDF Report & Final Polish
**Source:** `docs/beyond-MVP.md` — the "Download PDF Report" button in the user path; general cross-cutting fit-and-finish for the new architecture.
**Purpose:** Close out this batch of work: deliver the one concretely new deliverable (a real PDF, not the MVP's Markdown-only download) and re-verify the polish guarantees Phase 5 already established still hold across the entirely new shell/navigation/persistence model.
**Definition of done:** The left sidebar's "Download PDF Report" button produces a complete, real PDF covering every generated section; the app re-passes the same responsive/keyboard/cross-browser bar Phase 5 set, now against the new shell.

#### Milestone 11.1 — PDF report generation
- [ ] **Task:** Integrate jsPDF + html2canvas — *why:* chosen client-side, no-backend approach for real PDF output (vs. Phase 5's Markdown-only download) — *done when:* both are added as dependencies and a minimal proof renders one section of the app to a downloadable PDF page
- [ ] **Task:** Build the full report generator — *why:* the deliverable itself — *done when:* clicking "Download PDF Report" produces a multi-page PDF covering Dashboard KPIs/charts, Explanation, Business Insights, Questions, and the Data Quality summary, in a client-presentable layout (not a raw screenshot dump)
- [ ] **Task:** Wire the sidebar footer button for real — *why:* completes Milestone 7.2's stub — *done when:* the "Download PDF Report" button (visible once the pipeline completes, per the user path) triggers the generator above

#### Milestone 11.2 — Cross-cutting re-verification
- [ ] **Task:** Re-verify responsive breakpoints — *why:* the entire layout model changed (tab bar → top bar + sidebar + viewport); Phase 5's pass no longer covers it — *done when:* the new shell (including collapsible sidebar and History panel) is confirmed usable at <640px, 640-1024px, and >1024px
- [ ] **Task:** Re-verify keyboard navigation — *why:* same reasoning — new interactive elements (History panel, sidebar nav, dashboard filters, card sort/filter controls) didn't exist during Phase 5's pass — *done when:* Tab/Shift+Tab/Enter reach every new interactive element in a sensible order
- [ ] **Task:** Re-verify cross-browser compatibility — *why:* same reasoning, per the resolved browser-support decision — *done when:* the rebuilt app is manually confirmed working on latest Chrome, Firefox, Safari, and Edge

**Checkpoint: Yes — mandatory, end of this roadmap batch.** Same pattern as the MVP's Phase 5 checkpoint: run a full code-review pass across the diff before considering this batch closed.

---

## Reusable checklists

### LLM Integration Checklist
Apply this to each LLM-powered feature (data dictionary, business insights, client questions).
- [ ] Define clear, specific purpose for this LLM call
- [ ] Identify all required context/data to include in prompt
- [ ] Write prompt template with structured output requirements
- [ ] Set up API call with timeout handling (max 60 seconds)
- [ ] Implement error handling for network failures, rate limits, invalid responses
- [ ] Parse and validate LLM response structure
- [ ] Display formatted results in appropriate UI component
- [ ] Add loading state with spinner and status message
- [ ] Add error state with clear message and retry option
- [ ] Test with edge cases (empty dataset, single column, etc.)

### React Component Checklist
Apply this to each new UI component.
- [ ] Create component file in appropriate directory (`src/components/[category]/`)
- [ ] Define TypeScript interface or PropTypes for props
- [ ] Implement component with clear separation of concerns
- [ ] Add Tailwind CSS classes for styling (avoid inline styles)
- [ ] Ensure responsive design with appropriate breakpoints
- [ ] Add accessibility attributes (aria-labels, aria-describedby, role)
- [ ] Add keyboard navigation support where applicable
- [ ] Test rendering on mobile viewport (320px wide)
- [ ] Connect to state management (context, Zustand, or props)
- [ ] Add JSDoc comments for public functions

### File Parser Checklist
Apply this to each file format parser.
- [ ] Research and select appropriate parsing library
- [ ] Install library via npm or CDN
- [ ] Configure library with optimal settings
- [ ] Write parsing function that returns consistent output format
- [ ] Handle parsing errors gracefully with user-friendly messages
- [ ] Validate parsed data structure (array of objects with consistent keys)
- [ ] Test with minimum 3 sample files of the target format
- [ ] Document known limitations (max file size, format quirks)
- [ ] Add file size check before parsing (warn if >15MB)
- [ ] Implement timeout for parsing operations

### Filterable Card List Checklist
Apply this to each card-based list that needs tag filtering and importance sorting (Business Insights, Questions — Phase 9).
- [ ] Render each item as a card: title, description, importance indicator, tag chips
- [ ] Derive the available tag-filter options from the actual items present (no hardcoded tag list)
- [ ] Implement multi-select tag filtering (AND or OR — pick one and keep it consistent across sections)
- [ ] Implement importance sort (high → low), stable for ties
- [ ] Show an empty state when a filter combination matches nothing
- [ ] Keep filter/sort state per-section, not shared globally
- [ ] Add keyboard access to filter/sort controls

### Data Quality Check Checklist
Apply this to each quality check function.
- [ ] Define what the check detects (missing, duplicates, outliers, etc.)
- [ ] Implement detection logic using Arquero operations
- [ ] Return structured result: {checkName, description, count, percentage, affectedColumns, sampleItems}
- [ ] Handle edge cases (empty dataset, single row, all nulls)
- [ ] Add severity classification (info, warning, error)
- [ ] Write unit test with known-issue dataset
- [ ] Document false positive risks

---

## Deferred / out of scope
- **Authentication system** — *why deferred:* Explicitly out of scope per requirements; local app doesn't need user accounts — *revisit when:* If sharing reports between consultants becomes a requirement
- **Backend service** — *why deferred:* Explicitly out of scope; keeps app simple and deployable nowhere — *revisit when:* If file size limits (>15MB) become a real constraint
- **Database persistence** — *why deferred:* Explicitly out of scope; all processing happens in memory — *revisit when:* If saving analysis results for later becomes necessary
- **User accounts / project management** — *why deferred:* Adds complexity without clear benefit for single-file analysis — *revisit when:* If consultants need to track multiple client analyses over time
- **Real-time collaboration features** — *why deferred:* Not requested, adds significant complexity — *revisit when:* If multiple consultants need to work on same dataset simultaneously
- **Advanced statistical analysis** — *why deferred:* Beyond scope of "first read" assessment — *revisit when:* If clients request deeper statistical modeling
- **Data export to other formats** — *why deferred:* Current focus is analysis, not transformation — *revisit when:* If consultants need to export cleaned data
- **Multi-language support** — *why deferred:* Initial focus on English-speaking clients — *revisit when:* If international clients are targeted

---

## Open questions
- **LLM provider choice:** The system uses Mistral's API for data analysis tasks, and Google AI Studio API for report text generation (both configured with primary and fallback model ids via `.env`).
- **API key setup:** Due to the no-backend policy, the consultant won't be able to set up the API keys from the UI, so the system will be using a .env file for environmental secrets. There will be a .env.example file for GitHub repository.
- **LLM cost handling:** Only show warnings if token-consumption related warning are disclosed by the API responses.
- **Large file handling:** What should the hard limit be for file size? Up to 15Mb.
- **SQL parsing scope:** The app needs to support full SQL dumps (Schema + Data).When users export database records, tools like mysqldump or pg_dump generate a mix of DDL (to create the tables) and DML (the INSERT statements containing the actual records). The AI needs to understand the table schema (DDL) first, otherwise it won't have the context (like column names and data types) to accurately analyze the records that follow. We can skip complex database administration DDL (like triggers, views, or user permissions), but standard table definitions and data insertion must be fully supported.
- **Date format detection:** Which date formats should be auto-detected? The date format should be normalized to YYYY-MM-DD.
- **Error recovery:** When a file fails to parse, should the app offer to attempt partial parsing, or only show the error? Show the error and, if detected, the cause.
- **Privacy considerations:** Client data stays entirely in the browser (good for privacy), but should there be explicit messaging about this? No need.
- **Browser compatibility:** Which browsers should be officially supported? latest Chrome, Firefox, Safari, Edge.
- **Local persistence mechanism (Phase 6, resolved):** `docs/beyond-MVP.md` says "localStorage," but datasets can be up to 15MB, exceeding literal localStorage's practical quota. Resolved: IndexedDB is used as the actual storage mechanism (still 100% client-side, no backend) — "localStorage" in the spec is treated as shorthand for "persists locally," not the literal Web Storage API.
- **Charting library (Phase 9, resolved):** No charting library existed pre-Phase 6. Resolved: Recharts.
- **PDF export approach (Phase 11, resolved):** MVP deferred PDF entirely (Markdown only). Resolved: jsPDF + html2canvas, client-side, no backend.
