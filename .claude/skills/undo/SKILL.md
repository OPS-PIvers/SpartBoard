---
name: undo
description: Safely back out a change in SpartBoard work, from unsaved edits to a merged PR, without losing anything else. Use for "/undo", "undo that", "go back", "throw this away", "revert", "I broke it".
---

# Undo

Always show what will be thrown away (`git status`, `git diff`, `git log --oneline origin/dev-paul..HEAD`) and get a clear yes before running anything.

| Situation                          | Do this                                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| Edits not committed, one file      | `git restore <file>`                                                                          |
| Edits not committed, everything    | `git restore .` and, for new files, `git clean -n` first to list, then `git clean -f <files>` |
| Last commit, not pushed            | `git reset --soft HEAD~1` (the changes stay, unsaved)                                         |
| Commits pushed, PR not merged      | `git revert <sha>` then push. No force-push.                                                  |
| PR already merged into dev-paul    | New branch from `origin/dev-paul`, `git revert <merge sha>`, then `/ship` it                  |
| Whole session was a dead end       | Leave the branch; close the session. An unused branch harms nothing.                          |
| Preview site shows the wrong thing | `/preview` again from the right branch                                                        |

## Never

- `git reset --hard` on anything that's been pushed, or on `dev-paul` or `main`.
- Force-push `dev-paul` or `main`, or delete someone else's branch.
- Discard work in another worktree or session.
- Edit dev or prod data to "undo" a code change. Data fixes go to Paul.

If a change is live on prod and hurting teachers, send it to Paul for `/hotfix`; he can also roll the prod site back to the previous release.
