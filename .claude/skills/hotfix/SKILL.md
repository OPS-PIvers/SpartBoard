---
name: hotfix
description: Ship an urgent fix for something broken for teachers on production (spartboard.web.app) straight to main, then carry it back to dev-paul. Paul only. Use for "/hotfix", "prod is broken", "teachers can't…", "push a fix to prod now". Not for ordinary bugs, which go through /fix into dev-paul.
---

# Hotfix

A hotfix skips the dev-paul queue, not the checks. Every gate still runs; the path is just shorter.

## 0. Is this a hotfix?

- Only Paul runs this. Check `gh api user --jq .login` is `OPS-PIvers`. If not, stop and tell the user to send the report to Paul.
- It must be broken **on prod now** for teachers or students. Anything else goes through `/fix` into dev-paul.
- If the site is down or blank, roll hosting back first (section 5) and fix second.

## 1. Branch from main

```bash
git fetch origin
git switch -c hotfix/<short-slug> origin/main
```

Reproduce against prod read-only. `vite-dev-prod` (localhost on prod, red banner) is allowed for looking; do not save, delete or assign anything there.

## 2. Smallest fix that works

- Change only what the bug needs. No refactors, no drive-by cleanups.
- Add a regression test next to the code.
- `pnpm exec vitest related --run <changed files>`.
- The fix must tolerate a teacher's already-open tab running the previous client (rules and functions especially).
- Bug fixes that restore intended behavior need no feature flag.

## 3. PR into main

```bash
git push -u origin hotfix/<short-slug>
gh pr create --base main --title "hotfix: <what broke>" --body "<what teachers saw, the cause, the fix, risk to open tabs>"
gh pr checks --watch
```

Fix anything PR Validation reports. Never skip or bypass a check.

## 4. Merge and watch the deploy

- Paul merges with a merge commit: `gh pr merge --merge`. If main hasn't moved since the branch was cut, the deploy reuses the PR's checks and only builds and deploys (about 5 minutes).
- Watch the Deployment run: `gh run watch $(gh run list --workflow firebase-deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')`.
- The smoke test runs after hosting. If it fails, hosting rolls back automatically and an issue is opened. Read it before trying again.

## 5. Manual hosting rollback

```bash
pnpm exec firebase hosting:channel:list --project spartboard --site spartboard --json
pnpm exec firebase hosting:clone spartboard@<previous-version-id> spartboard:live --project spartboard
```

Earlier versions are also listed in the Firebase console under Hosting > Release history. This rolls back hosting only; functions and rules stay as deployed.

## 6. Carry it back to dev-paul

Without this, the next release overwrites the fix.

```bash
git fetch origin
git switch -c hotfix/<short-slug>-to-dev origin/dev-paul
git cherry-pick <hotfix commit sha>
git push -u origin hotfix/<short-slug>-to-dev
gh pr create --base dev-paul --title "hotfix: <what broke> (back to dev-paul)" --body "Cherry-pick of #<hotfix PR>."
```

## 7. Tell teachers only if they noticed

If teachers saw the breakage, add a short `public/changelog.json` note through the normal release rules (docs/DEV_WORKFLOW.md#how-to-write-a-release-note).
