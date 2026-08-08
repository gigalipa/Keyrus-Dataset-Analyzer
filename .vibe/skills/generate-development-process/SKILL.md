---
name: generate-development-process
description: Generate a granular, step-by-step Development Process roadmap for a software project, grounded in a project description/spec file and shaped by OMIMO's NUPP (Nearly Universal Principles of Projects) and the P1.express granularity model. Use this whenever the user asks to "create a development process," "build a roadmap," "plan out the project," "break this down into steps/phases/tasks," or points at a project description, spec, PRD, or requirements file and wants an actionable execution plan. Also trigger if the user mentions NUPP, P1.express, OMIMO, or asks for a "granular"/"comprehensive" roadmap for a project — even if they don't name this skill explicitly.
license: CC-BY-4.0
compatibility: none — pure reasoning/writing skill, no runtime dependencies
user-invocable: true
allowed-tools: read_file write_file grep glob ask_user_question
---

# Generate Development Process

You produce a **Development Process** document: a comprehensive, granular, step-by-step roadmap for building the software project described in the user's project file. The roadmap must be genuinely actionable — someone should be able to pick up any single task in it and start working, without having to first figure out what it actually means.

This isn't a generic "write a project plan" task. Two OMIMO resources shape *how* the roadmap is built, not just its content:

- **NUPP** (`references/nupp-principles.md`) supplies the principles that keep the roadmap honest — purpose-driven, holistic, energy-conscious, proactive, repeatable, and free of methodology-cargo-culting.
- **P1.express** (`references/p1express-granularity.md`) supplies the granularity model — nested cycles (phase → milestone → workstream → task), a strict definition of what makes a task "closable," and the postpone-rather-than-bury discipline for out-of-scope ideas.

Read both reference files before drafting. They're short — treat them as the lens you look through while writing, not boilerplate to quote.

## Step 1 — Find and read the project description

Look for a project description, spec, PRD, or requirements file. Common locations, in order of likelihood: `docs/project-description.md`, `docs/PRD.md`, `README.md`, or whatever file the user pointed at directly. If nothing obvious exists, ask the user which file to use — don't guess at project scope from a vague conversation.

Read the whole file. Extract, explicitly, before writing anything else:

1. **The core problem** being solved and for whom.
2. **Hard requirements** — technical constraints, stack choices, things explicitly mandated.
3. **Expected outcome(s)** — what "done" looks like, ideally as a numbered/enumerable list if the source gives you one.
4. **Explicit non-goals or scope limits** — anything the source says to *avoid* (e.g. "no backend," "no auth," "keep it simple"). These are as important as the requirements: a roadmap that adds scope the source explicitly ruled out has failed NUP5.

If the description is ambiguous or missing information you need to sequence the work (e.g. no mention of testing expectations, deployment target, timeline), don't invent specifics — either ask the user or flag the gap in the roadmap's "Open questions" section (see structure below) rather than silently assuming.

## Step 2 — Identify the domains in play (NUP4)

Before phasing anything, list the domains this specific project touches — not a generic checklist, but the ones that actually apply here. Typical domains for a software build: scope/requirements, data/architecture, core logic/computation, UX/UI, integration (APIs/LLMs/external services), quality/validation, and delivery/packaging. Drop domains that don't apply; add ones that do (e.g. "data privacy" if the project touches sensitive data). This list becomes the "Domains covered" section and is also your check, later, that no phase silently neglects one of them.

## Step 3 — Build the phase → milestone → task hierarchy

Apply the P1.express-inspired granularity model from the reference file:

- **Phases**: the major stages of building this specific project, derived from its expected outcomes — not a generic template like "planning/design/build/test/deploy." If the source's expected outcome is a numbered list (as PRDs often are), that's a strong signal for how to phase the work, but don't just copy it 1:1 — sequence it by dependency (e.g. "get real data in and parsed" has to precede "generate an LLM data dictionary from it").
- **Milestones**: checkpoints inside each phase where you'd stop and ask "is this still converging on the phase's purpose?" A phase with only one milestone is a sign it should be merged into a neighboring phase or that it's not actually a phase.
- **Tasks**: the atomic, closable units. Apply the granularity test from the reference file — if closing a "task" would require making several more design decisions first, split it further. If a task is trivial enough to be a sub-step of an obviously bigger task, merge it up.

For every task, write:
- **What** — one concrete, unambiguous action, named so it reads clearly out of context (per the P1.express naming guidance — no cryptic shorthand).
- **Why** — a one-line purpose tying it back to its milestone (NUP5: if you can't state why, cut the task or question whether it belongs).
- **Definition of done** — the observable condition for marking it closed.

Use `- [ ]` markdown checkboxes for tasks so the document is directly usable as a working checklist.

## Step 4 — Apply the 80/20 and holistic checks (NUP2, NUP4)

Once the hierarchy is drafted, do a pass over it:

- Flag, informally, which handful of tasks deliver the bulk of the project's value — these should generally come earlier in the sequence, not be treated as polish at the end.
- Re-check the domain list from Step 2: does every domain show up somewhere in the roadmap? If quality/validation or UX never appears as its own task anywhere, that's a gap, not a sign the project doesn't need it.
- Cut anything that doesn't trace to a stated requirement or expected outcome. If it's a genuinely good idea but out of the source's stated scope, it belongs in "Deferred / out of scope," not folded into a phase.

## Step 5 — Extract repeatable checklists (NUP6)

If several tasks across the roadmap share the same shape (e.g. multiple "add a data quality check for X" tasks, or multiple "wire up an LLM prompt for Y" tasks), don't repeat the same sub-steps in each one. Write the shared checklist once in a "Reusable checklists" section and have each task reference it by name.

## Step 6 — Write the document

Write the output to `docs/development-process.md` (create the `docs/` directory if it doesn't exist) unless the user specified a different path. Use this structure:

```markdown
# Development Process — <Project Name>

## Purpose
<One paragraph: what this roadmap gets the project to, and why it's sequenced this way. Ties back to the source file's stated goal.>

## Domains covered
<Short bullet list from Step 2 — the holistic check, not prose.>

## Roadmap

### Phase 1 — <name>
**Purpose:** <why this phase exists>
**Definition of done:** <what "phase complete" looks like>

#### Milestone 1.1 — <name>
- [ ] **Task:** <what> — *why:* <one line> — *done when:* <condition>
- [ ] ...

#### Milestone 1.2 — <name>
...

### Phase 2 — <name>
...

## Reusable checklists
### <Checklist name>
- [ ] ...
(Referenced from tasks above as "apply <checklist name>".)

## Deferred / out of scope
- <idea> — *why deferred:* <reason>, *revisit when:* <trigger, if known>

## Open questions
- <anything the source project description left ambiguous that affects sequencing — ask the user about these rather than guessing>
```

Keep prose minimal. The roadmap's job is to be worked from, not read as a report — favor the checklist structure over paragraphs everywhere it's viable.

## Step 7 — Sanity-check before finishing

Re-read the finished document against these questions, adjusting anything that fails:

1. Could someone unfamiliar with the source conversation pick any single task and know exactly what to do and how to tell it's done? (Granularity test.)
2. Does every phase trace to something the project description actually asked for? (NUP5 — purpose test.)
3. Is there any domain from Step 2 that never appears in a task anywhere? (NUP4 — holistic test.)
4. Are there long runs of undifferentiated tasks that should be broken into more milestones, or conversely, milestones with only one task that should be merged? (Granularity/simplicity balance — NUP2.)

Report back to the user with a short summary of the phase structure and point them at the written file — don't paste the whole document into the conversation unless they ask.
