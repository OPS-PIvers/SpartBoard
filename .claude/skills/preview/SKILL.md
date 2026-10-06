---
name: preview
description: Put the current work on your own SpartBoard dev site (spartboard-dev-bailey.web.app for Bailey) so it can be tried on a phone, Chromebook or student device. Use for "/preview", "put it on my dev site", "I want to try it on my Chromebook", "update my preview".
---

# Preview

Your dev site shows whatever was last sent to your preview branch. It runs against dev data.

| Who                      | Preview branch     | Site                                                        |
| ------------------------ | ------------------ | ----------------------------------------------------------- |
| Bailey (`bailey.nett@…`) | `dev-bailey`       | https://spartboard-dev-bailey.web.app                       |
| Paul (`paul.ivers@…`)    | `dev-paul-preview` | https://spartboard-dev.web.app (until dev-paul's next push) |

Pick the row from `git config user.email`. Anyone else: stop and ask Paul to add a site (docs/DEV_WORKFLOW.md).

## 1. Save the work

- `git status`. Stage only files that belong to this change and commit with a plain message.
- Never commit `.env.local`, `.env.development.local` or anything under `scripts/service-account-key.json`.

## 2. Bring in dev-paul

```bash
git fetch origin
git rebase origin/dev-paul
```

Backend changes (functions, rules, indexes) only deploy from a branch that contains the latest dev-paul. Resolve conflicts by keeping both sides' intent; if unsure, stop and show the user the conflict.

## 3. Send it

```bash
git push --force-with-lease origin HEAD
git push --force origin HEAD:<preview branch>
```

Force is fine on the preview branch: it's only a pointer to "what's on my site". Never force-push `dev-paul` or `main`.

## 4. Report when it's live

- `gh run list --branch <preview branch> --limit 1` finds the run; watch it in the background with `gh run watch <id>`.
- The site updates when the `deploy-hosting` job finishes (about 3 minutes). Give the URL then.
- If backend files changed, the `deploy` job follows after every check (10+ minutes). If it warns the branch is behind dev-paul, repeat step 2.
- If a check fails, read the log, explain it in plain words, and offer to fix it.
