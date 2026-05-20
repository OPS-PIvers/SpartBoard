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

**Create `/.git-blame-ignore-revs`** (empty for now; step 4 adds the commit hash):

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
# 0. Start from a clean, up-to-date main — do not skip this. `git checkout -b`
#    below creates the new branch from wherever HEAD currently points, so if
#    you're on dev-foo or an old claude/* branch the renormalize branch will
#    inherit that divergence and Step 3's `git diff main...HEAD --ignore-cr-at-eol`
#    check will not be empty.
git checkout main
git pull

# 1. Confirm clean working tree — this must print "nothing to commit"
git status

# 2. Sanity: confirm .gitattributes is present
cat .gitattributes

# 3. Create the PR 2 branch — do not commit directly to main.
git checkout -b chore/normalize-line-endings

# 4. Refresh the index so git re-applies the new attribute rules.
#    WARNING: the next two commands discard any uncommitted changes.
git rm --cached -r .
git reset --hard

# 5. Renormalize every tracked file's line endings per .gitattributes
git add --renormalize .

# 6. Sanity-check whether anything was actually staged. If the committed
#    blobs are already LF (the Context section above explains why this is
#    typical when core.autocrlf=true has been used consistently), nothing
#    will be staged and the commit below will fail with "nothing to commit".
#    In that case PR 2 is a no-op — close the branch without merging and
#    proceed straight to Step 5 post-merge cleanup, since `.gitattributes`
#    from PR 1 is sufficient.
git status

# 7. Commit the churn (skip if Step 6 showed nothing staged)
git commit -m "chore: normalize line endings to LF per .gitattributes"

# 8. Push the branch and open the PR. The title must match the local
#    commit message exactly so Step 4's grep can find the squash hash.
git push -u origin chore/normalize-line-endings
gh pr create --base main \
  --title "chore: normalize line endings to LF per .gitattributes" \
  --body "Mechanical renormalization — see docs/line-endings-normalization-plan.md Step 2."
```

**Title PR 2 exactly as `chore: normalize line endings to LF per .gitattributes`** (the `gh pr create` line above sets this). GitHub's "Squash and merge" uses the **PR title** (not the branch commit message) as the squash commit subject, and Step 4 greps that subject (case-insensitive, for `"normalize line endings"`) to discover the hash. If the PR title is renamed before merging, Step 4's grep returns nothing and the hard-fail guard triggers — leaving the operator with a confusing error and no easy way to diagnose the root cause.

**Do not add the commit hash to `.git-blame-ignore-revs` in this PR.** This repo uses "Squash and merge" (see [PR #1365](https://github.com/OPS-PIvers/SpartBoard/pull/1365)), so the hash on your PR branch will **not** be the hash that lands on `main` — the squash produces a new commit. Pre-capturing a hash here records a ref that never exists on `main`, silently breaking blame-ignore.

### Step 3 — verify before merging PR 2

Run these checks on the PR 2 branch before clicking "Squash and merge":

- `git diff main...HEAD -- . ':!*.png' ':!*.jpg' ':!*.pdf' | head -50` — spot-check diff shows only line-ending changes (no content drift).
- `git diff main...HEAD --ignore-cr-at-eol` should be **empty**. This is the single most important check. (Both `.gitattributes` and `.git-blame-ignore-revs` were added in PR 1, so neither file should appear in PR 2's diff — Step 2 starts from a freshly-pulled `main` after PR 1 has merged. If either does show up here, stop and investigate.) **Do not** add `--ignore-all-space` here — it would also mask trailing-space, indentation, and template-literal whitespace changes, hiding real content drift in the renormalize commit.
- `pnpm run validate` passes cleanly on Windows (no more `Delete ␍` errors).
- CI passes (same checks as any other PR).

### Step 4 — PR 3: register the squash hash in blame-ignore (trivial follow-up)

After PR 2 is merged:

```bash
git checkout main
git pull

# Identify the squash commit by subject, not by position. `git log -1` would
# grab whatever commit happens to be at tip of `main`, which is wrong if any
# other PR merged between PR 2 landing and this step running — the wrong
# hash would silently get recorded (blame-ignore ignores unknown hashes, so
# the renormalize commit would never actually be skipped).
#
# `grep -i` defends against title-case drift (GitHub or a reviewer may edit
# the squash title to "Chore: Normalize line endings…").
SQUASH_HASH=$(git log --format="%H %s" | grep -i "normalize line endings" | head -1 | awk '{print $1}')

# Hard-fail if the lookup found nothing. Without this guard, `git log -1`
# below silently falls back to HEAD, the wrong hash gets appended, and
# blame-ignore silently ignores an unrelated commit.
if [ -z "$SQUASH_HASH" ]; then
  echo "ERROR: could not find squash commit by subject — check the merged commit message and retry."
  exit 1
fi

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

### Step 5 — post-merge cleanup

Immediately after PR 2 merges:

- In each local worktree, **force git to re-check-out every file through the new `.gitattributes` rules**:

  ```bash
  # 0. Confirm clean working tree first — the next commands discard uncommitted changes
  git status

  git pull
  git rm --cached -r .
  git reset --hard
  git status   # should still be clean
  ```

  `git add --renormalize .` alone only fixes the index, not the files on disk — `git rm --cached -r .` followed by `git reset --hard` is what actually rewrites the working-tree files to LF. The leading `git status` mirrors Step 2's pre-flight guard so an operator who copies the block top-to-bottom can't accidentally lose uncommitted work; do not skip it.

- Any branch with in-progress work: `git rebase main` — conflicts should be line-ending-only. Resolve each conflicted file, then continue:

  ```bash
  # For each conflicted file in the current commit:
  git checkout --theirs -- <file>
  git add <file>

  # Once every conflict in the current commit is resolved:
  git rebase --continue
  ```

  Repeat the inner loop for each replayed commit that hits conflicts (a long-lived branch with multiple commits will pause at each one).

  **After the rebase finishes — whether it required conflict resolution or completed silently with no conflicts — always refresh the working tree:**

  ```bash
  git rm --cached -r .
  git reset --hard
  ```

  This step must run unconditionally. A conflict-free rebase never pauses for `--continue`, so an operator following the conflict-resolution block alone would skip the refresh and end up with a rebased branch whose files on disk are still CRLF.

  `git checkout --theirs -- <file>` overwrites the conflicted file but does **not** stage it — without `git add` the rebase will not recognize the conflict as resolved, and without `git rebase --continue` it will sit paused indefinitely.
  - **Note on `--theirs` semantics:** during `git rebase`, `--ours`/`--theirs` are **reversed** relative to `git merge`. In a rebase, `--ours` refers to the base you're rebasing **onto** (`main`, already LF), and `--theirs` refers to the commit being **replayed** (your branch, possibly CRLF). `--theirs` is correct here because the subsequent `git rm --cached -r . && git reset --hard` re-normalizes everything to LF; do not swap to `--ours`, which would silently discard any actual content changes in your branch commit if a "conflict" turns out to be more than line endings.

- Inform teammates (or your other machines) to run the same refresh or re-clone.
- Optionally in each clone: `git config --local core.autocrlf input` so future checkouts don't reintroduce CRLF if `.gitattributes` ever loses a rule.

## Rollback

If something smells wrong after PR 2 merges, revert using the same subject-grep + hard-fail guard + verification echo pattern from Step 4 so the right hash is reverted (and the operator doesn't have to copy/paste a hash under stress). `main` is protected in this repo, so the revert must go through a PR — do not try to push the revert commit directly:

```bash
git checkout main
git pull

SQUASH_HASH=$(git log --format="%H %s" | grep -i "normalize line endings" | head -1 | awk '{print $1}')
if [ -z "$SQUASH_HASH" ]; then
  echo "ERROR: could not find squash commit — check the merged commit message and retry."
  exit 1
fi
git log -1 --format="%H %s%n%an  %ad" "$SQUASH_HASH"   # verify before reverting

git checkout -b revert/normalize-line-endings
git revert "$SQUASH_HASH"
git push -u origin revert/normalize-line-endings
gh pr create --base main \
  --title "revert: normalize line endings (rollback)" \
  --body "Emergency rollback of the renormalize commit. See docs/line-endings-normalization-plan.md Rollback section."
```

Safe because it's a pure textual revert. Then investigate and retry.

**Blame-ignore the revert commit too.** A `git revert` of the renormalize commit produces a new commit that touches the same ~932 files in the opposite direction (LF → CRLF), polluting `git blame` exactly the way the original renormalize commit did. After the revert merges, append its squash hash to `.git-blame-ignore-revs` using the same pattern as Step 4 (the revert subject is typically `Revert "chore: normalize line endings…"`):

```bash
REVERT_HASH=$(git log --format="%H %s" | grep -i 'revert.*normalize line endings' | head -1 | awk '{print $1}')
if [ -z "$REVERT_HASH" ]; then
  echo "ERROR: revert commit not found by subject — check the merged commit message and retry."
  exit 1
fi
git log -1 --format="%H %s%n%an  %ad" "$REVERT_HASH"   # verify before writing
echo "$REVERT_HASH  # revert: normalize line endings" >> .git-blame-ignore-revs
```

If PR 3 hasn't merged yet at the point of rollback, include both hashes (the original renormalize and the revert) in a single blame-ignore commit instead of two separate PRs. If PR 3 has already merged, open a fourth small PR (`chore: register revert hash in blame-ignore`) containing only the revert hash — the same branch + push + `gh pr create` flow as Step 4, since `main` is protected.

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
