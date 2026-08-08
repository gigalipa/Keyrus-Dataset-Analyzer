# Agent role and batching patterns

This is the reasoning behind Step 3 of the main skill, expanded. Read it when a phase's batching choice isn't obvious from the roadmap alone.

## Deciding parallel vs. sequential

The test isn't "are these tasks conceptually different," it's "do they touch the same state." Two tasks can be conceptually unrelated and still need to be sequential if they'll edit the same file (merge conflicts, one agent's change invalidating the other's assumptions) or depend on a shared setup step neither has done yet.

Good signals for **parallel**:
- Each task's done-when condition can be verified independently of the others (e.g., "CSV files parse into arrays of objects" vs. "XLS files parse into arrays of objects" — different libraries, different files, no shared code path yet).
- The tasks sit in the same milestone specifically because they're variations on the same shape (a "handle format X" pattern repeated per format), which is exactly the kind of repetition `dispatching-parallel-agents` is for.
- No task in the batch produces something another task in the same batch consumes.

Good signals for **sequential**:
- A later task's done-when condition literally can't be checked until an earlier one exists (can't validate "Arquero table produced" before the parsers that feed it exist).
- Tasks share a file that isn't naturally partitionable (e.g., multiple tasks all editing the same top-level layout component).
- The milestone is foundational (project scaffolding, dependency setup) — these are almost always sequential and small, and rushing parallelism here tends to produce agents stepping on each other's `package.json` edits.

Mixed batches are common and fine: run the independent setup sequentially, then fan out the independent format-parsers in parallel, then sequentially integrate their outputs.

## Sizing a subagent's task

Too coarse ("build Phase 2") means the agent is making architecture decisions that should have been surfaced to the user, and a failure partway through is expensive to diagnose — you don't know which of a dozen tasks broke. Too fine (one agent per task, dispatched task-by-task even within a tightly coupled milestone) burns overhead re-deriving shared context on every dispatch and loses the benefit of an agent seeing a coherent chunk of related work at once.

A reasonable default: one subagent per milestone when the milestone's tasks are sequential/coupled, one subagent per task when the milestone's tasks are the parallel/repeated-shape kind described above.

## Checkpoints: where they earn their cost

A checkpoint pauses the whole pipeline and costs the user attention, so place them where the alternative — finding out later — is meaningfully worse:

- **Before anything requiring credentials or external accounts** (API keys, third-party services) — the user has to act anyway, so this is a natural and necessary pause, not just a nice-to-have.
- **Before the first phase that produces user-visible behavior for the first time** (first working UI, first end-to-end flow) — cheap to catch a wrong direction here, expensive to catch it after three more phases built on top of it.
- **At the end of the full roadmap**, always — final review before considering the work done.
- **When Step 2's reconciliation left a known, accepted gap** — re-surface it at the phase where that gap becomes relevant, not just once at the start where it's easy to forget by the time it matters.

Skip checkpoints for phases that are low-risk and easily verified mechanically (e.g., "ESLint and Prettier configured" doesn't need a human look — the verification step already proves it).
