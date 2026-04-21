# Line-endings normalization plan

## Context

Prettier is configured with `endOfLine: "lf"` in `.prettierrc`, but the repository has no `.gitattributes` file. On Windows, `git config core.autocrlf=true` (the default via Git for Windows) converts LF → CRLF on checkout, so every file on disk in a Windows clone has `\r\n` endings while the committed blobs are LF.

Result: `pnpm run lint` on Windows reports ~190,000 Prettier errors (every line in every file) as `Delete ␍`. CI runs on Linux and is unaffected — so this is a local-developer-ergonomics issue, not a correctness issue.

Prettier's pre-commit hook rewrites staged files to LF, which is why commits from Windows land correctly in the repo. The problem is only felt when running lint/format across the full tree locally.

## Why this needs a dedicated window

`git add --renormalize .` will rewrite ~932 tracked files in a single commit. That commit is pure line-ending churn, but it still:

- Creates merge conflicts on every open PR and every unmerged `claude/*` / `dev-*` branch. All of them will need a rebase onto the renormalized `main`. The conflicts are mechanical (not content), but they're tedious and error-prone across many branches.
- Adds a hop to every `git blame` touched by the commit unless registered in `.git-blame-ignore-revs`.
- Requires every other worktree and every teammate's clone to re-clone or refresh the working tree (`git rm --cached -r .` followed by `git reset --hard`, on a clean tree) to sync.

Safe windows: **after all open PRs are merged or closed**, ideally overnight or on a weekend so there's no contention.

## Preconditions before executing

- [ ] All open PRs on `OPS-PIvers/SpartBoard` are merged, closed, or explicitly paused.
- [ ] All in-flight `claude/*` and `dev-*` branches are either merged or ready to be force-rebased after the renormalize.
- [ ] Announce to any collaborators: "`main` is being line-ending-normalized; expect to rebase or re-clone."
- [ ] No active releases in flight (check `firebase-deploy.yml` hasn't got a run mid-deploy).

## Execution plan

### Step 1 — PR 1: add `.gitattributes` and `.git-blame-ignore-revs` (small, reviewable)

This PR adds config only. No file rewrites yet.

**Create `/.gitattributes`:**

```gitattributes
# Enforce consistent line endings across platforms.
# - `text=auto` lets git detect text vs binary
# - `eol=lf` commits + checks out text files as LF on every platform
* text=auto eol=lf

# Windows-only file formats (if ever added — none tracked today)
*.bat       text eol=crlf
*.cmd       text eol=crlf
*.ps1       text eol=crlf

# Explicit binaries — belt-and-suspenders against detection mistakes
*.png       binary
*.jpg       binary
*.jpeg      binary
*.gif       binary
*.ico       binary
*.webp      binary
*.pdf       binary
*.woff      binary
*.woff2     binary
*.ttf       binary
*.eot       binary
*.otf       binary
*.mp3       binary
*.mp4       binary
*.wav       binary
*.zip       binary
```

**Create `/.git-blame-ignore-revs`** (empty for now; step 3 adds the commit hash):

```
# Commits listed here are skipped by `git blame` (and GitHub's blame view).
# Add mechanical-refactor commits — line-ending renormalization, formatter
# rollouts, import reorderings — so they don't obscure real authorship.
#
# Configure locally with:
#   git config blame.ignoreRevsFile .git-blame-ignore-revs
```

**Optional:** document the local git config in `docs/DEV_WORKFLOW.md`:

```bash
git config --local blame.ignoreRevsFile .git-blame-ignore-revs
git config --local core.autocrlf input   # prefer LF in working tree
```

Merge PR 1 to `main` on its own.

### Step 2 — PR 2: renormalize (huge but mechanical)

From a freshly-pulled `main` after PR 1 is merged, **on a clean working tree**. The commands below include `git rm --cached -r .` and `git reset --hard`, which will discard any uncommitted changes — stash or commit everything you care about before starting.

```bash
# 0. Confirm clean working tree — this must print "nothing to commit"
git status

# 1. Sanity: confirm .gitattributes is present
cat .gitattributes

# 2. Refresh the index so git re-applies the new attribute rules.
#    WARNING: the next two commands discard any uncommitted changes.
git rm --cached -r .
git reset --hard

# 3. Renormalize every tracked file's line endings per .gitattributes
git add --renormalize .

# 4. Commit the churn
git commit -m "chore: normalize line endings to LF per .gitattributes"
```

**Do not add the commit hash to `.git-blame-ignore-revs` in this PR.** This repo uses "Squash and merge" (see [PR #1365](https://github.com/OPS-PIvers/SpartBoard/pull/1365)), so the hash on your PR branch will **not** be the hash that lands on `main` — the squash produces a new commit. Pre-capturing a hash here records a ref that never exists on `main`, silently breaking blame-ignore.

### Step 3 — PR 3: register the squash hash in blame-ignore (trivial follow-up)

After PR 2 is merged:

```bash
git checkout main
git pull

# Identify the squash commit by subject, not by position. `git log -1` would
# grab whatever commit happens to be at tip of `main`, which is wrong if any
# other PR merged between PR 2 landing and this step running — the wrong
# hash would silently get recorded (blame-ignore ignores unknown hashes, so
# the renormalize commit would never actually be skipped).
SQUASH_HASH=$(git log --format="%H %s" | grep "normalize line endings" | head -1 | awk '{print $1}')

# Verify before writing — confirm the commit subject, author, and date look
# right. If this prints nothing or the wrong commit, stop and investigate.
git log -1 --format="%H %s%n%an  %ad" "$SQUASH_HASH"

git checkout -b chore/blame-ignore-renormalize
echo "$SQUASH_HASH  # chore: normalize line endings" >> .git-blame-ignore-revs
git add .git-blame-ignore-revs
git commit -m "chore: register line-ending renormalize in blame-ignore"
git push -u origin chore/blame-ignore-renormalize
gh pr create --base main --title "chore: register line-ending renormalize in blame-ignore" --body "Follow-up to PR 2."
```

Keep PR 3 separate and small so the hash is the real post-squash hash from `main`.

### Step 4 — verify before merging PR 2

- `git diff main...HEAD -- . ':!*.png' ':!*.jpg' ':!*.pdf' | head -50` — spot-check diff shows only line-ending changes (no content drift).
- `git diff main...HEAD --ignore-all-space --ignore-cr-at-eol` should be **empty** (or only touch `.gitattributes` / `.git-blame-ignore-revs`). This is the single most important check.
- `pnpm run validate` passes cleanly on Windows (no more `Delete ␍` errors).
- CI passes (same checks as any other PR).

### Step 5 — post-merge cleanup

Immediately after PR 2 merges:

- In each local worktree, **force git to re-check-out every file through the new `.gitattributes` rules**:

  ```bash
  git pull
  git rm --cached -r .
  git reset --hard
  git status   # should be clean
  ```

  `git add --renormalize .` alone only fixes the index, not the files on disk — `git rm --cached -r .` followed by `git reset --hard` is what actually rewrites the working-tree files to LF. Only run this in a worktree with no uncommitted changes.

- Any branch with in-progress work: `git rebase main` — conflicts should be line-ending-only. Resolve each conflicted file with `git checkout --theirs -- <file>` and then follow with the same `git rm --cached -r . && git reset --hard` once the rebase completes.
- Inform teammates (or your other machines) to run the same refresh or re-clone.
- Optionally in each clone: `git config --local core.autocrlf input` so future checkouts don't reintroduce CRLF if `.gitattributes` ever loses a rule.

## Rollback

If something smells wrong after PR 2 merges:

```bash
git revert <renormalize-commit-hash>
```

Safe because it's a pure textual revert. Then investigate and retry.

## Scope guardrails (what this plan does NOT do)

- Does **not** change Prettier config (already correct: `endOfLine: lf`).
- Does **not** change ESLint rules.
- Does **not** touch `functions/` sub-package configs — the `.gitattributes` at repo root covers the whole tree.
- Does **not** modify CI (CI already enforces LF via Prettier; no workflow changes needed).

## Estimated effort

- PR 1: ~15 minutes (config only, trivial review).
- PR 2: ~10 minutes to execute, ~10 minutes to verify the diff is ending-only, ~5 minutes for CI.
- PR 3: ~5 minutes (one-line change registering the post-squash hash).
- Post-merge rebases of in-flight branches: depends on count. Budget ~5 min per branch.

## References

- Git docs on `.gitattributes` text normalization: https://git-scm.com/docs/gitattributes#_text
- GitHub's `.git-blame-ignore-revs` support: https://docs.github.com/en/repositories/working-with-files/using-files/viewing-a-file#ignore-commits-in-the-blame-view
- Regression fix that surfaced the CRLF noise locally: [PR #1365](https://github.com/OPS-PIvers/SpartBoard/pull/1365).
