# Developer Workflow Guide

## Development Branch Setup

Each developer has their own persistent test environment on Firebase Hosting.

### Branch Names

- Any branch starting with `dev-` (e.g., `dev-paul`, `dev-jane`) will automatically trigger a preview deployment.

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
   - Deploy to a Firebase preview channel
     - Give you a unique URL like: `https://spartboard--dev-lead-XXXXXXXX.web.app`
5. **Find your URL**:
   - Go to your repo's "Actions" tab on GitHub
   - Click on the latest workflow run
   - Look for the "Comment deployment URL" step or check the workflow summary

### Preview URL Characteristics

- **Persistent**: Same URL for each branch (doesn't change with each push)
- **Auto-updating**: Each push to your branch updates the preview
- **Duration**: Previews expire after 30 days of inactivity (automatically renewed on push)
- **Independent**: Each branch has its own isolated environment

### Creating Pull Requests

Once you're happy with your changes on your dev branch:

1. Test thoroughly on your preview URL
2. Create a PR from your dev branch → `main`
3. Request code review
4. After approval and merge, changes will deploy to production (main site)

### Tips

- **Share your preview URL** with team members for early feedback
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
3. **Rewrite each highlight in user-friendly language** — short, plain, what changed from a teacher's perspective. Drop anything internal-only.
4. Pick a `version` (default is today's date as `YYYY.MM.DD`; add `.2`, `.3` for additional same-day releases). Keep entries newest-first — the consumer hook will log a console warning if it spots them out of order.
5. Commit alongside the rest of your changes.

The next build will pick up the new version automatically, the "Update Available" toast will offer a "What's New" link, and the sidebar's "What's New" entry will show a red "New" badge until users open it.

## Workflow Files

- **Production**: [`.github/workflows/firebase-deploy.yml`](.github/workflows/firebase-deploy.yml) - Deploys `main` to live site
- **Dev Branches**: [`.github/workflows/firebase-dev-deploy.yml`](.github/workflows/firebase-dev-deploy.yml) - Deploys dev branches to preview channels

## Troubleshooting

- **Workflow not triggering?** Make sure your branch name starts with `dev-` (e.g., `dev-jane`).
- **Build failing?** Check the Actions tab for error details
