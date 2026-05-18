# What's New Overview Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the "What's New" modal so each release shows a hand-curated themed overview by default, with an opt-in disclosure to expand into the exhaustive details — and migrate the existing flat-shape changelog entries to the new schema.

**Architecture:** Schema migration first (atomic: types + JSON + minimal modal field rename), then surgical visual cleanups (drop version slug + "Your build" badge + type-count pills, format date with `Intl`), then a TDD-driven renderer refactor in `WhatsNewModal.tsx` that adds overview rendering, disclosure mechanics with ARIA, nested sub-bullets, and a motion-respecting fade-in. No new files in `components/` — all renderer changes stay inside `WhatsNewModal.tsx` (it's still a focused file).

**Tech Stack:** React 19, TypeScript, Tailwind CSS (`animate-in` + `motion-reduce:` utilities), Vitest + React Testing Library, lucide-react icons, i18next, `Intl.DateTimeFormat`.

**Spec:** [docs/superpowers/specs/2026-05-18-whats-new-overview-redesign-design.md](../specs/2026-05-18-whats-new-overview-redesign-design.md)

---

## File Map

**Modified:**

- `hooks/useChangelog.ts` — add `ChangelogBullet` and `ChangelogThemedSection` types; rename `highlights` → `details` and add `overview?` to `ChangelogEntry`
- `public/changelog.json` — migrate both entries: rename `highlights` → `details`; add `overview` to the 2026.05.19 entry
- `components/layout/WhatsNewModal.tsx` — full renderer refactor (drop pills + version slug + "Your build", add overview rendering, add disclosure mechanics with ARIA + animation, format date with Intl)
- `index.css` — add a small `.animate-disclosure-expand` utility (reuses the existing `fadeIn` keyframe at 150ms, with `prefers-reduced-motion` opt-out) since `tailwindcss-animate` is not installed in this project
- `locales/en.json` — add `whatsNew.readFullUpdate` and `whatsNew.showLess`; remove `whatsNew.currentBuild`
- `tests/hooks/useChangelog.test.ts` — update `SAMPLE` fixture (rename `highlights` → `details`); add round-trip test for `overview`

**New tests:**

- `tests/components/layout/WhatsNewModal.test.tsx` — currently missing; create from scratch covering the no-overview path, the overview-with-disclosure path, nested bullets, ARIA wiring, and the header simplifications

**Untouched (verified):**

- `locales/de.json` / `locales/es.json` / `locales/fr.json` — already missing every modal-specific `whatsNew.*` key today; the modal relies on `defaultValue` fallbacks in non-English locales. No changes needed.
- `components/common/Modal.tsx` — no change. Unmounts children on `isOpen={false}`, so per-entry disclosure state resets on each modal open without explicit logic.
- `components/layout/Sidebar.tsx` and any other `WhatsNewModal` callers — no prop changes (the `isCurrent` indicator was internal to `<Entry>`; nothing in the public modal API changes).

---

## Task 1: Schema migration (atomic)

This task is **all-or-nothing**: types, JSON data, the modal's field reference, and the hook test fixture all change together. After commit: project typechecks, hook tests pass, the modal renders identically to today (the UI doesn't know about `overview` yet — Tasks 6–8 add that).

**Files:**

- Modify: `hooks/useChangelog.ts`
- Modify: `public/changelog.json`
- Modify: `components/layout/WhatsNewModal.tsx`
- Modify: `tests/hooks/useChangelog.test.ts`

- [ ] **Step 1: Update types in `hooks/useChangelog.ts`**

Find this block at the top of the file:

```ts
export type ChangelogHighlightType = 'feature' | 'improvement' | 'fix';

export interface ChangelogHighlight {
  type: ChangelogHighlightType;
  text: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  highlights: ChangelogHighlight[];
}
```

Replace it with:

```ts
export type ChangelogHighlightType = 'feature' | 'improvement' | 'fix';

// Used for the exhaustive details view (one bullet per user-facing change,
// grouped by type at render time — same shape as the legacy `highlights`).
export interface ChangelogHighlight {
  type: ChangelogHighlightType;
  text: string;
}

// Recursive bullet for the overview. `items` holds optional sub-bullets;
// by convention the Routine prompt caps nesting at one level deep.
export interface ChangelogBullet {
  text: string;
  items?: ChangelogBullet[];
}

// A themed section under a single type. `subtitle` is optional so
// theme-less sections (e.g. flat Fixes with no concept grouping)
// fall out naturally — the renderer just prints the bullets directly
// under the type heading when `subtitle` is missing.
export interface ChangelogThemedSection {
  type: ChangelogHighlightType;
  subtitle?: string;
  items: ChangelogBullet[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  overview?: ChangelogThemedSection[];
  details: ChangelogHighlight[];
}
```

- [ ] **Step 2: Update the hook's test fixture to use `details`**

Edit `tests/hooks/useChangelog.test.ts`. Find the `SAMPLE` constant near the top:

```ts
const SAMPLE = {
  entries: [
    {
      version: '2026.06.01',
      date: '2026-06-01',
      title: 'Latest',
      highlights: [{ type: 'feature' as const, text: 'A' }],
    },
    {
      version: '2026.05.20',
      date: '2026-05-20',
      title: 'Middle',
      highlights: [{ type: 'fix' as const, text: 'B' }],
    },
    {
      version: '2026.05.10',
      date: '2026-05-10',
      title: 'Older',
      highlights: [{ type: 'improvement' as const, text: 'C' }],
    },
  ],
};
```

Rename `highlights` → `details` in all three entries:

```ts
const SAMPLE = {
  entries: [
    {
      version: '2026.06.01',
      date: '2026-06-01',
      title: 'Latest',
      details: [{ type: 'feature' as const, text: 'A' }],
    },
    {
      version: '2026.05.20',
      date: '2026-05-20',
      title: 'Middle',
      details: [{ type: 'fix' as const, text: 'B' }],
    },
    {
      version: '2026.05.10',
      date: '2026-05-10',
      title: 'Older',
      details: [{ type: 'improvement' as const, text: 'C' }],
    },
  ],
};
```

- [ ] **Step 3: Update `WhatsNewModal.tsx` to use `entry.details`**

This is a minimal mechanical change to keep the file compiling. Find the single reference to `entry.highlights` (inside `<Entry>`):

```tsx
const groups = useMemo(() => groupHighlights(entry.highlights), [entry]);
```

Replace with:

```tsx
const groups = useMemo(() => groupHighlights(entry.details), [entry]);
```

No other UI changes in this task — the rest of the renderer stays as-is until later tasks.

- [ ] **Step 4: Migrate `public/changelog.json`**

Overwrite `public/changelog.json` with the following content. Two changes: `highlights` → `details` in both entries; the 2026.05.19 entry gains a hand-curated `overview`.

```json
{
  "entries": [
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
    },
    {
      "version": "2026.05.18",
      "date": "2026-05-18",
      "title": "What's New panel introduced",
      "details": [
        {
          "type": "feature",
          "text": "Click the new \"What's New\" link on the Update Available toast — or open it any time from the bottom of the sidebar menu — to see a friendly summary of what changed before you refresh."
        }
      ]
    }
  ]
}
```

- [ ] **Step 5: Run typecheck and hook tests to verify nothing broke**

```bash
pnpm run type-check
pnpm run test -- tests/hooks/useChangelog.test.ts
```

Expected: type-check passes with no errors. All 12 existing hook tests pass (they don't touch the renamed field semantically — only the fixture rename matters).

- [ ] **Step 6: Commit**

```bash
git add hooks/useChangelog.ts public/changelog.json components/layout/WhatsNewModal.tsx tests/hooks/useChangelog.test.ts
git commit -m "refactor(changelog): rename highlights to details, add overview schema

Foundational schema migration for the What's New overview redesign.
Adds ChangelogBullet and ChangelogThemedSection types, renames the
flat highlights field to details, and seeds the 2026.05.19 entry
with a hand-curated overview. Modal still renders the same UI as
before — the renderer pass that consumes overview lands in a
later commit."
```

---

## Task 2: Hook test for the new overview shape

Confirms the hook surfaces `overview` and nested `items` unchanged through the fetch + cache layer.

**Files:**

- Modify: `tests/hooks/useChangelog.test.ts`

- [ ] **Step 1: Add a round-trip test to the `describe('useChangelog', …)` block**

Append the following test inside the existing `describe('useChangelog', …)` block (after the `'dedupes concurrent fetches across hook instances'` test):

```ts
it('round-trips entries with overview and nested bullets unchanged', async () => {
  globalFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        entries: [
          {
            version: '2026.07.01',
            date: '2026-07-01',
            title: 'Themed release',
            overview: [
              {
                type: 'feature',
                subtitle: 'Collections',
                items: [
                  { text: 'Top-level bullet' },
                  {
                    text: 'Parent with nested',
                    items: [{ text: 'Sub one' }, { text: 'Sub two' }],
                  },
                ],
              },
              {
                type: 'fix',
                // No subtitle — theme-less Fixes section.
                items: [{ text: 'Flat fix bullet' }],
              },
            ],
            details: [{ type: 'feature' as const, text: 'D' }],
          },
        ],
      }),
  });
  const { result } = renderHook(() => useChangelog());
  await waitFor(() => expect(result.current.loading).toBe(false));
  const entry = result.current.entries[0];
  expect(entry.overview).toHaveLength(2);
  expect(entry.overview?.[0].subtitle).toBe('Collections');
  expect(entry.overview?.[0].items[1].items).toHaveLength(2);
  expect(entry.overview?.[0].items[1].items?.[0].text).toBe('Sub one');
  expect(entry.overview?.[1].subtitle).toBeUndefined();
});
```

- [ ] **Step 2: Run the test to verify it passes**

```bash
pnpm run test -- tests/hooks/useChangelog.test.ts
```

Expected: the new test passes alongside the existing 12. The hook does no schema validation — it just hands the JSON through — so this test asserts the shape survives unchanged.

- [ ] **Step 3: Commit**

```bash
git add tests/hooks/useChangelog.test.ts
git commit -m "test(useChangelog): round-trip overview and nested bullets"
```

---

## Task 3: Header simplification + drop "Your build" + remove i18n key

Drops the duplicated version slug, removes the "Your build" badge, and formats the date as a human-readable string. Also removes the now-unused `whatsNew.currentBuild` i18n key.

**Files:**

- Modify: `components/layout/WhatsNewModal.tsx`
- Modify: `locales/en.json`

- [ ] **Step 1: Update `<Entry>` header rendering in `WhatsNewModal.tsx`**

Find the `<Entry>` component (currently signature `const Entry: React.FC<{ entry: ChangelogEntry; isCurrent: boolean }>`). Replace its full body with the simplified version below. The diff is: drop the `isCurrent` prop entirely, drop the version-slug `<span>`, drop the "Your build" badge `<span>`, and format the date via `Intl.DateTimeFormat`.

Replace this:

```tsx
const Entry: React.FC<{ entry: ChangelogEntry; isCurrent: boolean }> = ({
  entry,
  isCurrent,
}) => {
  const { t } = useTranslation();
  const groups = useMemo(() => groupHighlights(entry.details), [entry]);
  const labels: Record<ChangelogHighlightType, string> = {
    feature: t('whatsNew.groups.feature', { defaultValue: 'New' }),
    improvement: t('whatsNew.groups.improvement', {
      defaultValue: 'Improvements',
    }),
    fix: t('whatsNew.groups.fix', { defaultValue: 'Fixes' }),
  };

  return (
    <section className="pt-5 first:pt-0 pb-5 border-b border-slate-100 last:border-b-0">
      <header className="flex items-baseline gap-3 mb-2 flex-wrap">
        <h4 className="font-black text-base text-slate-900">{entry.title}</h4>
        <span className="text-xxs font-bold text-slate-400 uppercase tracking-[0.15em]">
          {entry.version}
        </span>
        <span className="text-xxs text-slate-400">{entry.date}</span>
        {isCurrent && (
          <span className="text-xxs font-bold text-brand-blue-primary uppercase tracking-wide">
            {t('whatsNew.currentBuild', { defaultValue: 'Your build' })}
          </span>
        )}
      </header>
      <div className="flex gap-2 mb-3 flex-wrap">
        {GROUP_ORDER.map((type) =>
          groups[type].length > 0 ? (
            <Pill
              key={type}
              type={type}
              label={labels[type]}
              count={groups[type].length}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-col gap-3">
        {GROUP_ORDER.map((type) =>
          groups[type].length > 0 ? (
            <div key={type}>
              <h5 className="text-xxs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                {labels[type]}
              </h5>
              <ul className="flex flex-col gap-1.5">
                {groups[type].map((h, idx) => (
                  <li
                    key={idx}
                    className="text-[13px] text-slate-700 leading-relaxed pl-3 border-l-2 border-slate-200"
                  >
                    {h.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null
        )}
      </div>
    </section>
  );
};
```

With this (only the header changes in this task; pills + details rendering still here — they get replaced/restructured in later tasks):

```tsx
const formatEntryDate = (iso: string, language: string): string => {
  // Parse "YYYY-MM-DD" explicitly so the Date isn't shifted by the host
  // timezone (a bare `new Date('2026-05-19')` is interpreted as UTC midnight
  // and can render as the previous day in negative-offset zones).
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
};

const Entry: React.FC<{ entry: ChangelogEntry }> = ({ entry }) => {
  const { t, i18n } = useTranslation();
  const groups = useMemo(() => groupHighlights(entry.details), [entry]);
  const labels: Record<ChangelogHighlightType, string> = {
    feature: t('whatsNew.groups.feature', { defaultValue: 'New' }),
    improvement: t('whatsNew.groups.improvement', {
      defaultValue: 'Improvements',
    }),
    fix: t('whatsNew.groups.fix', { defaultValue: 'Fixes' }),
  };

  return (
    <section className="pt-5 first:pt-0 pb-5 border-b border-slate-100 last:border-b-0">
      <header className="mb-3">
        <h4 className="font-black text-base text-slate-900">{entry.title}</h4>
        <p className="mt-0.5 text-xxs text-slate-400">
          {formatEntryDate(entry.date, i18n.language)}
        </p>
      </header>
      <div className="flex gap-2 mb-3 flex-wrap">
        {GROUP_ORDER.map((type) =>
          groups[type].length > 0 ? (
            <Pill
              key={type}
              type={type}
              label={labels[type]}
              count={groups[type].length}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-col gap-3">
        {GROUP_ORDER.map((type) =>
          groups[type].length > 0 ? (
            <div key={type}>
              <h5 className="text-xxs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                {labels[type]}
              </h5>
              <ul className="flex flex-col gap-1.5">
                {groups[type].map((h, idx) => (
                  <li
                    key={idx}
                    className="text-[13px] text-slate-700 leading-relaxed pl-3 border-l-2 border-slate-200"
                  >
                    {h.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null
        )}
      </div>
    </section>
  );
};
```

- [ ] **Step 2: Drop the `isCurrent` prop from the `<Entry>` call site**

In the same file, find this block near the bottom of `WhatsNewModal`:

```tsx
{
  !loading &&
    !error &&
    visibleEntries.map((entry) => (
      <Entry
        key={entry.version}
        entry={entry}
        isCurrent={mode === 'browse' && entry.version === currentVersion}
      />
    ));
}
```

Replace with (just drop the `isCurrent` prop — `mode` and `currentVersion` are still used by `visibleEntries`):

```tsx
{
  !loading &&
    !error &&
    visibleEntries.map((entry) => <Entry key={entry.version} entry={entry} />);
}
```

- [ ] **Step 3: Remove the unused `whatsNew.currentBuild` key from `locales/en.json`**

Find the `whatsNew` block near the bottom of `locales/en.json`:

```json
  "whatsNew": {
    "title": "What's New",
    "updateNow": "Update Now",
    "later": "Later",
    "close": "Close",
    "loading": "Loading release notes…",
    "error": "Couldn't load the changelog right now.",
    "previewEmpty": "A fresh build is ready. Refresh to get the latest.",
    "browseEmpty": "You're all caught up.",
    "currentBuild": "Your build",
    "groups": {
      "feature": "New",
      "improvement": "Improvements",
      "fix": "Fixes"
    }
  }
```

Remove the `"currentBuild": "Your build",` line (along with its trailing comma):

```json
  "whatsNew": {
    "title": "What's New",
    "updateNow": "Update Now",
    "later": "Later",
    "close": "Close",
    "loading": "Loading release notes…",
    "error": "Couldn't load the changelog right now.",
    "previewEmpty": "A fresh build is ready. Refresh to get the latest.",
    "browseEmpty": "You're all caught up.",
    "groups": {
      "feature": "New",
      "improvement": "Improvements",
      "fix": "Fixes"
    }
  }
```

- [ ] **Step 4: Run typecheck and existing tests**

```bash
pnpm run type-check
pnpm run test -- tests/hooks/useChangelog.test.ts
```

Expected: typecheck passes (the `currentVersion` prop on `WhatsNewModal` is still used by `entriesSinceCurrent(currentVersion)` — don't remove it). Hook tests pass.

- [ ] **Step 5: Visual sanity check in the dev server**

Start the dev server:

```bash
pnpm run dev
```

Open the app, click "What's New" in the sidebar. Confirm:

- The 2026.05.19 entry shows the title and "May 19, 2026" (or your locale's long-form equivalent) — no version slug, no "Your build" badge.
- Pills + bullets still render the same as before (those go away in later tasks).

- [ ] **Step 6: Commit**

```bash
git add components/layout/WhatsNewModal.tsx locales/en.json
git commit -m "refactor(whats-new): simplified entry header + drop Your build badge

Removes the duplicated version slug (the version IS the date in slug
form) and the in-modal Your build badge (the sidebar's unread badge
and the Update Available toast already cover this). Formats the
release date in the active locale via Intl.DateTimeFormat."
```

---

## Task 4: Add disclosure i18n keys

Adds the two new strings the disclosure button needs. Tasks 5+ use these via `t('whatsNew.readFullUpdate', { defaultValue: 'Read full update' })`.

**Files:**

- Modify: `locales/en.json`

- [ ] **Step 1: Add `readFullUpdate` and `showLess` keys**

Find the `whatsNew` block in `locales/en.json` (post-Task-3 shape):

```json
  "whatsNew": {
    "title": "What's New",
    "updateNow": "Update Now",
    "later": "Later",
    "close": "Close",
    "loading": "Loading release notes…",
    "error": "Couldn't load the changelog right now.",
    "previewEmpty": "A fresh build is ready. Refresh to get the latest.",
    "browseEmpty": "You're all caught up.",
    "groups": {
      "feature": "New",
      "improvement": "Improvements",
      "fix": "Fixes"
    }
  }
```

Add the two new keys (placed near other action-label keys for readability):

```json
  "whatsNew": {
    "title": "What's New",
    "updateNow": "Update Now",
    "later": "Later",
    "close": "Close",
    "readFullUpdate": "Read full update",
    "showLess": "Show less",
    "loading": "Loading release notes…",
    "error": "Couldn't load the changelog right now.",
    "previewEmpty": "A fresh build is ready. Refresh to get the latest.",
    "browseEmpty": "You're all caught up.",
    "groups": {
      "feature": "New",
      "improvement": "Improvements",
      "fix": "Fixes"
    }
  }
```

- [ ] **Step 2: Verify JSON validity**

```bash
node -e "JSON.parse(require('fs').readFileSync('locales/en.json', 'utf8')); console.log('OK')"
```

Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add locales/en.json
git commit -m "i18n(en): add whatsNew.readFullUpdate and whatsNew.showLess"
```

---

## Task 5: Component test scaffold + protect the no-overview path

Creates the missing component test file and locks in the baseline behavior for entries without an `overview` (today's flat-by-type render). This test must keep passing throughout the renderer refactor in Tasks 6–9.

**Files:**

- Create: `tests/components/layout/WhatsNewModal.test.tsx`

- [ ] **Step 1: Create the test file with the no-overview baseline**

Create `tests/components/layout/WhatsNewModal.test.tsx` with the following content:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { WhatsNewModal } from '@/components/layout/WhatsNewModal';
import type { ChangelogEntry, useChangelog } from '@/hooks/useChangelog';

// Mock the hook so each test supplies its own entries without touching
// the network. We need to keep the named exports the modal uses at
// import time (writeLastSeenVersion is called inside an effect when
// the modal opens).
const useChangelogMock = vi.fn();
const writeLastSeenVersionMock = vi.fn();

vi.mock('@/hooks/useChangelog', () => ({
  useChangelog: () => useChangelogMock() as ReturnType<typeof useChangelog>,
  writeLastSeenVersion: (v: string | null) => writeLastSeenVersionMock(v),
}));

const detailsOnlyEntry: ChangelogEntry = {
  version: '2026.05.18',
  date: '2026-05-18',
  title: "What's New panel introduced",
  details: [
    {
      type: 'feature',
      text: 'A single, themeless feature bullet for the baseline test.',
    },
  ],
};

const baseHookReturn = (entries: ChangelogEntry[]) => ({
  entries,
  loading: false,
  error: null,
  latestVersion: entries[0]?.version ?? null,
  entriesSinceCurrent: vi.fn(() => entries),
});

const renderModal = (entries: ChangelogEntry[]) => {
  useChangelogMock.mockReturnValue(baseHookReturn(entries));
  return render(
    <WhatsNewModal
      isOpen
      onClose={vi.fn()}
      mode="browse"
      currentVersion={entries[0]?.version ?? ''}
    />
  );
};

describe('WhatsNewModal — no-overview entries', () => {
  beforeEach(() => {
    useChangelogMock.mockReset();
    writeLastSeenVersionMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the details list flat under the type heading', () => {
    renderModal([detailsOnlyEntry]);
    expect(screen.getByText("What's New panel introduced")).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(
      screen.getByText(/single, themeless feature bullet/)
    ).toBeInTheDocument();
  });

  it('shows no "Read full update" disclosure when overview is absent', () => {
    renderModal([detailsOnlyEntry]);
    expect(
      screen.queryByRole('button', { name: /read full update/i })
    ).not.toBeInTheDocument();
  });

  it('formats the entry date as a long human string in English', () => {
    renderModal([detailsOnlyEntry]);
    // setTz.ts pins TZ=UTC, and formatEntryDate uses { timeZone: 'UTC' },
    // so the date renders deterministically regardless of host TZ.
    expect(screen.getByText('May 18, 2026')).toBeInTheDocument();
  });

  it('does not render the version slug or "Your build" badge', () => {
    renderModal([detailsOnlyEntry]);
    expect(screen.queryByText('2026.05.18')).not.toBeInTheDocument();
    expect(screen.queryByText(/your build/i)).not.toBeInTheDocument();
  });

  it('renders multiple entries with separators', () => {
    const second: ChangelogEntry = {
      version: '2026.05.10',
      date: '2026-05-10',
      title: 'Older release',
      details: [{ type: 'fix', text: 'Bug squashed.' }],
    };
    const { container } = renderModal([detailsOnlyEntry, second]);
    expect(screen.getByText('Older release')).toBeInTheDocument();
    expect(container.querySelectorAll('section')).toHaveLength(2);
  });
});

// `within` is exported for use in later tasks; pull it into a no-op
// reference here to keep the import alive across edits.
void within;
```

- [ ] **Step 2: Run the new test file**

```bash
pnpm run test -- tests/components/layout/WhatsNewModal.test.tsx
```

Expected: 5 tests pass. The "Your build" / version-slug assertions only pass because Task 3 already removed those — this is the regression-protection layer.

If the date assertion fails because the test environment renders a different format, double-check that `setTz.ts` is active (it pins `TZ=UTC`) and that `formatEntryDate` passes `timeZone: 'UTC'` to `Intl.DateTimeFormat`.

- [ ] **Step 3: Commit**

```bash
git add tests/components/layout/WhatsNewModal.test.tsx
git commit -m "test(whats-new): baseline coverage for no-overview entries"
```

---

## Task 6: Implement overview themed-section rendering (TDD)

This is the first task that adds new UI: when an entry has an `overview`, render it (themed sections grouped by type) above the existing details view. Disclosure mechanics come in Task 7 — for now, the details list still shows below the overview unconditionally.

**Files:**

- Modify: `tests/components/layout/WhatsNewModal.test.tsx`
- Modify: `components/layout/WhatsNewModal.tsx`

- [ ] **Step 1: Add a failing test for overview themed-section rendering**

Append the following `describe` block to `tests/components/layout/WhatsNewModal.test.tsx` (after the existing `describe('WhatsNewModal — no-overview entries', …)` block):

```tsx
describe('WhatsNewModal — overview rendering', () => {
  beforeEach(() => {
    useChangelogMock.mockReset();
    writeLastSeenVersionMock.mockReset();
  });

  const overviewEntry: ChangelogEntry = {
    version: '2026.05.19',
    date: '2026-05-19',
    title: 'Collections release',
    overview: [
      {
        type: 'feature',
        subtitle: 'Collections',
        items: [
          { text: 'Group your boards into folders.' },
          { text: 'Share a whole Collection.' },
        ],
      },
      {
        type: 'improvement',
        subtitle: 'Quiz response security',
        items: [{ text: 'Unlock one student at a time.' }],
      },
      {
        type: 'fix',
        // No subtitle — theme-less Fixes section.
        items: [{ text: 'A direct fix bullet under the Fixes heading.' }],
      },
    ],
    details: [
      {
        type: 'feature',
        text: 'Collections — group your boards into folders.',
      },
      {
        type: 'fix',
        text: 'A patch-notes fix bullet (different from the overview Fixes bullet).',
      },
    ],
  };

  it('renders themed subtitles under the right type buckets', () => {
    renderModal([overviewEntry]);
    // Type headings appear in fixed order — New, Improvements, Fixes.
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Improvements')).toBeInTheDocument();
    expect(screen.getByText('Fixes')).toBeInTheDocument();
    // Themed subheads appear as bold text on their own.
    expect(screen.getByText('Collections')).toBeInTheDocument();
    expect(screen.getByText('Quiz response security')).toBeInTheDocument();
  });

  it('renders bullets under each themed section', () => {
    renderModal([overviewEntry]);
    expect(
      screen.getByText('Group your boards into folders.')
    ).toBeInTheDocument();
    expect(screen.getByText('Share a whole Collection.')).toBeInTheDocument();
    expect(
      screen.getByText('Unlock one student at a time.')
    ).toBeInTheDocument();
  });

  it('renders a theme-less section with no subtitle, bullets flat under the type heading', () => {
    renderModal([overviewEntry]);
    // The Fixes bullet renders even though its section has no subtitle.
    expect(
      screen.getByText('A direct fix bullet under the Fixes heading.')
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
pnpm run test -- tests/components/layout/WhatsNewModal.test.tsx
```

Expected: the new `'renders themed subtitles under the right type buckets'` test fails — `screen.getByText('Collections')` will not find a match because the current renderer ignores `entry.overview` entirely. The other two new tests also fail for the same reason.

- [ ] **Step 3: Implement overview rendering in `WhatsNewModal.tsx`**

Add the following helper components and a `groupOverviewByType` helper above the existing `<Entry>` component. Place them after the existing `groupHighlights` function:

```tsx
const groupOverviewByType = (
  sections: ChangelogThemedSection[]
): Record<ChangelogHighlightType, ChangelogThemedSection[]> => {
  const groups: Record<ChangelogHighlightType, ChangelogThemedSection[]> = {
    feature: [],
    improvement: [],
    fix: [],
  };
  for (const section of sections) {
    if (groups[section.type]) groups[section.type].push(section);
  }
  return groups;
};

const OverviewBulletList: React.FC<{ items: ChangelogBullet[] }> = ({
  items,
}) => (
  <ul className="flex flex-col gap-1.5">
    {items.map((bullet, idx) => (
      <li
        key={idx}
        className="text-[13px] text-slate-700 leading-relaxed pl-3 border-l-2 border-slate-200"
      >
        {bullet.text}
      </li>
    ))}
  </ul>
);

const OverviewSection: React.FC<{ section: ChangelogThemedSection }> = ({
  section,
}) => (
  <div>
    {section.subtitle && (
      <p className="text-sm font-bold text-slate-800 mb-1.5">
        {section.subtitle}
      </p>
    )}
    <OverviewBulletList items={section.items} />
  </div>
);
```

Then, inside `<Entry>`, add an overview rendering block ABOVE the existing pills/details section. Find the existing `return (...)`:

```tsx
return (
  <section className="pt-5 first:pt-0 pb-5 border-b border-slate-100 last:border-b-0">
    <header className="mb-3">
      <h4 className="font-black text-base text-slate-900">{entry.title}</h4>
      <p className="mt-0.5 text-xxs text-slate-400">
        {formatEntryDate(entry.date, i18n.language)}
      </p>
    </header>
    <div className="flex gap-2 mb-3 flex-wrap">
      {GROUP_ORDER.map((type) =>
        groups[type].length > 0 ? (
          <Pill
            key={type}
            type={type}
            label={labels[type]}
            count={groups[type].length}
          />
        ) : null
      )}
    </div>
    <div className="flex flex-col gap-3">
      {GROUP_ORDER.map((type) =>
        groups[type].length > 0 ? (
          <div key={type}>
            <h5 className="text-xxs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              {labels[type]}
            </h5>
            <ul className="flex flex-col gap-1.5">
              {groups[type].map((h, idx) => (
                <li
                  key={idx}
                  className="text-[13px] text-slate-700 leading-relaxed pl-3 border-l-2 border-slate-200"
                >
                  {h.text}
                </li>
              ))}
            </ul>
          </div>
        ) : null
      )}
    </div>
  </section>
);
```

Replace the entire return with this (adds an overview block at the top when `entry.overview` is non-empty; the details list stays for now and will be moved inside a disclosure in Task 7):

```tsx
const overviewByType = useMemo(
  () => (entry.overview ? groupOverviewByType(entry.overview) : null),
  [entry.overview]
);
const hasOverview =
  overviewByType !== null &&
  GROUP_ORDER.some((type) => overviewByType[type].length > 0);

return (
  <section className="pt-5 first:pt-0 pb-5 border-b border-slate-100 last:border-b-0">
    <header className="mb-3">
      <h4 className="font-black text-base text-slate-900">{entry.title}</h4>
      <p className="mt-0.5 text-xxs text-slate-400">
        {formatEntryDate(entry.date, i18n.language)}
      </p>
    </header>
    {hasOverview && overviewByType && (
      <div className="flex flex-col gap-3 mb-3">
        {GROUP_ORDER.map((type) =>
          overviewByType[type].length > 0 ? (
            <div key={type}>
              <h5 className="text-xxs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                {labels[type]}
              </h5>
              <div className="flex flex-col gap-3">
                {overviewByType[type].map((section, idx) => (
                  <OverviewSection key={idx} section={section} />
                ))}
              </div>
            </div>
          ) : null
        )}
      </div>
    )}
    <div className="flex gap-2 mb-3 flex-wrap">
      {GROUP_ORDER.map((type) =>
        groups[type].length > 0 ? (
          <Pill
            key={type}
            type={type}
            label={labels[type]}
            count={groups[type].length}
          />
        ) : null
      )}
    </div>
    <div className="flex flex-col gap-3">
      {GROUP_ORDER.map((type) =>
        groups[type].length > 0 ? (
          <div key={type}>
            <h5 className="text-xxs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              {labels[type]}
            </h5>
            <ul className="flex flex-col gap-1.5">
              {groups[type].map((h, idx) => (
                <li
                  key={idx}
                  className="text-[13px] text-slate-700 leading-relaxed pl-3 border-l-2 border-slate-200"
                >
                  {h.text}
                </li>
              ))}
            </ul>
          </div>
        ) : null
      )}
    </div>
  </section>
);
```

Also import `ChangelogBullet` and `ChangelogThemedSection` at the top of the file (extend the existing `import` from `'@/hooks/useChangelog'`):

```tsx
import {
  ChangelogBullet,
  ChangelogEntry,
  ChangelogHighlight,
  ChangelogHighlightType,
  ChangelogThemedSection,
  useChangelog,
  writeLastSeenVersion,
} from '@/hooks/useChangelog';
```

- [ ] **Step 4: Run all WhatsNewModal tests to verify pass**

```bash
pnpm run test -- tests/components/layout/WhatsNewModal.test.tsx
```

Expected: all 8 tests pass (5 baseline + 3 new overview tests).

(The fixture deliberately gives overview bullets and details bullets different wording so `screen.getByText(...)` matches uniquely — both lists render side-by-side in Task 6 since the disclosure that hides details comes in Task 7.)

- [ ] **Step 5: Run typecheck**

```bash
pnpm run type-check
```

Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add components/layout/WhatsNewModal.tsx tests/components/layout/WhatsNewModal.test.tsx
git commit -m "feat(whats-new): render overview themed sections above details

Adds OverviewSection + OverviewBulletList sub-components and an
overview-by-type grouping pass inside Entry. Themed subtitles render
as bold text on their own line, theme-less sections render bullets
flat under the type heading. Details still render unconditionally
below the overview — the disclosure that hides them lands in the
next commit."
```

---

## Task 7: Disclosure button + collapsible details + ARIA (TDD)

Wraps the existing details rendering in a disclosure. When `overview` is present, details are unmounted by default and mounted on click of "Read full update". The button toggles label to "Show less" when expanded. ARIA `aria-expanded` + `aria-controls` wired correctly.

**Files:**

- Modify: `tests/components/layout/WhatsNewModal.test.tsx`
- Modify: `components/layout/WhatsNewModal.tsx`

- [ ] **Step 1: Add failing tests for the disclosure behavior**

Append the following `describe` block to `tests/components/layout/WhatsNewModal.test.tsx`:

```tsx
describe('WhatsNewModal — disclosure', () => {
  beforeEach(() => {
    useChangelogMock.mockReset();
    writeLastSeenVersionMock.mockReset();
  });

  const overviewEntry: ChangelogEntry = {
    version: '2026.05.19',
    date: '2026-05-19',
    title: 'Disclosure test entry',
    overview: [
      {
        type: 'feature',
        subtitle: 'Headline theme',
        items: [{ text: 'Curated overview bullet that is always visible.' }],
      },
    ],
    details: [
      {
        type: 'feature',
        text: 'Exhaustive detail bullet that is hidden until expanded.',
      },
      { type: 'fix', text: 'Bug fix from the patch notes.' },
    ],
  };

  it('shows the "Read full update" button when overview is present', () => {
    renderModal([overviewEntry]);
    expect(
      screen.getByRole('button', { name: /read full update/i })
    ).toBeInTheDocument();
  });

  it('does not render the details list when collapsed', () => {
    renderModal([overviewEntry]);
    expect(
      screen.queryByText(/exhaustive detail bullet/i)
    ).not.toBeInTheDocument();
  });

  it('reveals details and swaps to "Show less" when the disclosure is clicked', async () => {
    const user = userEvent.setup();
    renderModal([overviewEntry]);
    const button = screen.getByRole('button', { name: /read full update/i });
    await user.click(button);
    expect(screen.getByText(/exhaustive detail bullet/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /show less/i })
    ).toBeInTheDocument();
  });

  it('wires aria-expanded and aria-controls to the details region', async () => {
    const user = userEvent.setup();
    renderModal([overviewEntry]);
    const button = screen.getByRole('button', { name: /read full update/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    const controlsId = button.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    // Controlled element is not in the DOM while collapsed (unmounted).
    expect(document.getElementById(controlsId!)).toBeNull();
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(controlsId!)).not.toBeNull();
  });
});
```

You also need to add `userEvent` to the imports at the top of the test file. Find:

```tsx
import { render, screen, within } from '@testing-library/react';
```

Replace with:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
pnpm run test -- tests/components/layout/WhatsNewModal.test.tsx
```

Expected: the 4 new disclosure tests fail — there's no disclosure button yet, and details render unconditionally.

- [ ] **Step 3: Implement the disclosure**

First, import `ChevronDown` and `ChevronUp` from lucide and `useId` + `useState` from React at the top of `WhatsNewModal.tsx`. Find:

```tsx
import React, { useEffect, useMemo, useRef } from 'react';
```

Replace with:

```tsx
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
```

Find:

```tsx
import { RefreshCw, Sparkles, Wrench, ArrowUpRight } from 'lucide-react';
```

Replace with (adds `ChevronDown` and `ChevronUp`; `Wrench` and `ArrowUpRight` are still used by `PillIcon` until Task 9 removes the pills entirely):

```tsx
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Sparkles,
  Wrench,
} from 'lucide-react';
```

Now restructure `<Entry>` to (a) extract the details-rendering JSX into a local `DetailsList` element, (b) add `useState`/`useId`/disclosure button, (c) only render `DetailsList` when expanded or when there's no overview to hide behind.

Replace the entire `<Entry>` body (from the line `const Entry: React.FC<{ entry: ChangelogEntry }> = ({ entry }) => {` through its closing `};`) with:

```tsx
const Entry: React.FC<{ entry: ChangelogEntry }> = ({ entry }) => {
  const { t, i18n } = useTranslation();
  const groups = useMemo(() => groupHighlights(entry.details), [entry]);
  const overviewByType = useMemo(
    () => (entry.overview ? groupOverviewByType(entry.overview) : null),
    [entry.overview]
  );
  const hasOverview =
    overviewByType !== null &&
    GROUP_ORDER.some((type) => overviewByType[type].length > 0);

  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();

  const labels: Record<ChangelogHighlightType, string> = {
    feature: t('whatsNew.groups.feature', { defaultValue: 'New' }),
    improvement: t('whatsNew.groups.improvement', {
      defaultValue: 'Improvements',
    }),
    fix: t('whatsNew.groups.fix', { defaultValue: 'Fixes' }),
  };

  // Details list: rendered inline when there's no overview, OR inside the
  // expanded disclosure. Extracted so we only have one source of truth for
  // the by-type render.
  const detailsList = (
    <div className="flex flex-col gap-3">
      {GROUP_ORDER.map((type) =>
        groups[type].length > 0 ? (
          <div key={type}>
            <h5 className="text-xxs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              {labels[type]}
            </h5>
            <ul className="flex flex-col gap-1.5">
              {groups[type].map((h, idx) => (
                <li
                  key={idx}
                  className="text-[13px] text-slate-700 leading-relaxed pl-3 border-l-2 border-slate-200"
                >
                  {h.text}
                </li>
              ))}
            </ul>
          </div>
        ) : null
      )}
    </div>
  );

  return (
    <section className="pt-5 first:pt-0 pb-5 border-b border-slate-100 last:border-b-0">
      <header className="mb-3">
        <h4 className="font-black text-base text-slate-900">{entry.title}</h4>
        <p className="mt-0.5 text-xxs text-slate-400">
          {formatEntryDate(entry.date, i18n.language)}
        </p>
      </header>

      {hasOverview && overviewByType ? (
        <>
          <div className="flex flex-col gap-3">
            {GROUP_ORDER.map((type) =>
              overviewByType[type].length > 0 ? (
                <div key={type}>
                  <h5 className="text-xxs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                    {labels[type]}
                  </h5>
                  <div className="flex flex-col gap-3">
                    {overviewByType[type].map((section, idx) => (
                      <OverviewSection key={idx} section={section} />
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>

          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
              aria-controls={detailsId}
              className="text-xs font-semibold text-brand-blue-primary hover:text-brand-blue-dark inline-flex items-center gap-1"
            >
              {expanded
                ? t('whatsNew.showLess', { defaultValue: 'Show less' })
                : t('whatsNew.readFullUpdate', {
                    defaultValue: 'Read full update',
                  })}
              {expanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          </div>

          {expanded && (
            <div id={detailsId} className="border-t border-slate-100 pt-4 mt-3">
              {detailsList}
            </div>
          )}
        </>
      ) : (
        detailsList
      )}
    </section>
  );
};
```

Note what changed:

- Pills are gone from the overview path (replaced by themed sections doing the work). For the no-overview path (`detailsList` only), pills are _also_ gone — they get fully removed for both paths in this task.
- Details are unmounted (not `display: none`) when `hasOverview && !expanded`.
- ARIA: `aria-expanded` reflects state, `aria-controls` points at a stable `useId()`-generated id, and the controlled `<div>` only exists in the DOM when expanded.

- [ ] **Step 4: Run all WhatsNewModal tests to verify pass**

```bash
pnpm run test -- tests/components/layout/WhatsNewModal.test.tsx
```

Expected: all 12 tests pass (5 baseline + 3 overview + 4 disclosure).

- [ ] **Step 5: Run typecheck**

```bash
pnpm run type-check
```

Expected: passes.

- [ ] **Step 6: Visual sanity check in the dev server**

```bash
pnpm run dev
```

Open "What's New" in the sidebar. For the 2026.05.19 entry: confirm the themed overview shows by default (no pills), the "Read full update" button appears bottom-right, clicking it expands the patch-notes details below a thin top-border, and the label flips to "Show less". For the 2026.05.18 entry: confirm the flat single-bullet view renders with no disclosure.

- [ ] **Step 7: Commit**

```bash
git add components/layout/WhatsNewModal.tsx tests/components/layout/WhatsNewModal.test.tsx
git commit -m "feat(whats-new): disclosure button reveals full details

Wraps the existing details list in a per-entry disclosure when the
entry has an overview. Button label toggles Read full update <-> Show
less, aria-expanded + aria-controls track state, and the details
region is unmounted while collapsed (not display:none) so it stays
out of screen-reader and keyboard tab order. Type-count pills are
removed from both overview and details paths — type-grouped section
headings already carry that information."
```

---

## Task 8: Nested sub-bullets (TDD)

Adds rendering for `bullet.items` (sub-bullets), capped at one level deep by convention (the renderer recurses, but the Routine prompt forbids deeper nesting).

**Files:**

- Modify: `tests/components/layout/WhatsNewModal.test.tsx`
- Modify: `components/layout/WhatsNewModal.tsx`

- [ ] **Step 1: Add a failing test for nested bullets**

Append to `tests/components/layout/WhatsNewModal.test.tsx`, inside the existing `describe('WhatsNewModal — overview rendering', …)` block (right after the last `it(...)` inside it):

```tsx
it('renders nested sub-bullets under their parent', () => {
  const nestedEntry: ChangelogEntry = {
    version: '2026.05.19',
    date: '2026-05-19',
    title: 'Nested bullets entry',
    overview: [
      {
        type: 'improvement',
        subtitle: 'Quiz response security',
        items: [
          {
            text: 'Two new options when publishing quiz results:',
            items: [
              { text: 'Watermark for screenshots.' },
              { text: 'Tab-navigation lock.' },
            ],
          },
        ],
      },
    ],
    details: [{ type: 'improvement', text: 'Patch-notes entry.' }],
  };
  renderModal([nestedEntry]);
  expect(
    screen.getByText('Two new options when publishing quiz results:')
  ).toBeInTheDocument();
  expect(screen.getByText('Watermark for screenshots.')).toBeInTheDocument();
  expect(screen.getByText('Tab-navigation lock.')).toBeInTheDocument();

  // Sub-bullets render as a nested <ul> under the parent <li>.
  const parentLi = screen
    .getByText('Two new options when publishing quiz results:')
    .closest('li');
  expect(parentLi).not.toBeNull();
  expect(parentLi!.querySelector('ul')).not.toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm run test -- tests/components/layout/WhatsNewModal.test.tsx
```

Expected: the new test fails. The sub-bullet text won't be found because `OverviewBulletList` currently only renders `bullet.text` and ignores `bullet.items`.

- [ ] **Step 3: Update `OverviewBulletList` to recurse into `items`**

In `WhatsNewModal.tsx`, find the existing `OverviewBulletList`:

```tsx
const OverviewBulletList: React.FC<{ items: ChangelogBullet[] }> = ({
  items,
}) => (
  <ul className="flex flex-col gap-1.5">
    {items.map((bullet, idx) => (
      <li
        key={idx}
        className="text-[13px] text-slate-700 leading-relaxed pl-3 border-l-2 border-slate-200"
      >
        {bullet.text}
      </li>
    ))}
  </ul>
);
```

Replace with (recurses into `bullet.items` with lighter border + extra padding to signal subordination):

```tsx
const OverviewBulletList: React.FC<{
  items: ChangelogBullet[];
  nested?: boolean;
}> = ({ items, nested = false }) => (
  <ul
    className={
      nested ? 'flex flex-col gap-1 pl-4 mt-1.5' : 'flex flex-col gap-1.5'
    }
  >
    {items.map((bullet, idx) => (
      <li
        key={idx}
        className={
          nested
            ? 'text-[13px] text-slate-700 leading-relaxed pl-3 border-l-2 border-slate-100'
            : 'text-[13px] text-slate-700 leading-relaxed pl-3 border-l-2 border-slate-200'
        }
      >
        {bullet.text}
        {bullet.items && bullet.items.length > 0 && (
          <OverviewBulletList items={bullet.items} nested />
        )}
      </li>
    ))}
  </ul>
);
```

- [ ] **Step 4: Run all WhatsNewModal tests to verify pass**

```bash
pnpm run test -- tests/components/layout/WhatsNewModal.test.tsx
```

Expected: all 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/layout/WhatsNewModal.tsx tests/components/layout/WhatsNewModal.test.tsx
git commit -m "feat(whats-new): render nested sub-bullets in overview

OverviewBulletList recurses into bullet.items. Nested lists use a
lighter border-slate-100 and extra left padding to signal
subordination without ornament. Curator convention caps nesting at
one level deep (enforced by the Routine prompt, not the schema)."
```

---

## Task 9: Mount-only fade-in animation with `prefers-reduced-motion`

Adds a brief opacity fade on the mount of the expanded details region. No animation on collapse (details unmount immediately, which feels snappier). Respects `prefers-reduced-motion`.

**Why a custom CSS class rather than Tailwind `animate-in`:** the codebase uses `animate-in fade-in slide-in-from-*` strings in a few places (`CollectionSwitcherMenu.tsx`, `BoardNavFab.tsx`, etc.) and CLAUDE.md mentions them, but `tailwindcss-animate` is **not** installed and no `animate-in` keyframes are defined in `tailwind.config.js` — those classes silently no-op and the elements just appear instantly. Rather than add a plugin (out of scope), we add a small project-level utility class in `index.css` that reuses the existing `fadeIn` keyframe at a snappier duration, and that's all the disclosure needs.

**Files:**

- Modify: `index.css`
- Modify: `components/layout/WhatsNewModal.tsx`

- [ ] **Step 1: Add a small fade utility to `index.css`**

Find the existing `.animate-fade-in` rule in `index.css` (around line 130):

```css
.animate-fade-in {
  animation: fadeIn 0.5s ease-out forwards;
}
```

Add the following two rules immediately after it (reuses the existing `fadeIn` keyframe at a snappier 150ms; respects reduced motion):

```css
.animate-disclosure-expand {
  animation: fadeIn 150ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .animate-disclosure-expand {
    animation: none;
  }
}
```

- [ ] **Step 2: Apply the utility class to the expanded details wrapper in `WhatsNewModal.tsx`**

Find the expanded details `<div>` inside `<Entry>`:

```tsx
{
  expanded && (
    <div id={detailsId} className="border-t border-slate-100 pt-4 mt-3">
      {detailsList}
    </div>
  );
}
```

Replace with:

```tsx
{
  expanded && (
    <div
      id={detailsId}
      className="border-t border-slate-100 pt-4 mt-3 animate-disclosure-expand"
    >
      {detailsList}
    </div>
  );
}
```

- [ ] **Step 3: Run all WhatsNewModal tests to confirm the class addition did not break behavior**

```bash
pnpm run test -- tests/components/layout/WhatsNewModal.test.tsx
```

Expected: all 13 tests still pass. The animation is purely visual — no behavior tests touch it.

- [ ] **Step 4: Visual sanity check**

```bash
pnpm run dev
```

Open the modal. Click "Read full update" — confirm a brief (~150ms) opacity fade on the details region. Toggle the OS reduced-motion preference and reload — confirm the details mount instantly with no animation.

- [ ] **Step 5: Commit**

```bash
git add index.css components/layout/WhatsNewModal.tsx
git commit -m "feat(whats-new): gentle 150ms fade-in on details expansion

Adds .animate-disclosure-expand in index.css reusing the existing
fadeIn keyframe at a snappier 150ms, with a prefers-reduced-motion
opt-out. Collapse unmounts instantly (no transition) — snappier
than animating a variable-height collapse."
```

---

## Task 10: Remove dead code (Pill, PillIcon, GROUP_ORDER if unused, unused lucide imports)

Tasks 7–9 stopped using the type-count pills entirely. `Pill`, `PillIcon`, and their lucide icon imports (`Wrench`, `ArrowUpRight`) are dead code now. `Sparkles` is still used by the empty-state. `GROUP_ORDER` is still used by both the overview-rendering loop and the details list — keep it.

**Files:**

- Modify: `components/layout/WhatsNewModal.tsx`

- [ ] **Step 1: Remove `Pill` and `PillIcon` components**

In `WhatsNewModal.tsx`, find:

```tsx
const PillIcon: React.FC<{ type: ChangelogHighlightType }> = ({ type }) => {
  if (type === 'feature') {
    return <Sparkles className="w-3 h-3" />;
  }
  if (type === 'improvement') {
    return <ArrowUpRight className="w-3 h-3" />;
  }
  return <Wrench className="w-3 h-3" />;
};

const Pill: React.FC<{
  type: ChangelogHighlightType;
  label: string;
  count: number;
}> = ({ type, label, count }) => {
  const styles =
    type === 'feature'
      ? 'bg-emerald-50 text-emerald-700'
      : type === 'improvement'
        ? 'bg-blue-50 text-blue-700'
        : 'bg-amber-50 text-amber-700';
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xxs font-bold uppercase tracking-wide ${styles}`}
    >
      <PillIcon type={type} />
      {label}
      <span className="opacity-60">·</span>
      <span>{count}</span>
    </div>
  );
};
```

Delete both components entirely.

- [ ] **Step 2: Drop the now-unused lucide imports**

Find:

```tsx
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Sparkles,
  Wrench,
} from 'lucide-react';
```

Replace with (drops `ArrowUpRight` and `Wrench`; keep `Sparkles` because the empty-state uses it):

```tsx
import { ChevronDown, ChevronUp, RefreshCw, Sparkles } from 'lucide-react';
```

- [ ] **Step 3: Run linter and typecheck to confirm nothing else broke**

```bash
pnpm run lint
pnpm run type-check
```

Expected: both pass with zero errors and zero warnings. If the lint complains about unused locals, the cleanup is incomplete — re-scan the file for any stale references.

- [ ] **Step 4: Run all tests one more time**

```bash
pnpm run test -- tests/hooks/useChangelog.test.ts tests/components/layout/WhatsNewModal.test.tsx
```

Expected: all 26 tests pass (13 hook + 13 modal).

- [ ] **Step 5: Run the full test suite + format check**

```bash
pnpm run validate
```

Expected: type-check + lint + format-check + unit tests all green. If format-check fails, run `pnpm run format` then `git add` the reformatted files into a follow-up commit.

- [ ] **Step 6: Commit**

```bash
git add components/layout/WhatsNewModal.tsx
git commit -m "chore(whats-new): drop dead Pill components and unused icons

The type-count pills were removed from rendering in the disclosure
commit; this cleans up their now-unreferenced components and the
ArrowUpRight + Wrench lucide imports they used. Sparkles is kept
for the empty-state placeholder."
```

---

## Self-Review

Spec sections vs. plan tasks:

- **Schema** → Task 1
- **JSON migration** → Task 1
- **Renderer behavior (overview path)** → Tasks 6, 7, 8
- **Renderer behavior (no-overview path)** → Task 5 (regression test), Task 7 (final shape — `detailsList` rendered inline when no overview)
- **Type-count pills removed** → Task 7 (removed in render); Task 10 (dead component cleanup)
- **Visual treatment (themed subtitle, sub-bullet styling)** → Task 6 (subtitles), Task 8 (sub-bullets)
- **Disclosure mechanics (ARIA, unmount)** → Task 7
- **Animation (prefers-reduced-motion)** → Task 9
- **Header simplification** → Task 3
- **i18n (add 2 keys, remove `currentBuild`)** → Tasks 3 + 4
- **Hook tests** → Tasks 1 + 2
- **Component tests** → Tasks 5 (baseline), 6 (overview), 7 (disclosure), 8 (nested)
- **Routine prompt rewrite** → not in the plan, since it lives in Claude hosted config (not in repo). The fully-written prompt is in the spec doc, ready to copy after this work merges.

Placeholder scan: no "TBD", "TODO", "implement later", "add appropriate error handling" — checked.

Type consistency: `groupOverviewByType`, `OverviewSection`, `OverviewBulletList`, `formatEntryDate` — all defined in Task 6 (`groupOverviewByType` / `OverviewSection` / `OverviewBulletList`) and Task 3 (`formatEntryDate`), each consistently referenced in later tasks. `detailsId` and `expanded` introduced in Task 7 are not referenced elsewhere.
