---
name: orchestrate-development-process
description: Turns an existing development-process.md roadmap and project-description.md spec into a validated, multi-agent execution plan, then orchestrates Claude Code subagents through building, testing, and packaging the project phase by phase. Use this whenever the user wants to start, resume, or drive actual implementation from a development process / roadmap file — phrases like "follow the development process," "start building from the roadmap," "execute the plan," "let's start development," "orchestrate the build," or when they point at development-process.md and project-description.md (typically under docs/) and want to move from planning into building. Also trigger if the user asks whether a development process still matches its project description, wants a roadmap reconciled or fixed before development starts, or wants a multi-agent plan for building/testing/deploying a project from existing planning docs.
license: CC-BY-4.0
compatibility: Claude Code — requires Agent, TodoWrite, AskUserQuestion, Read, Write, Edit, Grep, Glob, Bash tools. Pairs with the generate-development-process skill, which produces development-process.md from project-description.md.
user-invocable: true
allowed-tools: Read Write Edit Grep Glob Agent TodoWrite AskUserQuestion Bash
---

# Orchestrate Development Process

You take a **Development Process** roadmap (phases → milestones → tasks, produced by the `generate-development-process` skill or written by hand) and a **project description** (the spec it was built from), and turn them into working software — safely, phase by phase, using Claude Code subagents.

This skill has three jobs, in order, and they should not be collapsed into each other:

1. **Reconcile** — check the roadmap still matches the spec before touching any code. Roadmaps drift from specs (decisions get resolved after the roadmap was written, numbers get typo'd, phases get added that quietly reintroduce something the spec ruled out). Building from a stale roadmap wastes far more work than catching the drift up front costs.
2. **Plan the orchestration** — decide, phase by phase, which tasks can run as parallel subagents versus which must run sequentially, who checks the work, and where a human needs to look before the next batch starts. This plan is a real artifact (`docs/orchestration-plan.md`), not something held only in conversation — it's what makes the run resumable and reviewable.
3. **Execute** — actually dispatch the agents, phase by phase, verifying each phase's Definition of Done before moving to the next.

Building software is a large, hard-to-reverse action — it writes many files and burns real tokens across possibly several coding agents. Step 3 must never start without the user explicitly signing off on the plan from Step 2. Steps 1 and 2 are comparatively cheap (reading, reasoning, writing one planning doc) and can proceed without a gate in between, but always stop and surface reconciliation findings before writing a single line of the plan around a task that's in question.

## Step 1 — Locate and read the inputs

Ask the user for the paths if they haven't given them, rather than assuming — roadmaps and specs end up in different places across projects. If they haven't said, check the obvious spot first (`docs/development-process.md` and `docs/project-description.md`) and confirm that's what they mean before proceeding; don't silently substitute a guess for a real answer.

Read both files in full. You need:
- From **project-description.md**: the core problem, hard requirements, expected outcomes, explicit non-goals/exclusions, and any decisions recorded under things like "Open questions."
- From **development-process.md**: the phase → milestone → task hierarchy, each task's done-when condition, the "Deferred / out of scope" list, and its own "Open questions" section.

If either file is missing, don't fabricate one from the other — that's the `generate-development-process` skill's job (or the user's), not this one's. Stop and tell the user what's missing.

## Step 2 — Reconcile the roadmap against the spec

Before planning any orchestration, walk the roadmap against the spec and check for these specific failure modes. This isn't a vague "does it look right" pass — check each of these explicitly:

1. **Traceability gaps** — does every expected outcome and hard requirement in project-description.md show up in at least one phase/task? A roadmap that silently drops a requirement will produce a "finished" project that doesn't meet the spec.
2. **Scope creep** — does any phase/task reintroduce something the spec explicitly excluded (auth, a backend, a database, deployment — whatever the project's own exclusions are)? These exclusions are usually load-bearing decisions ("small and finished beats ambitious and half-working"), not oversights to quietly fix.
3. **Internal contradictions** — do numbers, limits, or decisions repeated in multiple places agree? Check task text against the roadmap's own "Open questions" section and against the spec's resolved decisions. (Concrete example of exactly this: a task might say "files up to 50MB" while the resolved answer elsewhere says 15MB — same document, same fact, two different numbers. Both can't be right.)
4. **Unclosable tasks** — does every task have a concrete, observable done-when condition? A task like "improve the UI" with no done-when can't be verified by a subagent or by you, which means it can't be marked complete with confidence.
5. **Ordering problems** — does any task depend on something a later phase produces? (E.g., a phase generating LLM insights from parsed data can't precede the phase that builds the parser.)
6. **Live open questions** — does the roadmap's "Open questions" section still contain anything genuinely unresolved and blocking? A question the spec already answered should have been folded in, not left dangling.

Write down what you find. If everything checks out, say so explicitly and move on — don't manufacture issues to seem thorough. If you find problems, **report them plainly and propose a specific fix for each, then ask the user before changing development-process.md.** Never rewrite the roadmap file silently, even for something that looks like an obvious typo — the user may know context you don't (maybe 50MB was deliberate and the Open Questions answer is what's stale). Use `AskUserQuestion` when there's a real decision to make; a plain confirmation is enough when the fix is unambiguous.

Only after reconciliation is resolved (fixed, or the user has explicitly said to proceed with a known gap) move to Step 3.

## Step 3 — Design the multi-agent orchestration plan

This is the translation step: turn the (now-trustworthy) phase/milestone/task hierarchy into a plan for *how Claude will actually execute it*. Don't reinvent execution mechanics here — Claude Code already has skills for the pieces that matter; this plan's job is to say which phase uses which mechanism, in what order, with what checkpoints. Specifically, plan to lean on:

- **`superpowers:writing-plans`** / **`superpowers:brainstorming`** for any phase or milestone whose approach isn't already fully specified by the roadmap and needs a design decision made first.
- **`superpowers:dispatching-parallel-agents`** for a milestone whose tasks are genuinely independent (different files, no shared state) — e.g., separate parsers for CSV, Excel, and SQL in the same milestone are a natural parallel batch.
- **`superpowers:subagent-driven-development`** for milestones with a mix of independent and dependent tasks within the same session.
- **`superpowers:using-git-worktrees`** when parallel tasks are likely to touch overlapping files or you want isolation before merging.
- **`superpowers:test-driven-development`** for every task that produces logic with an observable done-when condition (which, per Step 2 check 4, should be all of them).
- **`superpowers:verification-before-completion`** before marking any task, milestone, or phase done — a subagent's self-report is not verification.
- **`superpowers:requesting-code-review`** / **`superpowers:code-review`** at the end of each phase, before moving on.
- **`superpowers:finishing-a-development-branch`** once the whole roadmap is complete.

For each phase in the roadmap, decide and record:

- **Batching**: which milestones/tasks run in parallel subagents, which run sequentially, and why (shared files, shared state, or a hard dependency forces sequential; independent files/modules allow parallel).
- **Agent roles**: what each dispatched subagent is responsible for (e.g., "implement the Excel parser per Milestone 2.2," not "do phase 2").
- **Verification**: the concrete check against the phase's Definition of Done — a command to run, a file to inspect, a test to pass. Prefer something you or a subagent can actually execute over "looks right."
- **Human checkpoint**: whether this phase needs the user to look before continuing, and why. Checkpoints are cheap insurance — favor them at points where a wrong turn is expensive to unwind (e.g., before a phase that needs API keys or external credentials, before anything that touches real user-facing behavior for the first time, and always at the very end of the whole roadmap). Not every phase needs one; over-gating a plan that's otherwise low-risk just adds friction.

Reference `references/agent-role-patterns.md` for a fuller discussion of when to parallelize versus sequence, and how to size a subagent's task so it's neither too coarse (one agent silently doing three milestones) nor too fine (agent-per-line-of-code overhead).

## Step 4 — Write the orchestration plan

Write `docs/orchestration-plan.md` (create `docs/` if missing — it should already exist alongside development-process.md). Use this structure:

```markdown
# Orchestration Plan — <Project Name>

## Reconciliation summary
<What Step 2 found, and how each item was resolved. "No issues found" is a valid, complete entry.>

## Execution batches

### Phase 1 — <name> (mirrors development-process.md)
**Mode:** sequential | parallel | mixed
**Agents:**
- <agent role> → <milestone/task(s) it owns> → verified by <concrete check>
- ...
**Checkpoint:** none | <what the user should look at, and why>

### Phase 2 — <name>
...

## Notes for execution
<Anything that doesn't fit the per-phase structure: shared setup steps, credentials needed before a specific phase, known risks.>
```

Keep it a working plan, not a report — someone should be able to resume execution from this file alone if the session is interrupted.

## Step 5 — Get sign-off before dispatching real agents

Show the user the orchestration plan (the file, or a concise summary pointing at it) and explicitly ask whether to proceed with live execution. This is the one hard gate in this skill: do not dispatch a single build-oriented subagent until the user has said to go. If Claude Code's plan mode is available and fits the moment, use it here — it's built exactly for "here's what I'm about to do, confirm before I do it."

## Step 6 — Execute, phase by phase

Once confirmed, work through the batches from `docs/orchestration-plan.md` in order:

1. Track progress with `TodoWrite` at the phase/milestone level so the user (and you, across a long session) can see where things stand.
2. Dispatch subagents per the batching plan (parallel where planned, sequential where planned) using `Agent`, briefing each one the way `superpowers:dispatching-parallel-agents` and `superpowers:subagent-driven-development` describe — enough context to make judgment calls, not a narrow command.
3. When a phase's tasks are done, verify against its Definition of Done for real (run it, read it, test it) before marking it complete — per `superpowers:verification-before-completion`. Don't take a subagent's "done" at face value.
4. At any checkpoint marked in the plan, stop and surface what's ready for the user to look at. Wait for their go-ahead before the next phase's agents are dispatched.
5. If execution surfaces something the plan didn't anticipate (a task turns out to depend on something unbuilt, a requirement turns out ambiguous), don't silently improvise around it — update `docs/orchestration-plan.md` to reflect reality and, if it changes scope or sequencing meaningfully, check with the user the same way Step 2 would.

## Step 7 — Close out

Once every phase's Definition of Done is verified, run a final pass with `superpowers:requesting-code-review` across the full diff, then hand off to `superpowers:finishing-a-development-branch` to decide how the work gets integrated (commit, PR, merge — whatever that skill determines fits). Report back to the user with a short summary of what was built and a pointer to `docs/orchestration-plan.md` for the full record — don't paste the whole plan or full diffs into the conversation unless asked.
