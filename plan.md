Plan:

1. **Explore Data Handoff Connection**
   - Connect `TextWidget` to `ConceptWeb`. This fulfills the prompt's exact example: "Does Widget A generate a list, number, or string that Widget B requires as input? Ex: Text Area (Input) → Word Cloud (Visualization)."
   - By adding an "Import from Text Widget" button to the `ConceptWebSettings`, teachers can rapidly generate concept webs/mind maps from text they've pasted or written in a Text widget.

2. **Update `ConceptWeb/Settings.tsx`**
   - Import `useDashboard`, `Type`, `RefreshCw` icons.
   - Add `activeDashboard` and `addToast` from `useDashboard`.
   - Add `importFromTextWidget()` method:
     - Find Text widgets.
     - Extract plain text by splitting on `\n`.
     - Filter empty lines.
     - Convert each line into a `ConceptNode`. Lay them out evenly (e.g., in a circle or a grid).
     - Update the ConceptWeb config with the new nodes (replacing existing ones or appending to them).

3. **Verify and Update Tests**
   - Check if `ConceptWeb` has a settings test or widget test.
   - Read the test files and mock the text widget properly if necessary.

4. **Complete Pre-Commit Steps**
   - `pnpm run install:all`
   - `pnpm eslint . --fix`
   - `pnpm run validate`

5. **Submit Change**
   - Push branch and submit.
