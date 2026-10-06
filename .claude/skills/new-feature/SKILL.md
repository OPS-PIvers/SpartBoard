---
name: new-feature
description: Start building a new SpartBoard feature or change the way something works, on a fresh branch from dev-paul, with a feature flag when teachers would see it. Use for "/new-feature", "I want to add…", "let's build…", "can we make the X widget do Y".
---

# New feature

## 1. Pin down what we're building

Ask only what you can't work out from the code, in one short round:

- Who uses it (teacher, student, admin) and where they start (which widget, page or menu)?
- What does "done" look like? One or two sentences the user would agree with.
- Anything it must not change?

Restate the plan in plain words (what changes, which files, how it gets switched on) and wait for a yes.

## 2. Fresh branch from dev-paul

```bash
git fetch origin
git switch -c feat/<short-slug> origin/dev-paul
```

If the session is already on a branch with no commits of its own, move it instead: `git reset --hard origin/dev-paul` (only when `git log origin/dev-paul..HEAD` is empty and `git status` is clean).

## 3. Behind a flag if teachers would notice

Follow CLAUDE.md "Releasing a feature" exactly:

- **Not a widget:** add an id to `GlobalFeature` (`types.ts`), a `FEATURE_DEFAULTS` entry (`config/featureDefaults.ts`, `defaultAccessLevel: 'admin'`, `stage: 'preview'`), the id in `functions/src/featureMissingDoc.ts`, and gate every entry point with `canAccessFeature('<id>')`.
- **New widget:** use the `new-widget` skill; it ships at access level `admin`.
- Bug fixes, copy and styling tweaks need no flag (use `/fix` for bugs).

Admins (Paul and Bailey) always see admin-level flags, so the feature is visible to us on dev and prod, and hidden from teachers.

## 4. Build in small steps

- Read the folder's CLAUDE.md first (`components/CLAUDE.md`, `components/widgets/CLAUDE.md`).
- After each step: `pnpm exec vitest related --run <changed files>`.
- Never run the full `pnpm run test`, `lint`, `validate` or `tsc`; CI does that.
- Commit at each working step with a plain message.

## 5. See it, then share it

- `/show-me` to check it in the browser pane on localhost.
- `/preview` to try it on a phone or Chromebook.
- `/ship` when it's ready to go into dev-paul.
