Please optimize my deployment pipeline and local AI commands to speed up development by making the following exact updates to these three files:

# 1. Update `.github/workflows/firebase-dev-deploy.yml`

Replace the entire contents of `.github/workflows/firebase-dev-deploy.yml` with the following YAML. This splits the sequential checks into parallel background processes, vastly speeding up the CI run:

```yaml
name: Deploy Dev Branches to Firebase Preview

on:
  push:
    branches:
      - dev-paul
      - dev-jen
      - dev-bailey
      - dev-joel
      - dev-jason

jobs:
  quality-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm run install:ci

      - name: Code Quality & Testing
        run: |
          pnpm run type-check:all &
          pnpm run lint &
          pnpm run format:check &
          pnpm run test &
          wait
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
          VITE_GEMINI_API_KEY: ${{ secrets.VITE_GEMINI_API_KEY }}
          VITE_OPENWEATHER_API_KEY: ${{ secrets.VITE_OPENWEATHER_API_KEY }}

  deploy-preview:
    needs: quality-and-test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm run install:ci

      - name: Build project
        run: pnpm run build:all
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
          VITE_GEMINI_API_KEY: ${{ secrets.VITE_GEMINI_API_KEY }}
          VITE_OPENWEATHER_API_KEY: ${{ secrets.VITE_OPENWEATHER_API_KEY }}

      - name: Extract branch name
        id: extract_branch
        run: echo "branch=${GITHUB_REF#refs/heads/}" >> $GITHUB_OUTPUT

      - name: Deploy to Firebase Preview Channel
        id: deploy
        run: |
          echo '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}' > service-account.json
          export GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
          OUTPUT=$(pnpm exec firebase hosting:channel:deploy ${{ steps.extract_branch.outputs.branch }} --expires 30d --project spartboard --json)
          rm -f service-account.json
          echo "$OUTPUT"
          URL=$(echo "$OUTPUT" | grep -o '"url": *"[^"]*"' | head -n 1 | cut -d '"' -f 4)
          echo "details_url=$URL" >> $GITHUB_OUTPUT

      - name: Comment deployment URL
        run: |
          echo "### 🚀 Deployment Successful!" >> $GITHUB_STEP_SUMMARY
          echo "**Preview URL:** ${{ steps.deploy.outputs.details_url }}" >> $GITHUB_STEP_SUMMARY
          echo "**Branch:** ${{ steps.extract_branch.outputs.branch }}" >> $GITHUB_STEP_SUMMARY

----------------------------------------------------------------------------------------------------------------------
2. Update .gemini/commands/preview.toml
Replace the entire contents of .gemini/commands/preview.toml with the following to remove the heavy local validation step:

Ini, TOML
description = "Saves work, integrates from main, formats code, and updates online preview."
prompt = """

You are a technical assistant. Execute the following steps to save work and update the preview safely:

### PHASE 1: Save
1. Run `git add .`.
2. Run `git diff --cached` to analyze changes.
3. Generate a concise, one-line technical commit message.
4. Run `git commit -m "[AI] $GENERATED_MESSAGE"`.

### PHASE 2: Sync & Integrate
5. Run `git fetch origin`.
6. Run `git merge origin/$(git branch --show-current)`.
    - Resolve any immediate conflicts from the remote branch.
7. Run `git merge origin/main`.
    - **If merge conflicts occur**:
        - Analyze the conflicts.
        - Resolve the conflicts immediately (imports, logic, etc.) without asking the user.
        - Run `git add .` and `git commit -m "chore: merge origin/main into $(git branch --show-current)"`.
        - If you get stuck, explain the blockage and stop.

### PHASE 3: Format
8. Run `pnpm run lint:fix` to resolve any basic formatting or syntax issues quickly.

### PHASE 4: Upload
9. Run `git push origin $(git branch --show-current)`.

10. Report: "Changes saved, integrated from Main via merge, and formatted. Your development URL is now being updated by GitHub Actions."
"""

_________________________________________________________________________________________________________________________________________
3. Update .gemini/commands/submit.toml
Replace the entire contents of .gemini/commands/submit.toml with the following:

Ini, TOML
description = "Final formatting and submission of your work for review."
prompt = """

You are a technical assistant. Execute the following steps to ensure a clean submission:

### PHASE 1: Save & Integrate
1. Run `git add .`.
2. Run `git commit -m "[AI] pre-submission sync"`. (Note: This might fail if nothing to commit, which is fine, just proceed).
3. Run `git fetch origin`.
4. Run `git merge origin/$(git branch --show-current)`.
    - Resolve any immediate conflicts from the remote branch.
5. Run `git merge origin/main`.
    - **If merge conflicts occur**:
        - Analyze and resolve conflicts immediately. Use your engineering tools to fix files, `git add .`, and `git commit -m "chore: merge origin/main into $(git branch --show-current)"`.

### PHASE 2: Format
6. Run `pnpm run lint:fix` to format the code nicely before submission.

### PHASE 3: Upload
7. Run `git push origin $(git branch --show-current)`.

### PHASE 4: Submit
8. Run `git branch --show-current` to identify the branch.
9. Run `gh pr list --head $(git branch --show-current) --json url --state open` to check for an existing PR.
10. Run `git diff origin/main... --stat` to summarize changes.
11. Based on the diff, write a one-to-two paragraph summary of "What changed" and "Why."
12. Logic:
    - 12A) If no existing PR: Run `gh pr create --title "Review Request: $(git branch --show-current)" --body "$AI_SUMMARY" --base main`.
    - 12B) If PR exists: Run `gh pr edit --body "$AI_SUMMARY"`.

13. Report: "Changes integrated via merge, formatted, and submitted. CI validation is currently running on GitHub. View the submission here: [URL]"
"""
```
