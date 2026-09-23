# Developer Workflow Guide

## Development Branch Setup

Dev branches deploy to a separate Firebase project, `spartboard-dev`, with its own Firestore, Storage, Auth and Cloud Functions. Production (`spartboard`) changes only when `main` moves.

### Branch Names

- Any branch starting with `dev-` (e.g., `dev-paul`) deploys the whole app — hosting, rules, indexes, Storage rules and functions — to `spartboard-dev`. The project has one site, so concurrent `dev-*` branches overwrite each other.

### How It Works

1. **Create your branch** (if it doesn't exist):

   ```bash
   git checkout -b dev-[your-name]
   ```

2. **Make your changes and commit**:

   ```bash
   git add .
   git commit -m "Your commit message"
   ```

3. **Push to your dev branch**:

   ```bash
   git push origin dev-lead  # or your specific branch
   ```

4. **Automatic deployment**: GitHub Actions will automatically:
   - Build your code
   - Deploy everything to `spartboard-dev`, served at `https://spartboard-dev.web.app`
5. **Find your URL**:
   - Go to your repo's "Actions" tab on GitHub
   - Click on the latest workflow run
   - Look for the "Comment deployment URL" step or check the workflow summary

### Dev Project Characteristics

- **Isolated data**: dev has its own database. It holds config copied from prod (admins, feature permissions, admin settings, standards, buildings, the mock test class) and no student data. Refresh it with `node scripts/dev-seed/copy-config-from-prod.mjs` (`--dry-run` first).
- **Same Drive app**: dev reuses prod's Google OAuth client, so Drive files created in prod open in dev — and a dev bug can still edit your real Drive files.
- **Placeholders**: ClassLink and Spotify secrets are dummy values in dev; ClassLink nightly sync is off. Use the mock test class for student sign-in.
- **Release compatibility**: rules and function changes still have to tolerate a teacher's already-open tab running the previous client when `main` deploys.

### Creating Pull Requests

Once you're happy with your changes on your dev branch:

1. Test thoroughly on https://spartboard-dev.web.app
2. Create a PR from your dev branch → `main`
3. Request code review
4. After approval and merge, changes will deploy to production (main site)

### Tips

- **Share the dev URL** with team members for early feedback (they sign in with their district account)
- **Test Firebase features** on your preview before merging
- **Keep branches updated**: Regularly merge `main` into your dev branch to stay current
  ```bash
  git checkout dev-lead
  git merge main
  git push origin dev-lead
  ```

## Release Notes ("What's New")

User-facing release notes live in `public/changelog.json` (committed). The latest entry's `version` is what `scripts/generate-version.js` writes into `version.json`, which is what the running app polls to detect "Update Available". So adding a new changelog entry **is** cutting a release as far as the toast is concerned.

When you're ready to ship a release:

1. Run `pnpm changelog:draft` to print a draft entry sourced from your recent commits.
   - Output goes to stdout; redirect or pipe it as you prefer:
     ```bash
     pnpm changelog:draft > /tmp/entry.json    # save to a scratch file
     pnpm changelog:draft | pbcopy             # macOS: copy straight to clipboard
     ```
   - Stderr lists any commits that were skipped (no recognized `feat:`/`fix:` prefix) so you can manually fold them in.
2. Paste the JSON object at the top of `public/changelog.json`'s `entries` array.
3. **Rewrite every bullet against the rules below.** The draft is commit subjects; none of it is publishable as written.
4. Pick a `version` (default is today's date as `YYYY.MM.DD`; add `.2`, `.3` for additional same-day releases). Keep entries newest-first — the consumer hook will log a console warning if it spots them out of order.
5. Commit alongside the rest of your changes.

The next build will pick up the new version automatically, the "Update Available" toast will offer a "What's New" link, and the sidebar's "What's New" entry will show a red "New" badge until users open it.

### How to write a release note

**Both `overview` and `details` are shown to every signed-in user.** `details` is behind a "Read full
update" toggle, not behind a permission check, so there is no place in this file for an engineering
note. If a line would only make sense to someone who read the diff, cut it — an entry with an empty
`details` array is fine and renders without the toggle.

Every bullet has to clear all five of these.

1. **Write what the teacher does or sees, never how it was built.** No file paths, collection names,
   hooks, adapters, rules, caches, flags, hashes, schemas, or "server-side". "Reads the existing
   `plcs/{plcId}/question_banks` headers" tells a teacher nothing; delete the bullet or say what
   changed on their screen.
2. **Never name a feature flag, and never write "admin-only".** A teacher cannot act on either one,
   and the fact that a feature is gated is not news they can use.
3. **Check every claim against what is actually turned on, not what exists in the code.** Curated
   lists like `QUIZ_TRANSLATION_LANGUAGES` are the menu an admin picks from, not the live setting.
   Naming a specific option in a release note hard-codes one school's configuration into a file
   every school reads — describe the capability instead ("any language your school has turned on")
   unless you have confirmed the setting.
4. **Say it the way a person would say it out loud.** "Translations ride the public question through
   the same shuffle as the English strings" fails this; "answer choices are shuffled into the same
   order in every language" passes. Avoid "renders", "parses", "payload", "out of scope", "no-op",
   and "regime".
5. **No em dashes, colons or semicolons inside a sentence.** Rejoin the clause with a conjunction
   rather than splitting it into two stubs. A `Label — ` prefix at the start of a `details` bullet is
   the file's existing convention and stays.

Limitations belong in the notes, in a teacher's words. "Bank-slot quizzes and non-English source
quizzes are out of scope for now" becomes what they cannot do and what they will see instead.

Run `/deslop --writing public/changelog.json` as a final pass before committing.

## Workflow Files

- **Production**: [`.github/workflows/firebase-deploy.yml`](.github/workflows/firebase-deploy.yml) - Deploys `main` to live site
- **Dev Branches**: [`.github/workflows/firebase-dev-deploy.yml`](.github/workflows/firebase-dev-deploy.yml) - Deploys dev branches to the `spartboard-dev` project

## Troubleshooting

- **Workflow not triggering?** Make sure your branch name starts with `dev-` (e.g., `dev-jane`).
- **Build failing?** Check the Actions tab for error details
