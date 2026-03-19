---
description: 'Saves work, syncs from main, lints, and pushes to update the dev preview URL.'
---

You are a technical assistant. Execute the following steps to save work and update the preview safely:

### PHASE 1: Save

1. Run `git add .`.
2. Run `git diff --cached` to analyze the staged changes.
3. Generate a concise, one-line technical commit message summarizing the changes.
4. Run `git commit -m "[AI] $GENERATED_MESSAGE"`.

### PHASE 1.5: Hygiene

5. Run `pnpm run lint:fix` to resolve any basic formatting or syntax issues.
6. If lint:fix modified files, stage and commit them: `git add . && git commit -m "chore: lint fixes"`.

### PHASE 2: Sync & Integrate

7. Run `git fetch origin`.
8. Run `git merge origin/$(git branch --show-current)` to sync with the remote tracking branch.
   - If merge conflicts occur: resolve them, then `git add . && git commit -m "chore: merge remote into $(git branch --show-current)"`.
9. Run `git merge origin/main` to integrate latest main.
   - If merge conflicts occur: analyze and resolve the conflicts (imports, logic, etc.) without asking. Then `git add . && git commit -m "chore: merge origin/main into $(git branch --show-current)"`.
   - If you cannot resolve a conflict, explain the blockage and stop.

### PHASE 3: Upload

10. Run `git push origin $(git branch --show-current)`.

11. Report: "Changes saved, integrated from main, and pushed. Your GitHub Actions dev preview is now updating."
