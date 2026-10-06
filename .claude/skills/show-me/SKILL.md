---
name: show-me
description: Run SpartBoard locally against the dev project and show the current change in the Claude browser pane, signed in for real, with a screenshot. Use for "/show-me", "show me", "let me see it", "what does it look like", "open the app".
---

# Show me

## 1. Start the app on dev

- `preview_start` with `{ name: "vite-dev" }`. It runs against `spartboard-dev` (real sign-in, dev data). Never use `vite-dev-prod` here, and don't use `vite-harness` to view the app.
- Drive and the Picker only work on ports 3000-3004. If the server landed elsewhere, say so.

## 2. Sign in

- If the page shows "Sign in with Google", ask the user to click it and sign in in the browser pane. Never type an email or password yourself.
- The sign-in sticks for this port, so it's only needed once.
- First time on dev? Their boards and materials are empty. The **Sync from prod** button in the sidebar footer copies their own prod boards and materials into dev (one way, prod is only read).

## 3. Go to the change

- `git diff --name-only origin/dev-paul...HEAD` shows what changed. Work out which widget, page or setting that is.
- Open it the way a teacher would: add the widget from the dock, open its settings, open the admin page. Use `read_page` and `find` to locate controls.
- Student pages (`/quiz`, `/join`, …) need a session code from the teacher side first.

## 4. Show it

- Take a screenshot of the change.
- `read_console_messages` with `onlyErrors: true`; report any errors in plain words.
- Say what you're showing and anything that looks wrong. Don't fix things the user didn't ask about; offer instead.

## Notes

- Dev data is shared by Paul and Bailey. Don't delete or rename things you didn't create.
- The pane is a real browser: whatever is open on localhost saves to dev like any client.
