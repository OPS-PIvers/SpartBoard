# Backlog drain routine

A Claude Code routine that works through the Ready section of `AGENT_BACKLOG.md` every night, so items get done without Paul reading the file. Each night it ships up to 8 items as their own PRs into `dev-paul`, each PR deleting its item. It reports to Paul only when it needs him, plus one line a week.

A scheduled trigger runs this nightly at 8:40 PM America/Chicago, in the "Audit whether agent backlog work gets done" project thread. Never resolve that thread: a routine can't fire into a resolved thread. It can also be run by hand with "run the backlog drain".

## Each night

1. **Preflight.** Fetch `origin/dev-paul`. If a release PR (`dev-paul` into `main`) is open, stop: `dev-paul` takes only `release fix:` PRs then. Also stop if `dev-paul`'s latest `summary` check is red; post one line naming the failing job instead.
2. **Pick up to 8 items** from Ready, in this order, skipping any item with an open PR or a `claude/backlog-ab-<n>-*` branch from the last 7 days:
   1. Security items, then items that say "before `<flag>` opens".
   2. Items marked _re-verify_ (cheap, and they shrink the list).
   3. Everything else, oldest ID first.
   Take S items, and an M item only if it fits in one PR. Skip L items and plan entries (they belong to a plan thread).
3. **Work each item** with one worker agent per item, at most 3 at a time, each on its own branch `claude/backlog-ab-<n>-<yyyymmdd>` from `origin/dev-paul`. Workers use Sonnet 5.5 high; security items and anything touching `firestore.rules` or `storage.rules` use Opus. At most one rules PR per night, so they don't conflict on the size budget. Each worker:
   - Re-reads the item on latest `dev-paul` and greps the code first. If it's already done, the PR only deletes the item and says which commit did it.
   - Follows CLAUDE.md: tests with `vitest related`, the flag rule for anything teachers would see, tour anchors for new controls, one-line comments, `.claude/rules/firestore-rules.md` and rules tests for reads and writes on rules changes.
   - Deletes the item in the same PR. Leftovers it finds become a new item with the next free ID (bump the ID line in the same PR).
   - Titles the PR `AB-<n>: <plain summary>` and opens it as a draft into `dev-paul`, with the attribution lines the session gives.
4. **Review and merge.** Run an adversarial review on each PR (a fresh reviewer that gets the diff, not the worker's conclusion). Fix what's real, then mark the PR ready. Before each merge, merge the latest `dev-paul` into the branch (backlog line deletions from the same night often touch), keep every deletion, and let CI run again. Merge once CI is green and the first Claude review is handled; after that, merge if only nits are left. The Claude review skips `**/*.md` and `docs/**`, so a PR that changes only those merges on a green `summary` check. Never merge a security PR with failing CI. If a PR can't get green in the run, leave it as a draft, comment why, and move on.
5. **When an item needs Paul:**
   - New wording: build it, take a screenshot in the real app, post it in the thread with a decision card (two or three wording options), and keep the PR open until he picks.
   - A real decision, a prod data step or a prod check: add a `PT-` item to `PAUL_TODO.md`, move the AB item to Blocked naming it, and post one decision card in the thread.
   - An item that isn't worth doing (a minor with no user impact, never security): move it to Known limits with a one-line reason in the same PR, and list it in the weekly line.
6. **Close out.** Add the night's merged branches to AB-112 in one small docs PR and merge it. Post in the thread only if something needs Paul or a PR is stuck.

## Weekly line (Sunday run)

After the Sunday run, post one line in the thread from the git history of `AGENT_BACKLOG.md` over the past 7 days: open count then and now, items closed, items added, items moved to Known limits, and what is waiting on Paul. Example: "Backlog 197 → 168: 36 closed, 7 added, 2 to Known limits. Waiting on you: PT-146, PT-213."

## Never

Push to `main`, open a flag on prod, run anything against prod data, delete branches, skip or disable a test to get green, or take an item that another thread's open PR already covers.
