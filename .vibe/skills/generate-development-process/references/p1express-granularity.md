# P1.express — granularity model (condensed)

Source: OMIMO P1.express manual (CC BY 4.0). P1.express is a personal *task management* method, not a project methodology — what this skill borrows from it is its granularity model and its closing/postponing discipline, applied to a development roadmap instead of personal tasks.

## The layered-cycle idea
P1.express organizes work into nested cycles of decreasing scope and increasing frequency: yearly goals → monthly realignment → weekly energy check → daily task closing. Borrow the *shape* of this for a roadmap:

- **Phase** (the "yearly" layer) — a major stage of the project with a clear purpose and a definition of done. Ask "why does this phase exist" the way A1 asks about high-level goals.
- **Milestone** (the "monthly" layer) — a checkpoint inside a phase where you'd realign: are the tasks under this milestone still moving toward the phase's purpose? (Mirrors B1.)
- **Workstream / task group** (the "weekly" layer) — a cluster of related tasks worth reviewing together, where you'd look for friction or wasted effort. (Mirrors C1.)
- **Task** (the "daily" layer) — the atomic, closable unit of work. This is the layer that must be granular.

## What makes a task properly granular
A task is at the right level of granularity when it can be **closed** — finished or explicitly canceled — without ambiguity, the way P1.express's D1 activity closes daily tasks. A task is too coarse if closing it would actually require making several more planning decisions first ("build the analysis engine" is not a task; "parse CSV headers and infer column types" is closer).

For each task, capture:
- **What** — one clear, concrete action (name it so it's still understandable years later — no cryptic shorthand, per P1.express's D2 guidance).
- **Why** — the one-line purpose it serves in its milestone (traces back to NUP5).
- **Definition of done** — the observable condition that lets you mark it closed.

## Postponing over prioritizing
P1.express deliberately avoids ranking every task 1..N — items that don't fit now are postponed to a sensible future point rather than buried at the bottom of an infinite list. Borrow this for the roadmap: explicitly mark out-of-scope-for-now ideas as **Deferred** (with a reason) rather than omitting them silently or cramming them into the current phase. This keeps the roadmap honest about what's really in scope now.

## Repeatable checklists
Recurring activity types (e.g. "review a new data-quality check," "wire up an LLM prompt step") benefit from a short reusable checklist defined once, the way P1.express recommends checklists for recurring tasks. If the roadmap has several tasks of the same shape, define the checklist once in a "Reusable checklists" section and reference it from each task instead of repeating steps.
