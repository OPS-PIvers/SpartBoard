---
name: fix
description: Fix a bug or something going wrong in SpartBoard that someone reported, from whatever was passed on (pasted email, a teacher's words, a screenshot). Reproduces it first, adds a test, fixes the cause. Use for "/fix", "this is broken", "a teacher says…", "X isn't working".
---

# Fix

## 1. Understand the report

- Restate it as: **who** (teacher, student, admin), **where** (widget, page), **what they did**, **what happened**, **what should have happened**.
- Ask only for what's missing and you can't find yourself. A screenshot, browser or time of day helps; a teacher's name never goes in code or commits.

## 2. Is it urgent on prod?

If teachers or students can't do something right now on spartboard.web.app (blank page, can't sign in, quiz won't submit, data missing), stop and tell the user: "Send this to Paul now so he can `/hotfix` it." You can keep investigating, but the fix goes through Paul.

## 3. Fresh branch from dev-paul

```bash
git fetch origin
git switch -c fix/<short-slug> origin/dev-paul
```

## 4. Reproduce before changing anything

- Find the code path and explain the cause in one or two sentences.
- Write a failing test that shows the bug: `pnpm exec vitest related --run <test file>`.
- When the bug only shows in the real app, reproduce it with `/show-me` (localhost on dev, signed in for real).
- Can't reproduce? Say so, list what you tried, and ask for the missing detail instead of guessing.

## 5. Fix the cause

- Smallest change that fixes the cause, not the symptom. No drive-by refactors.
- The test now passes; run `pnpm exec vitest related --run <changed files>`.
- Bug fixes that restore intended behaviour need no feature flag.

## 6. Check and ship

- `/show-me` to see it fixed in the browser pane.
- `/ship` to open the PR into dev-paul. Put the original report (without names) and the cause in the PR description.
