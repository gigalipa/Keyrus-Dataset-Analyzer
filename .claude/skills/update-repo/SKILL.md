---
name: update-repo
description: Use when the user asks to update the repo, sync project docs, wrap up a work session, or says things like "update the repo", "sync docs and commit", or "close out today's work" — refreshes docs/development-process.md and README.md to current status, summarizes recent changes in plain language, and drafts+runs a commit.
---

# Update Repo

## Overview
End-of-session repo sync for this project: bring the process doc and README in line with actual progress, explain what changed in plain language, then commit (and optionally push) with the user's sign-off at each gate.

## Workflow

1. **Assess current state.** Run `git status`, `git diff`, and `git log -5 --oneline` to see what changed since the last commit. Read `docs/development-process.md` and `README.md` in full — don't guess their structure.

2. **Update `docs/development-process.md`.** Check off (`[X]`) tasks/milestones that are now actually done, based on real evidence (files exist, code runs, tests pass) — not on optimism. Don't invent progress. If a phase is partially done, leave unfinished tasks unchecked.

3. **Update `README.md`.** Reflect the same current status: phase/progress line, "Current Status" and "Next Steps" sections, and any new working features. Keep the file's existing voice and structure — edit in place, don't restructure it.

4. **Write a plain-language summary.** 3-6 sentences, no jargon, for someone non-technical: what changed and why it matters to the project, not how it was implemented. Show this to the user in the chat response (not just in a commit message).

5. **Draft a commit message.** Conventional style matching this repo's history (`feat:`, `fix:`, `docs:`, etc., one-line summary + optional body). Show it to the user and let them approve or edit it before committing — never commit silently.

6. **Commit.** Stage the relevant files (development-process.md, README.md, and any other changed source files worth including — confirm scope with the user if unclear) and commit with the approved message.

7. **Push.** Check `git remote -v` and `git log --oneline origin/<branch>..<branch>` (or similar) to see if there's a remote and whether it's ahead/behind.
   - Check project memory first for a remembered push preference for this repo (see below). If one exists, apply it without re-asking — but if `git fetch` shows the remote has new commits, always pull first regardless of the remembered mode.
   - If no preference is remembered, ask the user: **push directly**, or **pull-rebase/merge then push** (for repos with more than one contributor). Save their answer as a project memory keyed to this repo so future runs don't ask again.

## Quick reference

| Step | File(s) touched | Gate before proceeding |
|---|---|---|
| 2 | `docs/development-process.md` | none — factual update |
| 3 | `README.md` | none — factual update |
| 4 | none (chat only) | none |
| 5 | none (chat only) | user approves/edits message |
| 6 | staged files | user-approved message only |
| 7 | remote | remembered preference, or ask once and remember |

## Common mistakes
- Checking off a task in development-process.md without verifying it's actually done — always confirm against real code/build state, not the plan's intent.
- Committing before the user has seen and approved the commit message.
- Re-asking the push/pull preference every run instead of checking memory first.
- Force-pushing or skipping a pull check when the remote has diverged — always check ahead/behind state before pushing.
