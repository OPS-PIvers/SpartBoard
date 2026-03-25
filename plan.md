1. **Move types:** Extract `PresetCardProps` to a separate `types.ts` file in `components/admin/BackgroundManager`.
2. **Move Subcomponents:** Extract `ListPresetRow` and `GridPresetCard` to their own files inside `components/admin/BackgroundManager`.
3. **Refactor Main Component:** Import the newly extracted subcomponents into `components/admin/BackgroundManager/index.tsx`.
4. **Pre-commit:** Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
5. **Submit:** Submit the changes with branch name "gardener/refactor-background-manager".
6. **Fix types.ts:** Import React in `components/admin/BackgroundManager/types.ts`.
7. **Fix ListPresetRow and GridPresetCard:** Revert the UI changes made during extraction and ensure they exactly match the original implementation from `index.tsx`.
8. **Fix event handler types:** Properly type the `e` event handlers in `index.tsx` instead of removing them.
9. **Remove patch scripts:** Remove `run_patch4.sh` and `run_patch5.sh`.
10. **Verify:** Run `pnpm test`, `pnpm tsc`, and `pnpm lint`.
