# Release note fragments

Add What's New entries and widget notes here, one JSON file per PR, instead of editing `public/changelog.json`. Parallel PRs then never touch the same file, so they never conflict over release notes.

Name the file after your branch or change, for example `changelog.d/quiz-question-audio.json`:

```json
{
  "entries": [],
  "widgetNotes": []
}
```

- Either array can be left out. Each item has exactly the shape it has in `public/changelog.json`.
- The app serves `public/changelog.json` with every fragment folded in. New entries slot in newest-first by `version`, and new widget notes go on top.
- Use the release day's `version` (`YYYY.MM.DD.N`). If two PRs pick the same `version` or note `id`, the later file (by name) is renumbered with a warning instead of failing the build. An entry older than the newest one gets no update prompt, and the merge warns about it.
- A malformed fragment fails the tests in its own PR.
- `node scripts/changelogFragments.ts check` validates the fragments.
- `node scripts/changelogFragments.ts collect` folds every fragment into `public/changelog.json` and deletes them. The promote follow-ups PR runs it after a release. What teachers see is the same before and after.
- Edit or remove a note that already shipped in `public/changelog.json` itself.

Writing rules: "How to write a release note" in `docs/DEV_WORKFLOW.md`.
