# What's New Overview Redesign — Design

## Goal

Make each release entry in the "What's New" modal digestible in 20–30 seconds at a glance, while still preserving an exhaustive patch-notes record for teachers who want every detail. Replace the current flat, type-grouped list with a two-tier presentation: a hand-curated **overview** organized by concept-level themes (default view), and an opt-in **details** view that mirrors today's flat by-type list.

## Motivation

A release that ships 20+ user-facing changes (e.g. the 2026-05-19 Collections + sharing + Boards-manager refresh) currently becomes a wall of equal-weight bullets. The headline ("Collections!") sits at the same visual level as the trivia ("text editor selection across paragraphs"). Teachers close the modal without reading. The fix is to give the curator two surfaces — one for the elevator pitch, one for completeness — and to group the elevator pitch by concept rather than by change-type.

## Current state

- `public/changelog.json` — array of entries shaped `{ version, date, title, highlights: [{ type, text }] }`. Two entries exist today: `2026.05.19` (8 highlights) and `2026.05.18` (1 highlight).
- `hooks/useChangelog.ts` — fetches the JSON, exposes `entries`, `latestVersion`, `entriesSinceCurrent(version)`. Module-level cache dedupes concurrent fetches. Tests cover the hook in `tests/hooks/useChangelog.test.ts`.
- `components/layout/WhatsNewModal.tsx` — renders each entry's `highlights` flat, grouped by `type` in fixed order (`feature` → `improvement` → `fix`). Each entry shows: title, version slug, date, optional "Your build" badge, type-count pills, then three sections of bulleted highlights.
- `locales/en.json` — keys under `whatsNew.*` for title, group labels, current-build badge, loading/error states, button labels.

## Proposed design

### Schema

Types defined in `hooks/useChangelog.ts`, matched by `public/changelog.json`:

```ts
export type ChangelogHighlightType = 'feature' | 'improvement' | 'fix';

// Unchanged shape; used for the exhaustive details view.
export interface ChangelogHighlight {
  type: ChangelogHighlightType;
  text: string;
}

// Recursive bullet for the overview. `items` holds sub-bullets.
export interface ChangelogBullet {
  text: string;
  items?: ChangelogBullet[];
}

// A themed section under a single type. `subtitle` is optional so
// theme-less sections (e.g. flat Fixes with no concept grouping)
// fall out naturally.
export interface ChangelogThemedSection {
  type: ChangelogHighlightType;
  subtitle?: string;
  items: ChangelogBullet[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  overview?: ChangelogThemedSection[]; // NEW — optional, hand-curated
  details: ChangelogHighlight[]; // RENAMED from `highlights`
}
```

Key calls:

- **`overview` is optional, `details` is required.** Every release must have an exhaustive `details` record; the `overview` is a curated subset/restatement for the elevator pitch. A release without `overview` renders flat-from-`details` (no disclosure button). A release without `details` is invalid (enforced by the TS type).
- **`details` is independent of `overview`.** Items can appear in both, only in details, or be reworded differently between the two. The curator owns the elevator pitch separately from the patch notes.
- **`overview` is a flat tagged array.** Curator writes themed sections in any order; the renderer groups by `type` at render time into "New / Improvements / Fixes" buckets, preserving curator order within each type.
- **Bullets are always objects (`{ text, items? }`).** Uniform shape; `items` is omitted when there are no sub-bullets. Curator convention is to nest at most one level deep (enforced by the Routine prompt, not the schema).
- **Theme-less sections** (e.g. flat Fixes with no concept grouping) are expressed as a `ChangelogThemedSection` with no `subtitle` — the renderer simply prints the bullets directly under the type heading.

### JSON migration

The 2 existing entries in `public/changelog.json` get migrated in-place. The `highlights` field is renamed to `details` (no content changes). The 2026.05.19 entry additionally gets a hand-curated `overview` field added that themes the headline content (Collections / Quiz Response Security / Boards manager refresh). The 2026.05.18 entry stays details-only (a single-bullet release doesn't warrant an overview).

Example of the 2026.05.19 entry after migration:

```json
{
  "version": "2026.05.19",
  "date": "2026-05-19",
  "title": "Collections, sharing, and a Boards manager refresh",
  "overview": [
    {
      "type": "feature",
      "subtitle": "Collections",
      "items": [
        {
          "text": "Group your boards into folders so a busy dashboard list stays organized."
        },
        {
          "text": "Pick a color, then drag boards into the Collection from the Boards manager."
        },
        {
          "text": "Share a whole Collection with a colleague, or save it as a template to reuse next year."
        },
        {
          "text": "Pin frequently used boards so they appear at the top regardless of which Collection is active."
        }
      ]
    },
    {
      "type": "improvement",
      "subtitle": "Quiz response security",
      "items": [
        {
          "text": "Two new options when publishing quiz results for student review:",
          "items": [
            {
              "text": "Watermark — a faint identifier behind each student's responses so screenshots are traceable."
            },
            {
              "text": "Tab-navigation lock — pick how many times a student can leave the results tab before it locks."
            }
          ]
        },
        {
          "text": "Unlock one student at a time without reopening the whole assignment."
        }
      ]
    },
    {
      "type": "improvement",
      "subtitle": "Boards manager refresh",
      "items": [
        {
          "text": "Every card shows a visual preview of its widgets, and you can drag from anywhere on the card."
        },
        {
          "text": "Collections and Boards each get their own button instead of a shared kebab menu."
        }
      ]
    }
  ],
  "details": [
    {
      "type": "feature",
      "text": "Collections — group your boards into folders, share a whole folder with another teacher, or save one as a template to reuse next year."
    },
    {
      "type": "feature",
      "text": "Pin boards across Collections — your favorites now appear at the top of the bottom-left Boards menu no matter which folder they live in."
    },
    {
      "type": "feature",
      "text": "Quiz results — watermark + warning if students try to screenshot, and you can now unlock one student at a time without reopening the whole assignment."
    },
    {
      "type": "improvement",
      "text": "Boards manager refreshed — every card now shows a visual preview of the widgets, you can drag from anywhere on the card, and Collections/Boards each get their own button instead of a single kebab."
    },
    {
      "type": "improvement",
      "text": "Quieter Google Drive reconnect prompt — one banner per session instead of one for every failed sync."
    },
    {
      "type": "fix",
      "text": "Quiz rapid-tap lockout now fires reliably on the first tap — answers no longer slip past after a fast double-tap."
    },
    {
      "type": "fix",
      "text": "Sound Widget no longer gets stuck silent after switching browser tabs."
    },
    {
      "type": "fix",
      "text": "Text editor selection now extends across paragraphs and list items instead of stopping at the first block."
    }
  ]
}
```

### Renderer behavior

`WhatsNewModal.tsx` is refactored around an `<Entry>` sub-component:

**Entry header (simplified from today):**

- Title on its own line, unchanged styling.
- Date below the title in human format (`May 19, 2026`) via `Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' })`.
- **Removed:** version slug (was redundant with the date — the version `2026.05.19` is literally the date in slug form; version still exists in JSON for `entriesSinceCurrent` matching, just not displayed).
- **Removed:** "Your build" badge (the sidebar's unread badge and the "Update Available" toast already cover the "am I current?" signal; in-modal noise).

**When `overview` is present and non-empty:**

1. Render the entry header.
2. Render the overview: group `overview` sections by `type` in fixed order (`feature` → `improvement` → `fix`), preserving curator order within each type. Each type bucket gets a type-label heading ("New" / "Improvements" / "Fixes"). Inside each bucket, sections with `subtitle` render the subtitle as a bold subhead followed by the bullets; sections without `subtitle` render the bullets flat under the type heading.
3. Render the disclosure button below the overview: `Read full update ▾` (collapsed) or `Show less ▴` (expanded).
4. When expanded: render the flat-by-type details view below the button, using `details`.

**When `overview` is absent or empty:**

- Skip steps 2–3 entirely.
- Render the flat-by-type details view directly from `details`, with no disclosure button. This is the current behavior, preserved for small releases.

**Type-count pills removed.** The current pills (`🌟 New · 3`, `↗ Improvements · 2`, `🔧 Fixes · 3`) disappear from both the overview view (themed subheads do better grouping work) and the details view (type-grouped section headings inside details already serve as visual anchors). Pure type hierarchy carries the structure.

### Visual treatment

- **Type heading** (overview and details): existing `text-xxs font-bold text-slate-500 uppercase tracking-wide` — keeps the typographic vocabulary consistent with the current renderer.
- **Themed subtitle** (overview only): `text-sm font-bold text-slate-800` on its own line. No chip, no background, no border — pure type hierarchy. Matches CLAUDE.md's principle that "type hierarchy is the primary tool for visual organization — not borders, dividers, or heavy color blocks."
- **Bullets** (overview and details): unchanged from today — `text-[13px] text-slate-700 leading-relaxed pl-3 border-l-2 border-slate-200`.
- **Sub-bullets** (overview only): nested `<ul>` with `pl-4 mt-1.5` and a lighter border (`border-slate-100`) to signal subordination without ornament.
- **Disclosure button**: right-aligned, plain text with chevron — `text-xs font-semibold text-brand-blue-primary hover:text-brand-blue-dark inline-flex items-center gap-1 mt-3`. Lucide `ChevronDown` / `ChevronUp`.
- **Expanded details wrapper**: `border-t border-slate-100 pt-4 mt-3` — thin top border signals "different layer of content" without heavy division.
- **Entry separators** (between entries when multiple are shown): unchanged `border-b border-slate-100`.
- **Empty / loading / error states**: unchanged from today.

### Disclosure mechanics

- Custom button (not native `<details>`) for full styling control.
- ARIA: button has `aria-expanded={expanded}` and `aria-controls={`entry-${version}-details`}`; the detail wrapper has matching `id`.
- When collapsed, the detail wrapper is **unmounted** (not just `display: none`) so screen readers and keyboard tabbing don't reach hidden content.
- Animation: opacity + height fade-in on expand (~150ms); no animation on collapse (snappier; avoids awkward variable-height collapse). Wrapped in `@media (prefers-reduced-motion: reduce)` to disable.
- State scope: `useState` inside `<Entry>`, per-entry. Resets each modal open (`Modal` unmounts content tree on close, so no explicit reset needed).

### i18n

`locales/en.json` (and the other locales `de`, `es`, `fr`) under `whatsNew.*`:

- **Add:** `whatsNew.readFullUpdate` → `"Read full update"`
- **Add:** `whatsNew.showLess` → `"Show less"`
- **Remove:** `whatsNew.currentBuild` (`"Your build"`) — no longer rendered.
- **Keep:** existing `whatsNew.groups.feature` / `whatsNew.groups.improvement` / `whatsNew.groups.fix` ("New" / "Improvements" / "Fixes") — used by both overview type headings and details view.
- Date formatting uses `Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' })` — no translation keys needed.

For the non-English locales (`de`, `es`, `fr`), I'll add provisional translations of the two new keys following the same simple-imperative style as the existing keys. If any locale's existing keys turn out to use a different convention, I'll match that locale's voice instead of forcing a literal translation.

## Code touch points

- **`hooks/useChangelog.ts`**
  - Add `ChangelogBullet` and `ChangelogThemedSection` exports.
  - Update `ChangelogEntry`: rename `highlights` → `details`; add `overview?: ChangelogThemedSection[]`.
  - No fetch/cache logic changes.
  - No runtime branching for old shape — the JSON is migrated, so the hook only sees the new shape.

- **`public/changelog.json`**
  - Migrate both existing entries: rename `highlights` → `details`.
  - Add `overview` to the 2026.05.19 entry (hand-curated as shown in the example above).
  - Leave the 2026.05.18 entry details-only (no `overview` needed for a single-bullet release).

- **`components/layout/WhatsNewModal.tsx`**
  - Replace `groupHighlights` (still used internally for details rendering — keep it, rename if cleaner).
  - Remove `PillIcon` and `Pill` components (no longer used).
  - Refactor `<Entry>`:
    - Simplified header (no version slug, no "Your build" badge, human-formatted date).
    - Conditional render: overview path vs details-only path.
    - Local `useState` for expansion, custom disclosure button with ARIA.
  - Add overview-rendering helpers: `OverviewSection` (renders one themed section), `OverviewBulletList` (recursive for sub-bullets).
  - Keep details-rendering logic factored into a sibling helper (`DetailsList`) — used both from the details-only path and the expanded path under overview.

- **`locales/en.json` + `locales/de.json` + `locales/es.json` + `locales/fr.json`**
  - Add `whatsNew.readFullUpdate` and `whatsNew.showLess`.
  - Remove `whatsNew.currentBuild`.

- **`tests/hooks/useChangelog.test.ts`**
  - Update the `SAMPLE` fixture: rename `highlights` → `details` everywhere; add at least one entry with an `overview` containing a themed section with `subtitle`, a section without `subtitle`, and a nested-bullet example.
  - Add a focused test asserting the hook surfaces the new shape unchanged (round-trips `overview` and nested `items`).
  - Existing tests (`latestVersion`, `entriesSinceCurrent`, fetch deduplication, error state, etc.) keep passing because they don't touch the highlight/overview content.

- **`tests/components/WhatsNewModal.test.tsx`** (new file)
  - Entry with `overview` renders themed subheads under the right type buckets.
  - Disclosure button is present when `overview` exists; absent when it doesn't.
  - Clicking the disclosure swaps label text ("Read full update" ↔ "Show less") and mounts/unmounts the details section.
  - `aria-expanded` and `aria-controls` are wired correctly.
  - Nested bullets render as a nested `<ul>`.
  - Entry without `overview` renders details flat with no disclosure.

## Routine prompt rewrite

The "What's New JSON Copy Writer" Claude Code Routine lives in your hosted config (not in the repo). The rewritten prompt below should be pasted into the Routine config after this work merges. Source-of-truth lives here so future schema changes can re-generate it.

````
You are the "What's New" copy writer for SpartBoard. Given a description
of what shipped in a release (commits, PRs, notes), produce a single
JSON entry to append to `public/changelog.json` at the top of the
`entries` array (newest-first ordering — never append at the bottom).

## Schema

Each entry has this shape:

```ts
{
  version: string;         // "YYYY.MM.DD" matching the release date
  date: string;            // "YYYY-MM-DD"
  title: string;           // headline-style sentence, no trailing period
  overview?: ThemedSection[];  // optional; see when-to-include rules
  details: Highlight[];    // required; exhaustive patch notes
}

ThemedSection = {
  type: 'feature' | 'improvement' | 'fix';
  subtitle?: string;       // concept-level theme; omit for theme-less sections
  items: Bullet[];
}

Bullet = {
  text: string;
  items?: Bullet[];        // sub-bullets; nest at most one level deep
}

Highlight = { type: 'feature' | 'improvement' | 'fix'; text: string; }
```

## When to include `overview`

- **Include it** when the release has 4+ user-facing changes, or when 2+
  changes cohere into a named theme worth highlighting (e.g. "Collections",
  "Quiz response security").
- **Omit it** for small releases (1–3 changes with no obvious thematic
  grouping). The renderer will show the flat details list directly.

## Writing the `overview`

- Group items by **concept-level themes** (e.g. "Collections", "Boards
  manager refresh"), NOT by change type. A single theme can mix
  features + improvements as separate sections (each with its own
  `type`) under the same `subtitle`.
- Each bullet is **single-sentence-max**. If you need a second sentence
  to qualify the first, use a sub-bullet instead.
- Use **nested sub-bullets sparingly** — only when a parent bullet
  introduces 2+ concrete sub-options worth calling out individually
  (e.g. "Two new options: Watermark / Tab-navigation lock"). Cap at
  one level deep.
- `subtitle` is **optional**. Use it when a theme name makes the
  grouping clearer. Omit it for theme-less sections — most commonly
  for Fixes, which often don't have an obvious concept grouping.
- Order sections in the order you want them displayed within each
  type bucket. The renderer groups by `type` (features → improvements
  → fixes) but preserves your order within each bucket.

## Writing the `details`

- Required for every entry. This is the exhaustive patch-notes record.
- Every user-facing change gets one bullet, regardless of whether it
  also appears in the overview.
- One concise paragraph per bullet — can be longer than the overview
  bullets (this is the "for readers who want all the detail" surface).
- Group conceptually-related changes into a single bullet if they
  ship together as one feature; split if they're independent.
- Use `type`:
  - `feature` — new capability
  - `improvement` — meaningful enhancement to existing behavior
  - `fix` — bug fix

## Style

- Teacher voice, second person ("you", "your"), present tense.
- Lead with the user-facing benefit, then the mechanic.
- Avoid jargon: "Firestore", "API", "context provider" — never appear.
  Say "saves to the cloud", "sync", "behind the scenes" instead.
- No trailing periods in `title`. Periods inside `text` are fine.
- No emoji.

## Output

Return ONLY the JSON for the new entry (the full object, ready to
splice into `entries`). No surrounding prose, no markdown code fence.
````

## Risks and rollback

- **Risk**: a malformed `overview` in a future release (e.g. a section without `items`) crashes the renderer. **Mitigation**: TS types catch this at curator-time when authoring directly; the Routine prompt has a fixed schema; the renderer treats `items` as `[]` if missing rather than crashing.
- **Risk**: the new disclosure pattern surprises teachers who learned the current always-expanded view. **Mitigation**: the overview is genuinely more useful (themed, glanceable), and the disclosure label is plain English. No user setting needed.
- **Rollback**: revert this branch. The migration of the 2 existing entries from `highlights` to `details` is a JSON-only change — reverting the JSON restores them.

## Out of scope

- Adding per-locale changelogs (entries remain authored in English; the Routine prompt is English-only).
- Adding a search/filter UI inside the modal.
- Changing when the modal opens (still on update toast, sidebar link).
- Changing the unread badge logic in the sidebar.
- Editing or removing the version field — it stays in the schema and is still used for `entriesSinceCurrent` matching, just not displayed.
