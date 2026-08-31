# Widget config board isolation — implementation handoff

**Status:** design settled, not built. All open decisions are resolved (see [Locked decisions](#2-locked-decisions)).
**Branch:** `claude/widget-state-persistence-bug-743dcb` (worktree)
**Ship path:** PR into `dev-paul` → verify on preview URL → regular merge commit into `main`.

This is a self-contained brief. You do not need the originating conversation.

---

## 1. The bug

A teacher reported:

> "When I open up a widget, for example the Links or the To-Dos, it automatically defaults to what I've had on another past board... if I have a German II daily schedule board, I'd want the To-Do list to function separately than the list on the German III daily schedule board."

She runs one board per class section. Adding a Checklist to her German III board pre-fills it with German II's to-do items. Same for the Links widget's saved URLs.

### Root cause

`savedWidgetConfigs` is a **user-global, per-widget-type** store living at `users/{uid}/userProfile/profile`. It is not scoped to a board.

Three code points form the loop:

1. **Write** — `context/DashboardContext.tsx:4898`, inside `updateWidget`:

   ```typescript
   // Save config globally so new instances inherit settings.
   if (updates.config) {
     saveWidgetConfig(widgetType, updates.config);
   }
   ```

   Every config edit on any widget on any board writes into the account-wide store.

2. **Persist** — `context/AuthContext.tsx:2061`, `saveWidgetConfig`, filters the config through `stripTransientKeys` and debounce-writes it to the profile doc.

3. **Read back** — `context/DashboardContext.tsx:4506` (`addWidget`) and `:4610` (`addWidgets`), which merge it into every newly-created widget:

   ```typescript
   config: mergeWidgetConfig(
     defaults.config,
     adminConfig,
     savedWidgetConfigs?.[type],
     overrides?.config
   );
   ```

The only guard is `TRANSIENT_CONFIG_KEYS` in `utils/widgetConfigPersistence.ts` — a hand-maintained **blocklist**. It happens to include the Text widget's `content`, but nobody added the Checklist's `items` or the Links widget's `urls`. So those became account-wide defaults.

This is a deny-by-omission design. Any config key a widget author forgets to blocklist silently becomes cross-board state. `items` and `urls` are the two that surfaced; they are not necessarily the only ones.

### What is NOT happening

An already-placed widget on board A is **never** mutated by an edit on board B. `updateWidget` only touches `activeIdRef.current`'s board. Confirmed with the teacher. Only _newly added_ widgets inherit. One root cause, one code path — do not go looking for a cross-board sync bug.

---

## 2. Locked decisions

Every one of these was put to Paul and answered. Do not relitigate them; if you believe one is wrong, stop and raise it rather than quietly deviating.

| #   | Decision                    | Resolution                                                                                                 |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | Symptom scope               | Only newly-added widgets inherit. Single root cause.                                                       |
| 2   | What may carry over         | **Appearance sticks per-user; all content is strictly per-board.**                                         |
| 3   | Mechanism                   | **Closed allowlist.** Replaces the blocklist entirely.                                                     |
| 4   | Allowlist breadth           | **Visual keys only.** No behavioral preferences (Clock `format24`, Time Tool `selectedSound`) for now.     |
| 5   | Exact key list              | The eleven in §3.1. Signed off individually, `layout` included deliberately.                               |
| 6   | Existing polluted profiles  | **One-time purge on load**, with a backup field.                                                           |
| 7   | Purge safety                | Copy the pre-purge blob to `savedWidgetConfigsPreV2` in the same write.                                    |
| 8   | Explicit preset features    | Stations presets + Hotspot Image library **keep working**, moved to a separate `savedWidgetPresets` field. |
| 9   | The dead blocklist          | **Delete** `TRANSIENT_CONFIG_KEYS` and `stripTransientKeys` and their tests.                               |
| 10  | Already-contaminated boards | **Leave them.** That content is board data now and the teacher can see and delete it.                      |
| 11  | Verification bar            | Unit tests **plus** a live repro in the running app.                                                       |
| 12  | Ship path                   | Normal — `dev-paul` preview first.                                                                         |

---

## 3. Implementation

### 3.1 The allowlist

Replace the blocklist in `utils/widgetConfigPersistence.ts` with:

```typescript
/** Top-level config keys that persist per-user as appearance defaults. Everything else is per-board. */
export const APPEARANCE_CONFIG_KEYS = new Set<string>([
  'fontFamily', // 37 widget configs — shared TypographySettings
  'fontColor', // 27 — shared TypographySettings
  'cardColor', // 25 — shared SurfaceColorSettings
  'cardOpacity', // 25 — shared SurfaceColorSettings
  'textSizePreset', // 11 — shared TextSizePresetSettings
  'bgColor', // TextConfig — sticky-note color (already sticks today)
  'fontSize', // TextConfig (already sticks today)
  'textColor', // MusicConfig
  'titleColor', // MaterialsConfig
  'scaleMultiplier', // ChecklistConfig
  'layout', // ScoreboardConfig | ExpectationsConfig | MusicConfig
]);

export function pickAppearanceKeys(
  config: Partial<WidgetConfig>
): Partial<WidgetConfig> {
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => APPEARANCE_CONFIG_KEYS.has(key))
  ) as Partial<WidgetConfig>;
}
```

**Why `bgColor` and `fontSize` are on the list:** they already stick today. The old blocklist caught the Text widget's `content` but not its color or size. Dropping them would be a user-visible regression, not a fix.

**Why `layout` is on the list:** top-level on Scoreboard (`cards`/`rows`), Music, and Expectations (`secondary`/`elementary`). None of the values carry student or lesson data. A middle-school teacher who picks `elementary` should not re-pick it per board.

**Top-level only.** The allowlist matches top-level config keys and nothing else. Per-item colors nested inside `cards`, `memoryCards`, `nodes` (RevealCard, MemoryCard, ConceptNode) or inside custom-widget `BlockStyle` / `GlobalStyle` objects travel with their content and must never be listed. Do not flatten or deep-walk.

### 3.2 Wire it in

- `mergeWidgetConfig` — swap `stripTransientKeys(saved ?? {})` for `pickAppearanceKeys(saved ?? {})`. The layer order (defaults → adminConfig → saved → overrides) does not change.
- `AuthContext.tsx:2061` `saveWidgetConfig` — swap both `stripTransientKeys` calls for `pickAppearanceKeys`. Keep the existing early return when the filtered object is empty; it now fires far more often, which is a welcome drop in profile writes.
- **Delete** `TRANSIENT_CONFIG_KEYS`, `stripTransientKeys`, and their block in `tests/utils/widgetConfigPersistence.test.ts`. Under an allowlist they are unreachable — anything they blocked is already excluded.
- `PII_WIDGET_FIELDS` in `utils/dashboardPII.ts` **stays.** It is separately load-bearing for `scrubDashboardPII` on the board-write path, which this work does not touch. Only remove the now-unused import from `widgetConfigPersistence.ts`.
- `components/widgets/VideoActivityWidget/Widget.tsx:401` has a comment referencing `stripTransientKeys` by name. Update it — `view` is still not persisted, but now because it isn't on the allowlist rather than because it's on a blocklist.

### 3.3 Move the explicit presets

Two widgets use `savedWidgetConfigs` deliberately, as an opt-in "save this for later" feature. They are not the bug and must keep working. Both store under the same nested key name:

| Widget        | Current location                                   | Files                                                                                                 |
| ------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Stations      | `savedWidgetConfigs.stations.savedLibrary`         | `Stations/components/SavedPresetsPanel.tsx` (read :24, write :45, :93), `Stations/Settings.tsx` (:77) |
| Hotspot Image | `savedWidgetConfigs['hotspot-image'].savedLibrary` | `HotspotImage/Settings.tsx` (read :132, write :150, :171)                                             |

Move both to a new top-level profile field, `savedWidgetPresets`, with the same `Partial<Record<WidgetType, ...>>` shape. Add a `saveWidgetPreset` action alongside `saveWidgetConfig` in `AuthContext`, expose both on `AuthContextValue`, and update the two widgets to read/write the new field.

Migrate existing presets in the same one-time pass as the purge: if `savedWidgetConfigs[type].savedLibrary` exists, lift it into `savedWidgetPresets[type].savedLibrary` before the purge strips it. **A teacher losing her saved station sets is a worse outcome than the original bug** — get this right and cover it with a test.

Note `Stations/Settings.tsx:77` builds `protectedImageUrls` from the preset library to decide which Drive blobs are safe to delete. If that read returns empty because the migration dropped data, the widget will delete images that are still referenced. Verify it explicitly.

### 3.4 The purge — read this before writing it

On profile load (`AuthContext.tsx:1543`, the `savedWidgetConfigs` block), if the stored blob contains any key outside the allowlist:

1. Copy the original blob to `savedWidgetConfigsPreV2`.
2. Lift any `savedLibrary` entries into `savedWidgetPresets` (§3.3).
3. Write back the allowlist-filtered `savedWidgetConfigs`.
4. Mark it done so it runs once, not on every snapshot fire.

**The trap:** `setDoc(..., { merge: true })` performs a _deep_ merge on map fields. Writing a cleaned `savedWidgetConfigs` map with `merge: true` will **not remove** the stale nested keys — they survive and keep leaking. This is also why the existing `saveWidgetConfig` has never been able to shed a key.

Use `updateDoc(ref, { savedWidgetConfigs: cleaned, ... })`, which replaces a whole top-level field value, or an explicit `deleteField()` followed by a write. Whichever you pick, **assert key removal in a test** — a passing write that silently kept the data is the exact failure this work exists to prevent.

Also mind the warning at `types.ts:6445`: the profile doc is written by two contexts and the codebase forbids non-merge writes to the path. `updateDoc` on specific top-level fields respects that; a bare `setDoc` without merge does not. Do not clobber the doc.

Add `savedWidgetPresets` and `savedWidgetConfigsPreV2` to the `UserProfile` interface in `types.ts` (~:6447) with doc comments explaining what they hold and why the backup exists.

### 3.5 Out of scope

- **Do not** clean widgets on existing boards. That content is board data now, it is visible to the teacher, and auto-deleting it is a worse failure than leaving it.
- **Do not** extend the allowlist with behavioral preferences. Those get added one key at a time when someone asks for them.
- **Do not** move presets to their own Firestore subcollection. A separate profile field was chosen deliberately over new security rules.

---

## 4. Verification

Both halves are required. A green unit test on a pure function does not prove the Firestore round-trip or the migration.

**Unit tests** (`tests/utils/widgetConfigPersistence.test.ts`, rewritten):

- `pickAppearanceKeys` keeps all eleven keys and drops `items`, `urls`, `firstNames`, `lastNames`, `completedNames`, `content`, `hotspots`, `savedLibrary`.
- An unknown key invented by a future widget is dropped without registration.
- Nested `bgColor` inside a `cards` array survives untouched (not flattened).
- `mergeWidgetConfig` layer precedence is unchanged.
- Purge: stale keys are genuinely absent from the written payload; backup field is populated; `savedLibrary` lands in `savedWidgetPresets` for both widget types; the purge is idempotent and does not re-run on a clean profile.

**Live app repro** — this is the one that actually proves the teacher's bug is fixed:

1. `pnpm run dev`. Create two boards, "German II" and "German III".
2. On German II: add a Checklist, enter to-do items, set the font to something distinctive.
3. Switch to German III, add a Checklist. **Items must be empty. The font must carry over.**
4. Add a Links widget on each with different URLs. Confirm isolation.
5. Switch back to German II. Its items are still there.
6. Reload the page. Both boards still hold their own data.
7. Open Stations, save a preset, reload, confirm the preset survived the migration.

**Before pushing:** `pnpm run validate` (type-check + lint + format + tests). Zero warnings — lint runs `--max-warnings 0`.

---

## 5. Follow-ups (not part of this PR)

- Paul is drafting a reply to the reporting teacher. She needs to know her existing boards require a one-time manual cleanup and that her styling choices will still follow her.
- `CLAUDE.md` has **already been updated** with the board-isolation contract — see "Board isolation: config keys are per-board unless explicitly allowlisted" under Widget Development Patterns → Persistence, plus a bullet in Common Gotchas. It documents the post-fix behavior. Your job is to make the code match it; if you deviate from the key list or the field names, update CLAUDE.md in the same PR so the two do not drift.
