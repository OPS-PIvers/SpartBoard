1. **Move `hexToRgba` to `utils/styles.ts`**
   - Extract the `hexToRgba` function implementation to `utils/styles.ts` so it can be reused across all widgets.
   - The standardized implementation will be:
     ```typescript
     /** Converts a hex color + alpha into an rgba() CSS string. */
     export const hexToRgba = (hex: string | undefined, alpha: number): string => {
       const clean = (hex ?? '#ffffff').replace('#', '');
       const a =
         typeof alpha === 'number' && !isNaN(alpha)
           ? Math.max(0, Math.min(1, alpha))
           : 1;
       if (clean.length !== 6) return \`rgba(255, 255, 255, \${a})\`;
       const r = parseInt(clean.slice(0, 2), 16);
       const g = parseInt(clean.slice(2, 4), 16);
       const b = parseInt(clean.slice(4, 6), 16);
       if (isNaN(r) || isNaN(g) || isNaN(b)) return \`rgba(255, 255, 255, \${a})\`;
       return \`rgba(\${r}, \${g}, \${b}, \${a})\`;
     };
     ```

2. **Refactor occurrences in `components/widgets/`**
   - **Checklist Widget** (`components/widgets/Checklist/constants.ts`): Remove `hexToRgba` from `constants.ts` and update imports in `ChecklistCard.tsx` to use the one from `utils/styles.ts`.
   - **Calendar Widget** (`components/widgets/Calendar/constants.ts`): Remove `hexToRgba` from `constants.ts` and update imports in `Widget.tsx` to use the one from `utils/styles.ts`.
   - **Schedule Widget** (`components/widgets/Schedule/utils.ts`): Remove `hexToRgba` from `utils.ts` and update imports in `ScheduleRow.tsx` to use the one from `utils/styles.ts`.
   - **SpecialistSchedule Widget** (`components/widgets/SpecialistSchedule/SpecialistScheduleWidget.tsx`): Remove inline `hexToRgba` and import it from `utils/styles.ts`.

3. **Verify refactor**
   - Use `pnpm lint --fix` and `pnpm run validate` to ensure TypeScript compilation, tests, and formatting pass.

4. **Add entry to journal**
   - Add entry to `.Jules/unifier.md` about standardizing `hexToRgba` across widgets.

5. **Complete pre-commit steps**
   - Complete pre-commit steps to make sure proper testing, verifications, reviews and reflections are done.

6. **Submit PR**
   - Submit PR with title "📐 Unifier: Standardized hexToRgba utility function"
