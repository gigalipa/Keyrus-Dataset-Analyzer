# Development Process — Data Consultant App

## Purpose
This roadmap delivers a local React/Tailwind web application that enables consultants to upload client datasets (CSV, TSV, XLS, XLSX, SQL) and receive an immediate, honest assessment: data structure, quality issues, a data dictionary, business KPIs, insights, recommendations, and strategic client questions. The app runs entirely in-browser with no backend, no authentication, and no deployment — prioritizing a small, finished product over an ambitious, half-working one. It is sequenced to deliver visible value early (file upload and basic analysis first) while building toward the full LLM-powered insights.

## Domains covered
- Scope/requirements — keep features focused, exclude auth/backend/database
- Data/architecture — multi-format parsing, Arquero processing pipeline
- UX/UI — responsive design, drag-and-drop upload, clear non-technical presentation
- Core logic/computation — data profiling, quality checks, statistical analysis
- Integration — LLM provider setup, prompt engineering, API calls
- Quality/validation — error handling, data validation, testing with sample datasets
- Delivery/packaging — local React app, browser-compatible, no installation

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
- [ ] **Task:** Extract column metadata — *why:* Foundation for all subsequent analysis — *done when:* Array of column objects exists with names, indices, and sample values
- [ ] **Task:** Infer data types per column — *why:* Enables type-specific processing and validation — *done when:* Each column is classified as string, number, integer, float, date, boolean, or null
- [ ] **Task:** Calculate basic dataset statistics — *why:* Quantitative understanding of the data — *done when:* Total rows, total columns, file size in MB are available

#### Milestone 3.2 — Numeric column analysis
- [ ] **Task:** Calculate descriptive statistics — *why:* Core quantitative analysis — *done when:* For numeric columns: min, max, mean, median, mode, standard deviation, quartiles
- [ ] **Task:** Identify outliers using IQR method — *why:* Flags potentially erroneous or interesting data points — *done when:* Numeric columns show outlier boundaries (Q1 - 1.5*IQR, Q3 + 1.5*IQR) and list flagged values

#### Milestone 3.3 — Data quality checks
- [ ] **Task:** Detect missing values — *why:* Identifies data completeness issues — *done when:* Count and percentage of null/empty values reported per column
- [ ] **Task:** Find duplicate rows — *why:* Identifies data integrity issues — *done when:* Total duplicate count and sample of first 5 duplicate rows available
- [ ] **Task:** Check for inconsistent categorical values — *why:* Finds data entry errors or encoding issues — *done when:* For columns with <50 unique values, list all values and flag potential typos
- [ ] **Task:** Detect mixed data types — *why:* Identifies columns with inconsistent typing — *done when:* Columns containing multiple inferred types are flagged with examples

#### Milestone 3.4 — Date analysis
- [ ] **Task:** Identify date columns — *why:* Special handling for temporal data — *done when:* Columns with date-like strings (ISO, US, EU formats) are automatically detected
- [ ] **Task:** Calculate date range — *why:* Provides temporal context — *done when:* For date columns, min and max dates with duration are available
- [ ] **Task:** Flag future or very old dates — *why:* Identifies likely data errors — *done when:* Dates > today or < 1900 are flagged as potentially incorrect
- [ ] **Task:** Normalize detected dates to YYYY-MM-DD — *why:* Consistent format for downstream display and LLM context, per the resolved date-format decision — *done when:* All values in detected date columns are converted to YYYY-MM-DD before being passed to analysis or display

---

### Phase 4 — LLM-Powered Insights
**Purpose:** Use large language models to generate human-readable understanding, business insights, and strategic questions from the analyzed data.
**Definition of done:** LLM generates accurate data dictionary, KPIs, business insights, recommendations, and client questions based on the uploaded dataset.

#### Milestone 4.1 — LLM infrastructure
- [ ] **Task:** Configure DeepSeek and Google AI Studio clients — *why:* Enables the two providers the app relies on: DeepSeek for data-analysis calls, Google AI Studio for report-text generation — *done when:* Both clients read their keys from environment variables (`DEEPSEEK_API_KEY`, `GOOGLE_AI_STUDIO_API_KEY`), with `gemini-3.5-flash-lite` or `gemini-3.6-flash` configured as the Google AI Studio fallback model. No UI-based key entry — the no-backend/no-UI-key-entry decision means `.env` is the only supported path.
- [ ] **Task:** Add `.env.example` — *why:* Documents the required secrets for anyone cloning the repo, since keys are never entered via the UI — *done when:* `.env.example` lists `DEEPSEEK_API_KEY` and `GOOGLE_AI_STUDIO_API_KEY` as placeholders and is committed to the repo
- [ ] **Task:** Create prompt engineering utilities — *why:* Ensures consistent, high-quality outputs — *done when:* Helper functions exist for: building system prompts, adding context, formatting output
- [ ] **Task:** Implement error handling for LLM calls — *why:* Prevents app crashes on API failures — *done when:* Network errors, rate limits, and invalid responses show user-friendly messages
- [ ] **Task:** Add loading states for LLM operations — *why:* Improves user experience during API calls — *done when:* Spinner and "Generating insights..." message appear during LLM processing

#### Milestone 4.2 — Data dictionary generation
**Provider:** DeepSeek (data-analysis call, per Open Questions' LLM provider split)
- [ ] **Task:** Build data dictionary prompt template — *why:* Explains meaning of variables and dataset structure — *done when:* Prompt template includes: column names, sample values, data types, and dataset context
- [ ] **Task:** Implement LLM call for data dictionary — *why:* Automates data understanding — *done when:* Given column info, returns clear explanations of each field's purpose and meaning
- [ ] **Task:** Create data dictionary display component — *why:* Presents LLM output clearly — *done when:* Each column has: name, description, type, example values in a card-based layout

#### Milestone 4.3 — Business insights generation
**Provider:** DeepSeek (data-analysis call — KPIs/insights are derived from the analyzed dataset, per Open Questions' LLM provider split). *Assumption, not explicitly stated in the source docs — confirm before Phase 4 dispatch.*
- [ ] **Task:** Build business insights prompt template — *why:* Extracts KPIs and recommendations from data — *done when:* Prompt template asks for: 3-5 key KPIs, 3-5 insights, 3-5 actionable recommendations based on the analysis
- [ ] **Task:** Prepare analysis summary for LLM context — *why:* Provides data foundation for insights — *done when:* Structured summary includes: column descriptions, data quality issues, statistical highlights
- [ ] **Task:** Implement LLM call for business insights — *why:* Generates actionable business understanding — *done when:* Returns well-formatted KPIs, insights, and recommendations relevant to the data
- [ ] **Task:** Create business insights display component — *why:* Presents insights professionally — *done when:* KPIs show as metrics cards, insights and recommendations as bullet points with clear headings

#### Milestone 4.4 — Client questions generation
**Provider:** Google AI Studio (report-text/narrative generation, per Open Questions' LLM provider split). *Assumption, not explicitly stated in the source docs — confirm before Phase 4 dispatch.*
- [ ] **Task:** Build strategic questions prompt template — *why:* Helps consultant engage the client effectively — *done when:* Prompt template asks for 5-10 strategic questions a consultant should ask the client about their business and data
- [ ] **Task:** Include data context in prompt — *why:* Makes questions specific to the dataset — *done when:* Prompt includes: industry hints (if detectable), data quality concerns, gaps in the data
- [ ] **Task:** Implement LLM call for client questions — *why:* Generates consultant-client dialogue starters — *done when:* Returns 5-10 well-structured questions organized by topic
- [ ] **Task:** Create client questions display component — *why:* Presents questions in usable format — *done when:* Questions display as numbered list with copy-to-clipboard functionality

---

### Phase 5 — Results Presentation & Polish
**Purpose:** Present all analysis results in a clear, non-technical format that a client's IT manager can understand.
**Definition of done:** Complete, polished UI that displays all analysis results understandably across all device sizes.

#### Milestone 5.1 — Analysis results UI
- [ ] **Task:** Create data overview component — *why:* Shows dataset at a glance — *done when:* Displays: file name, row count, column count, file size, upload timestamp in a header card
- [ ] **Task:** Create data quality summary component — *why:* Highlights data issues — *done when:* Visual summary shows: missing value counts, duplicate counts, outlier counts with severity indicators
- [ ] **Task:** Create column detail view — *why:* Allows deep dive into specific columns — *done when:* Clicking a column shows: all statistics, sample values, quality issues for that column

#### Milestone 5.2 — Navigation and flow
- [ ] **Task:** Implement tab-based navigation — *why:* Organizes different result types — *done when:* Tabs for: Overview, Data Quality, Data Dictionary, Business Insights, Client Questions
- [ ] **Task:** Add sticky navigation — *why:* Easy access to sections in long results — *done when:* Tab bar stays visible at top when scrolling through results
- [ ] **Task:** Implement scroll-to-section — *why:* Quick navigation — *done when:* Clicking a tab scrolls to the corresponding section

#### Milestone 5.3 — Polish and refinement
- [ ] **Task:** Add loading skeletons — *why:* Smoother perceived performance — *done when:* Content areas show placeholder shapes while loading instead of empty space
- [ ] **Task:** Add copy-to-clipboard buttons — *why:* Enables easy sharing of results — *done when:* Insights, recommendations, and questions can be copied with one click
- [ ] **Task:** Implement responsive breakpoints — *why:* Ensures mobile usability — *done when:* UI tested and adjusted for: <640px (mobile), 640-1024px (tablet), >1024px (desktop)
- [ ] **Task:** Add keyboard navigation — *why:* Accessibility and power user experience — *done when:* Tab, Shift+Tab, Enter work correctly for all interactive elements
- [ ] **Task:** Add download report button — *why:* Allows saving results for offline review — *done when:* Click generates PDF or Markdown of all analysis results
- [ ] **Task:** Verify cross-browser compatibility — *why:* Ensures the app works for all officially supported browsers, per the resolved browser-support decision — *done when:* App is manually tested and confirmed working on latest Chrome, Firefox, Safari, and Edge

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
- **LLM provider choice:** The system will use DeepSeek's API for data analysis tasks, and Google AI Studio API for report text generation (generous free-tier models like gemini-3.5-flash-lite or gemini-3.6-flash as fallback model).
- **API key setup:** Due to the no-backend policy, the consultant won't be able to set up the API keys from the UI, so the system will be using a .env file for environmental secrets. There will be a .env.example file for GitHub repository.
- **LLM cost handling:** Only show warnings if token-consumption related warning are disclosed by the API responses.
- **Large file handling:** What should the hard limit be for file size? Up to 15Mb.
- **SQL parsing scope:** The app needs to support full SQL dumps (Schema + Data).When users export database records, tools like mysqldump or pg_dump generate a mix of DDL (to create the tables) and DML (the INSERT statements containing the actual records). The AI needs to understand the table schema (DDL) first, otherwise it won't have the context (like column names and data types) to accurately analyze the records that follow. We can skip complex database administration DDL (like triggers, views, or user permissions), but standard table definitions and data insertion must be fully supported.
- **Date format detection:** Which date formats should be auto-detected? The date format should be normalized to YYYY-MM-DD.
- **Error recovery:** When a file fails to parse, should the app offer to attempt partial parsing, or only show the error? Show the error and, if detected, the cause.
- **Privacy considerations:** Client data stays entirely in the browser (good for privacy), but should there be explicit messaging about this? No need.
- **Browser compatibility:** Which browsers should be officially supported? latest Chrome, Firefox, Safari, Edge.
