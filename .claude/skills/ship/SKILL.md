---
name: ship
description: Open a PR from the current branch into dev-paul, wait for CI and the Claude review, fix what they find, and merge when green. Use for "/ship", "ship it", "it's ready", "open the PR", "merge this".
---

# Ship

Every PR goes into `dev-paul`, never `main`. Paul promotes dev-paul to prod.

## 1. Ready?

- `git status` is clean and every commit belongs to this change.
- `git fetch origin && git rebase origin/dev-paul`.
- `pnpm exec vitest related --run <changed source and test files>` passes.
- User-facing change? It's behind a feature flag (see `/new-feature`). A new `public/changelog.json` entry waits until the flag opens to everyone.

## 2. Open the PR

```bash
git push --force-with-lease -u origin HEAD
gh pr create --base dev-paul --title "<plain summary>" --body "<body>"
```

The body says: what changed and why, how it was checked (tests, `/show-me` screenshot), and for a flagged feature the flag id, its starting access level, and the admin path to open it (Admin Settings > Access > Previews, or Widgets, > Public). End with the Claude Code attribution line.

## 3. Wait for checks and review

- `gh pr checks <number> --watch` in the background. The required check is `summary`.
- When the Claude PR Review finishes, read it: `gh pr view <number> --comments` and `gh api repos/OPS-PIvers/SpartBoard/pulls/<number>/comments`.
- Every finding gets either a fix (new commit, push) or a one-line reply saying why it doesn't apply. Don't ignore any.
- A check fails: read the log (`gh run view <run id> --log-failed`), fix the cause, push. Never skip or disable a check or a test.

## 4. Merge

When `summary` is green and every review finding is answered:

```bash
gh pr merge <number> --squash --delete-branch
```

If it's still red after two real attempts, stop. Summarize what fails and what you tried, and suggest sending it to Paul.

## 5. After

The merge deploys dev-paul to https://spartboard-dev.web.app. Tell the user it's in, and that it reaches teachers with Paul's next release.
