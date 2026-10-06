# Developing SpartBoard

How to get set up, how to work day to day, and how your work reaches teachers. Agents read this too, so it stays in step with what Claude tells you.

## One-time setup

1. Install Git and the GitHub CLI, sign in, and clone the repo (PowerShell):

   ```powershell
   winget install --id Git.Git -e
   winget install --id GitHub.cli -e
   ```

   Open a new PowerShell window, then:

   ```powershell
   gh auth login --web --git-protocol https
   gh repo clone OPS-PIvers/SpartBoard "$HOME\Desktop\Code\SpartBoard"
   cd "$HOME\Desktop\Code\SpartBoard"
   powershell -ExecutionPolicy Bypass -File scripts/bootstrap-dev.ps1
   ```

   The bootstrap script installs Node 24, pnpm and the Google Cloud CLI, signs you in to GitHub and Google Cloud (dev project only), and installs dependencies. Re-run it any time something seems missing.

2. Open the `SpartBoard` folder in the Claude desktop app, Code tab.

3. Type `/show-me`. The app opens in the browser pane; click **Sign in with Google** with your district account. Then click **Sync from prod** in the sidebar footer to copy your own boards and materials into dev.

## Where things run

| Place                                 | What it is                              | Data                   |
| ------------------------------------- | --------------------------------------- | ---------------------- |
| localhost:3000 (browser pane)         | Your code, live as you edit             | Dev (`spartboard-dev`) |
| https://spartboard-dev-bailey.web.app | Bailey's preview, updated by `/preview` | Dev                    |
| https://spartboard-dev.web.app        | Everything merged into `dev-paul`       | Dev                    |
| https://spartboard.web.app            | What teachers use                       | **Production**         |

Dev data is shared by Paul and Bailey and holds no real student data. Nothing you do locally or on a dev site touches production.

## Everyday commands

| Command        | When                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------- |
| `/new-feature` | Starting something new. Makes a fresh branch and, if teachers would see it, a feature flag. |
| `/fix`         | Something's broken. Paste whatever you were sent.                                           |
| `/show-me`     | See the current change in the browser pane.                                                 |
| `/preview`     | Try it on a phone or Chromebook via your dev site.                                          |
| `/ship`        | It's ready: opens the PR into `dev-paul`, waits for checks and review, merges.              |
| `/undo`        | Back something out safely.                                                                  |

You can also just say what you want in plain words; these commands are shortcuts to the right steps.

## How work reaches teachers

1. Each Claude session works on its own branch, started from `dev-paul`.
2. `/ship` opens a PR into `dev-paul`. Checks run (about 7 minutes) and Claude reviews the diff. When they're green and the review is answered, the PR merges.
3. `dev-paul` deploys to https://spartboard-dev.web.app.
4. Paul releases `dev-paul` to production. Features teachers would see stay behind a flag, switched on only for admins, until Paul opens them to everyone.
5. A prod release is smoke-tested automatically; if the site breaks, it rolls back on its own.

Only Paul merges into `main`. If something is broken for teachers right now, send it to Paul; he has `/hotfix`.

## Safe by default

- GitHub won't merge a PR into `dev-paul` until its checks pass.
- Backend changes (functions, database rules) deploy to dev only after every check, and only from a branch that includes the latest `dev-paul`.
- Your Google Cloud access is to the dev project only.
- You do have the prod service-account key (`scripts/service-account-key.json`) for read scripts. It can write production, so only use it for scripts Paul has pointed you to, and never commit it.

## Don'ts

- Don't run `pnpm run validate`, full `pnpm run test`, `lint` or `tsc` locally; CI does that, and full runs can freeze the machine.
- Don't push to `dev-paul` or `main` directly, or force-push them.
- Don't put student or teacher names in code, commits or PRs.
