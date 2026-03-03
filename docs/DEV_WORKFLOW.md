# Developer Workflow Guide

## Development Branch Setup

Each developer has their own persistent test environment on Firebase Hosting.

### Branch Names

- `dev-paul` - Lead developer test environment
- `dev-jen` - Developer 1 test environment
- `dev-bailey` - Developer 2 test environment
- `dev-joel` - Joel's test environment
- `dev-jason` - Jason's test environment

### How It Works

1. **Create your branch** (if it doesn't exist):

   ```bash
   git checkout -b dev-paul  # or dev-jen, dev-bailey, dev-joel, dev-jason
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
     - dev-paul: spartboard--dev-paul-g42pu859.web.app
     - dev-jen: spartboard--dev-jen-w38uta3f.web.app
     - dev-bailey: spartboard--dev-bailey-2w0bszdm.web.app
     - dev-joel: spartboard--dev-joel-w38uta3f.web.app (example)
     - dev-jason: spartboard--dev-jason-w38uta3f.web.app (example)
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

## Workflow Files

- **Production**: [`.github/workflows/firebase-deploy.yml`](.github/workflows/firebase-deploy.yml) - Deploys `main` to live site
- **Dev Branches**: [`.github/workflows/firebase-dev-deploy.yml`](.github/workflows/firebase-dev-deploy.yml) - Deploys dev branches to preview channels

## Troubleshooting

- **Workflow not triggering?** Make sure you pushed to the exact branch name (`dev-lead`, `dev-developer1`, or `dev-developer2`)
- **Build failing?** Check the Actions tab for error details
- **Need different branch names?** Edit [`.github/workflows/firebase-dev-deploy.yml`](.github/workflows/firebase-dev-deploy.yml) and update the branch list
