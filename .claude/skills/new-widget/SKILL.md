---
name: new-widget
description: Use this skill whenever building a new widget for the SPART Board or making significant structural changes to an existing widget. Covers the complete widget creation workflow including type registration, file structure, component architecture, CSS container query scaling rules, the settings schema, admin config wiring, and all required config file updates. Follow the step-by-step checklist and refer to the provided templates and reference implementations to ensure your widget integrates seamlessly with the SPART Board's architecture and design standards.
---

# SPART Board — New Widget Skill

## The Complete Checklist (do these in order)

Every new widget touches **10 locations**, and a lifecycle widget adds an 11th
(see Step 0). Missing any one causes TypeScript errors, broken dock entries,
invisible gear buttons, scaling failures, a red CI run, or student data in a
tour recording.

Before shipping the widget, also verify the front-face component follows the
transparency ownership rule:

- the widget window shell owns overall transparency,
- the first full-size widget content layer defaults to `bg-transparent`,
- any readability background is localized to cards, chips, panels, control
  bars, or the actual media/canvas stage,
- never add a full-size opaque inner shell that visually replaces the widget
  window background.

| #   | File                                                      | What to add                                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `types.ts`                                                | `WidgetType` union member, config interface, `WidgetConfig` union, `ConfigForWidget` branch                                                                                                                                                                                            |
| 2   | `config/tools.ts`                                         | Entry in `TOOLS` array                                                                                                                                                                                                                                                                 |
| 3   | `components/widgets/YourWidget/`                          | Subdirectory with `Widget.tsx`, `settings.schema.ts`, `index.ts`                                                                                                                                                                                                                       |
| 3.5 | `pnpm run new-widget-settings your-widget`                | Scaffolds `settings.schema.ts`, the only way a widget gets settings (run after row 4's `WIDGET_COMPONENTS` entry) — see Step 3.5                                                                                                                                                       |
| 4   | `components/widgets/WidgetRegistry.ts`                    | Entries in `WIDGET_COMPONENTS`, `WIDGET_SCALING_CONFIG` and `WIDGET_SETTINGS_SCHEMAS`                                                                                                                                                                                                  |
| 5   | `config/widgetDefaults.ts`                                | Entry in `WIDGET_DEFAULTS`                                                                                                                                                                                                                                                             |
| 6   | `config/widgetGradeLevels.ts`                             | Entry in `WIDGET_GRADE_LEVELS`                                                                                                                                                                                                                                                         |
| 7   | `components/admin/`                                       | Admin config panel or modal (see admin-widget-config skill)                                                                                                                                                                                                                            |
| 8   | `components/admin/FeaturePermissionsManager.tsx`          | Wire admin config modal if using dedicated modal path                                                                                                                                                                                                                                  |
| 9   | `config/tourAnchors.ts`                                   | Tag the widget's primary actions with `tourAttr` (add item, start, reset, main settings toggles) and register them as `<widgetType>.<action>`; set `requires` when one only shows after setup (selected, scrolled into view, `settings-open` for an anchor inside the settings drawer) |
| 10  | `components/widgets/YourWidget/`                          | Tag elements that show student faces, photos or free-form student content with `data-pii`, so tour recordings blur them                                                                                                                                                                |
| 11  | `components/widgets/YourWidget/yourWidgetState.ts` + test | **Lifecycle widgets only:** state union, reducer, derive function and transition tests (Step 9)                                                                                                                                                                                        |

Tour anchors (row 9, Step 8): tag a click that assigns, shares, publishes, starts a live session or changes account settings `persists: true`, and one that deletes or clears `destructive: true`.

**Rubric scorecard (required before the PR).** A new widget needs a scorecard of B or better under the widget quality rubric (`docs/plans/WIDGET_RUBRIC.md`, R24):

1. Add `empty`, `typical` and `stress` fixtures in `components/dev/widgetGrader/fixtures/` (see `components/dev/widgetGrader/README.md`) and an empty `docs/widget-rubric/scorecards/<type>.json`.
2. Grade it with `/grade-widget <type>`.
3. `node scripts/widget-grader/loop.ts new-widget --type <type>` must pass: every dimension graded, no gate failure, B or better. Fix the lowest dimension first and re-grade until it does.
4. Commit the scorecard with the widget and put the letter and dimension scores in the PR description.

---

## Step 0 — Classify the widget first

Decide which kind of widget you are building before writing any code. The kind
decides whether Step 9 applies.

| Kind         | Test                                                                                                | Examples                                           | Step 9?                                                                |
| ------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| Static       | Only reads and writes its own `config`                                                              | Checklist, Clock, Text                             | No                                                                     |
| Simple async | Loads or saves external data, no stages                                                             | Weather, PdfWidget, Calendar                       | No, but give every listener an error callback and show the error state |
| Lifecycle    | Has stages (start, pause, end, reveal), runs on a timer, or syncs a teacher view with student views | Quiz, Video Activity, Poll, TimeTool, Live Session | **Yes**                                                                |

If you can name two or more states the widget moves between, it is a lifecycle
widget. When in doubt, treat it as one: a reducer costs one file, and scattered
booleans cost a bug in front of a class.

---

## Step 1 — types.ts

Four places to edit in this one file.

### a) WidgetType union

```ts
export type WidgetType =
  | 'clock'
  // ... existing types ...
  | 'your-widget'; // kebab-case or camelCase, match existing style
```

### b) Config interface

```ts
export interface YourWidgetConfig {
  // All user-editable settings. Use optional fields with sensible defaults.
  someText?: string;
  isEnabled?: boolean;
  fontFamily?: 'global' | 'font-mono' | 'font-sans' | 'font-handwritten';
  themeColor?: string;
}
```

Config keys are per-board by default and need no registration. Add a key to `APPEARANCE_CONFIG_KEYS` (`utils/widgetConfigPersistence.ts`) only if it is purely visual and holds no lesson content or student data; see CLAUDE.md "Board isolation".

### c) WidgetConfig union

```ts
export type WidgetConfig =
  | ClockConfig
  // ... existing ...
  | YourWidgetConfig; // add at end
```

### d) ConfigForWidget helper (maintains TypeScript narrowing)

Find the giant `ConfigForWidget` conditional chain and add a branch:

```ts
: T extends 'your-widget'
  ? YourWidgetConfig
  // continue existing chain...
```

---

## Step 2 — config/tools.ts

Add to the `TOOLS` array. Pick a `lucide-react` icon and a Tailwind bg color.

```ts
{
  type: 'your-widget',
  icon: YourIcon,
  label: 'Your Widget',
  color: 'bg-violet-500',
},
```

Available colors follow the pattern of existing tools (bg-blue-500, bg-teal-600,
bg-amber-500, etc.). Avoid duplicating a color already used by a closely
related widget.

---

## Step 3 — Widget Subdirectory Structure

**Always use a subdirectory**, never a single flat file. This is the standard
for all current widgets and enables clean co-location of widget logic.

```
components/widgets/YourWidget/
├── Widget.tsx            ← main front-face component
├── settings.schema.ts    ← settings drawer schema (scaffolded in Step 3.5)
└── index.ts              ← re-exports the front face
```

### index.ts (keep it simple)

```ts
export * from './Widget';
```

### Widget.tsx — Full Template

```tsx
import React from 'react';
import { WidgetData } from '@/types';
import { YourWidgetConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { YourIcon } from 'lucide-react';

export const YourWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as YourWidgetConfig;
  const { someText = 'Default', isEnabled = true } = config;

  // Empty/unconfigured state — always use ScaledEmptyState, never hand-roll
  if (!someText) {
    return (
      <ScaledEmptyState
        icon={YourIcon}
        title="Not Configured"
        subtitle="Open settings to set up this widget."
      />
    );
  }

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className="h-full w-full bg-transparent flex flex-col items-center justify-center"
          style={{ gap: 'min(12px, 2.5cqmin)' }}
        >
          {/* PRIMARY CONTENT — use large cqmin values */}
          <div
            className="font-black text-slate-800"
            style={{ fontSize: 'min(32px, 20cqmin)' }}
          >
            {someText}
          </div>

          {/* SECONDARY CONTENT */}
          <div
            className="text-slate-500 font-medium"
            style={{ fontSize: 'min(14px, 5.5cqmin)' }}
          >
            Subtitle or metadata
          </div>
        </div>
      }
    />
  );
};
```

### Transparency Rules For Widget.tsx

Treat these as hard requirements for new widgets:

- `DraggableWindow` owns widget transparency. Your widget should not recreate a
  second full-window background inside `Widget.tsx`.
- The first full-size container inside `WidgetLayout` should normally be
  `bg-transparent`.
- Do not use `contentClassName` on `WidgetLayout` to apply a widget-wide opaque
  background such as `bg-white`, `bg-slate-50`, `bg-slate-900`, `bg-slate-950`,
  or `bg-black`.
- Do not add `w-full h-full ... bg-*` wrappers unless the background is
  intentionally transparent or translucently localized to the actual stage.
- Loading, empty, and error states must follow the same rule. A loading screen
  with `bg-slate-50` across the full widget is still a transparency bug.

Preferred pattern:

```tsx
<WidgetLayout
  padding="p-0"
  content={
    <div className="h-full w-full bg-transparent flex flex-col">
      <div className="rounded-2xl bg-white/75 backdrop-blur-sm border border-slate-200/70">
        Localized readable surface
      </div>
    </div>
  }
/>
```

Avoid:

```tsx
<WidgetLayout
  padding="p-0"
  content={<div className="h-full w-full bg-white rounded-3xl">...</div>}
/>
```

If a widget truly needs a stage surface, constrain it to the actual canvas,
image frame, or media area and prefer translucent treatment first. Full-widget
opaque fills should be rare and explicitly justified.

---

## Step 3.5 — Settings schema

A widget's settings are never a hand-written panel. The settings drawer
(`docs/plans/shipped/WIDGET_SETTINGS_DRAWER.md`) renders them from a declarative
schema, `settings.schema.ts`. There are no `Settings.tsx` or `Appearance.tsx`
files in the repo.

Scaffold the schema once the widget's `*Config` type exists in `types.ts`
(Step 1) and its `WIDGET_COMPONENTS` entry exists (Step 4): the script finds the
widget's folder from that registry entry and stops if it is missing.

```bash
pnpm run new-widget-settings your-widget
```

This generates, idempotently:

- `components/widgets/YourWidget/settings.schema.ts` — a `defineSettings<YourWidgetConfig>({...})`
  module with an empty `content` group.
- `components/widgets/YourWidget/settings.schema.test.ts` — asserts
  `validateSchema` reports no errors.
- `tests/fixtures/widgetConfigs/your-widget.json` — a migration fixture stub.
- the `widgetSettings.your-widget` stub namespace in `locales/en.json` (review
  the diff before committing it, same as any other file the scaffold touches).

Use `--dry-run` to preview without writing. Then fill in the schema:

```ts
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { YourWidgetConfig } from '@/types';

export default defineSettings<YourWidgetConfig>({
  groups: [
    {
      id: 'content',
      fields: [{ key: 'someText', type: 'text', label: 'someText' }],
    },
    {
      id: 'behavior',
      fields: [{ key: 'isEnabled', type: 'toggle', label: 'isEnabled' }],
    },
    {
      id: 'display',
      fields: [{ key: 'accent', type: 'color', label: 'accent' }],
    },
  ],
  styleKeys: ['fontFamily', 'fontColor', 'textSizePreset', 'cardColor'],
});
```

- **Groups decide the tab.** `content` and `behavior` render on the drawer's
  Settings tab; `display` is the widget's own section of the Style tab.
- **`styleKeys` add the shared appearance fields** (`fontFamily`, `fontColor`,
  `textSizePreset`, `cardColor` with its opacity) to the Style tab, so don't
  redeclare them as fields. See the Widget Appearance Standard in
  `components/widgets/CLAUDE.md`.
- **`label` is a key**, resolved in the `widgetSettings.your-widget` namespace
  of `locales/en.json`.
- **Field types** are listed in `components/settings/schema/types.ts` (`toggle`,
  `text`, `number`, `select`, `segmented`, `slider`, `color`, `list`,
  `rosterPicker` and more). Anything the kit can't express is a `custom` field
  with a `render` function, kept in a `settingsFields.tsx` beside the schema
  (see `components/widgets/SpecialistSchedule/`).
- The field kit and its rules are in `docs/plans/shipped/WIDGET_SETTINGS_DRAWER.md`
  §4.2–4.3.

Register the finished schema in `WIDGET_SETTINGS_SCHEMAS` (Step 4).

---

## Step 4 — WidgetRegistry.ts

Add entries to these three exports:

```ts
// WIDGET_COMPONENTS
'your-widget': lazyNamed(
  () => import('./YourWidget/Widget'),
  'YourWidget'
),

// WIDGET_SETTINGS_SCHEMAS (after Step 3.5 has scaffolded the schema)
'your-widget': () =>
  import('./YourWidget/settings.schema').then((m) => m.default),

// WIDGET_SCALING_CONFIG
'your-widget': {
  baseWidth: 300,    // reasonable default spawn width
  baseHeight: 250,   // reasonable default spawn height
  canSpread: true,   // true = fills container; false = fixed at baseWidth/Height
  skipScaling: true, // ALWAYS true for new widgets (see scaling rules below)
  padding: 0,
},
```

Never add to `WIDGET_SETTINGS_COMPONENTS` or `WIDGET_APPEARANCE_COMPONENTS`.
Both are empty legacy maps kept only for the old panel slot; a widget in
`WIDGET_SETTINGS_SCHEMAS` must not appear in either.

**`canSpread` guidance:**

- `true` — widget content fills the full container naturally (most widgets)
- `false` — widget has a fixed aspect ratio or must not stretch (e.g., QR code, traffic light)

**Never omit `skipScaling: true`** on a new widget. The only exceptions that
intentionally omit it are `drawing` (canvas coordinates) and `seating-chart`
(absolute-positioned nodes). All new widgets use container queries.

> **`WIDGET_SCALING_CONFIG` is exhaustive — omitting an entry is a compile error,
> not a silent runtime fallback.** Unlike `WIDGET_COMPONENTS` and
> `WIDGET_SETTINGS_SCHEMAS` (both typed `Partial<Record<WidgetType, …>>`, so a
> missing entry only surfaces at runtime), `WIDGET_SCALING_CONFIG` is a full
> `Record<WidgetType, ScalingConfig>`. Adding a new `WidgetType` to `types.ts`
> without a matching entry here fails `pnpm type-check` and blocks CI.
> `WIDGET_DEFAULTS` and `WIDGET_GRADE_LEVELS` are exhaustive in the same way.
> The runtime `?? DEFAULT_SCALING_CONFIG` fallback in `WidgetRenderer.tsx` can
> never fire for a shipped widget because the compiler rejects the omission
> first.

---

## Step 5 — config/widgetDefaults.ts

```ts
'your-widget': {
  w: 300,
  h: 250,
  config: {
    someText: '',
    isEnabled: true,
    fontFamily: 'global',
  } satisfies YourWidgetConfig,
},
```

The `w` and `h` values must match `baseWidth`/`baseHeight` in `WIDGET_SCALING_CONFIG`.
Use `satisfies YourWidgetConfig` (not `as`) to catch missing required fields at compile time.

---

## Step 6 — config/widgetGradeLevels.ts

```ts
'your-widget': ALL_GRADE_LEVELS,
// OR be specific:
'your-widget': ['k-2', '3-5'],
```

Grade level guidance:

- K-2 tools: simple, visual, tactile (dice, traffic light, sound)
- 3-5 tools: still visual but with more reading/text (schedules, weather)
- 6-8 / 9-12: data-heavy, text-heavy, complex interaction (QR, embed, poll)
- Most tools: `ALL_GRADE_LEVELS`

---

## Step 7 — Admin Config

Every new widget needs at least a stub admin config. See the
`admin-widget-config` skill for the full admin config workflow.

At minimum, register in `FeatureConfigurationPanel.tsx`'s `BUILDING_CONFIG_PANELS`
map — even if the panel is initially empty — so the gear button in Admin
Settings → Widgets renders something instead of the "No admin settings."
placeholder. Building defaults only reach a new widget once
`getAdminBuildingConfig` in `utils/adminBuildingConfig.ts` has a `case` for the
widget type; without one they are saved and ignored.

For widgets with meaningful building-level defaults (fonts, preloaded content,
feature flags), invest in a proper config panel using the specialist-schedule
modal as the gold standard.

---

## Step 8 — Tour Anchors and PII Tags

**Tour anchors.** Tag the widget's primary actions (add item, start, reset,
main settings toggles) with `tourAttr('<widgetType>.<action>')` from
`config/tourAnchors.ts`, and register each id in `TOUR_ANCHORS`. A board can
hold several copies of a widget, so pass the instance id and mark the entry
`perWidget: true`:

```tsx
// config/tourAnchors.ts
'your-widget.start': { label: 'Start button in Your Widget', perWidget: true },

// Widget.tsx
<button {...tourAttr('your-widget.start', widget.id)} onClick={start}>
```

`tests/tourAnchors.test.ts` fails CI if a registered anchor isn't rendered in
source, or if a `data-tour` literal isn't registered. It finds uses by
grepping, so always pass the id as a string literal. Set `requires`,
`persists` and `destructive` as the checklist above describes. The rest of the
tour rules (the `Live Tour Anchors` PR check, `config/tourSurfaces/`, and
`no-tour-anchor:` comments) are in `components/CLAUDE.md` under "Live tour
anchors".

**PII.** Tag elements that show student faces, photos or free-form student
content with `data-pii` (`<div data-pii="">`) so tour recordings blur them.
Roster names in DOM text are matched automatically; `data-pii` covers what
text matching can't see, like `<video>`, `<img>` and drawing `<canvas>`
elements. See `components/widgets/ActivityWall/Widget.tsx`.

---

## Step 9 — Lifecycle Widgets: Reducer and Transition Tests First

Lifecycle state goes in a plain `useReducer` over a discriminated union, kept in
a pure module beside the widget. No XState or other library unless the widget
truly needs nested or parallel states; ask Paul first. Write the transition
tests before (or with) the component.

### Before you write a new state module, reuse the shared ones

| Need                                                                                                                                        | Use                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assigned session run state (active, paused, ended), assignment-to-session status mirror, end patch, "does this session accept student work" | `utils/sessionLifecycle.ts` (`deriveRunState`, `transition`, `endSessionPatch`, `assignmentLifecyclePatches`, `acceptsStudents`)                  |
| A countdown or stopwatch (start, pause, reset, expired)                                                                                     | `utils/timeToolClock.ts` (`clockStateOf`, `secondsAt`, `timeToolClockReducer`, `startFreshClock`). Never hand-roll `isRunning` + `startTime` math |
| A student screen built from a session doc plus local UI state                                                                               | Copy the shape of `utils/quizStudentPhase.ts` or `components/miniApp/miniAppViewState.ts`                                                         |

### The state module (`yourWidgetState.ts`)

```ts
// One union: each state carries only the fields that exist in it.
export type YourWidgetState =
  | { kind: 'idle' }
  | { kind: 'running'; startedAt: number }
  | { kind: 'paused'; elapsedMs: number }
  | { kind: 'ended'; endedAt: number };

export type YourWidgetEvent =
  | { type: 'start'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'end'; now: number };

export function yourWidgetReducer(
  state: YourWidgetState,
  event: YourWidgetEvent
): YourWidgetState {
  switch (state.kind) {
    case 'idle':
      return event.type === 'start'
        ? { kind: 'running', startedAt: event.now }
        : state; // disallowed: return the SAME object
    case 'running':
      if (event.type === 'pause')
        return { kind: 'paused', elapsedMs: event.now - state.startedAt };
      if (event.type === 'end') return { kind: 'ended', endedAt: event.now };
      return state;
    case 'paused':
      if (event.type === 'resume')
        return { kind: 'running', startedAt: event.now - state.elapsedMs };
      if (event.type === 'end') return { kind: 'ended', endedAt: event.now };
      return state;
    case 'ended':
      return state;
  }
}
```

Rules:

- **Pure.** Pass `now` in on the event, never call `Date.now()` inside the reducer.
- **Disallowed events return the same object** (not a copy), so React skips the
  render and tests can assert `toBe(state)`.
- **Exhaustive `switch` on `kind`**, no `default`, so a new state is a compile error.
- **No `useEffect` to derive or sync state.** Effects only subscribe to
  Firestore, timers or the DOM and `dispatch` the result.
- **Dispatch during render only when the event changes state**, otherwise React
  re-renders forever.
- **Never use a config field as an event** (an incrementing `trigger` counter).
  Every open tab or device acts on it, so the action happens twice. Have the
  writer apply it, or record the applied id.

### Persisted and Firestore state: derive, don't store a new shape

What lives in widget `config` or a session doc stays the flat, Firestore-friendly
shape. Read it through one `deriveYourWidgetState(doc, now)` function that returns
the union, and build writes with patch functions (`startPatch(state, now)`). That
way no data migration is needed, and impossible combinations of stored fields
map to one defined state instead of crashing the UI. Changing the stored shape of
existing session or response docs needs a migration plan Paul approves first.

### Teacher/student widgets

- List the disagreement cases before coding: teacher ends while a student is
  mid-submit, a student reloads after the end, two teacher tabs, an offline
  student, the close time passing. Each one gets a reducer or derive test.
- Teacher-only transitions (start, end, pause, advance, reveal) are enforced in
  `firestore.rules`, not just hidden in the UI. Students may write only their own
  response; the rules also refuse their writes after the session ends and refuse
  moving their own status backwards.
- Add rules tests in `tests/rules/` for **reads and writes**: a student denied
  each teacher-only field, the teacher allowed, and a student write after the end
  denied. Give the suite its own `PROJECT_ID`, and run
  `pnpm run check:rules-size` (the compiled ruleset has a size cliff).
- Teacher writes that depend on the current state (resume, advance) check the
  expected from-state with `transition()` before writing, so a stale tab cannot
  revive an ended session.

### Transition tests (`tests/.../yourWidgetState.test.ts`)

```ts
const ALL_EVENTS: YourWidgetEvent[] = [
  { type: 'start', now: 1 },
  { type: 'pause', now: 2 },
  { type: 'resume', now: 3 },
  { type: 'end', now: 4 },
];

it('idle -> running on start', () => {
  expect(yourWidgetReducer({ kind: 'idle' }, ALL_EVENTS[0])).toEqual({
    kind: 'running',
    startedAt: 1,
  });
});

it('ended ignores every event', () => {
  const ended = { kind: 'ended', endedAt: 9 } as const;
  for (const e of ALL_EVENTS) expect(yourWidgetReducer(ended, e)).toBe(ended);
});
```

Cover every allowed transition, assert `toBe(state)` for every disallowed
event in every state (loop over `ALL_EVENTS`), and add one test per
disagreement case. Run `pnpm exec vitest related --run <files>`.

---

## Backgrounds and Transparency (CRITICAL)

### The Rule

Keep the **root** of your `Widget.tsx` transparent (no `bg-white`, `bg-slate-50`, or full-bleed fill). `DraggableWindow` renders a glass shell behind every widget and its appearance is controlled by the global/per-widget **Transparency slider** — a full-widget root background will mask it and make the slider look broken.

Internal surfaces — list rows, grid cells, day cells, sidebar panels, the "quote" surface on TalkingTool, etc. — **should** use `cardColor` and `cardOpacity` from the widget config, via `hexToRgba(cardColor, cardOpacity)`. This gives teachers per-widget control over the readability of their content surfaces independent of the outer window frame.

### Correct Implementation

1. Keep the root of `Widget.tsx` (or the `content` passed to `WidgetLayout`) background-free — `bg-transparent` or no background at all.
2. If your widget exposes a `Surface` settings group (via `SurfaceColorSettings`), store the values on `cardColor` (hex string) and `cardOpacity` (0–1) in your widget's config type. Defaults should live in `config/widgetDefaults.ts`.
3. Apply `backgroundColor: hexToRgba(cardColor, cardOpacity)` to the **internal** surfaces the user expects to re-color (rows, cells, cards, content panels). Do **not** re-introduce a full-widget root fill.
4. The outer window frame is handled entirely by `DraggableWindow` + `GlassCard` + the global Transparency slider — do not pass `cardColor` through to them.

### Common Mistakes

- **WRONG**: Root-level `<div className="w-full h-full bg-white">...</div>` — masks the glass shell.
- **WRONG**: Internal rows/cells forced to `'transparent'` when the widget type defines `cardColor`/`cardOpacity` — drops user styling silently.
- **RIGHT**: Root stays transparent; internal row/cell wrappers apply `hexToRgba(cardColor, cardOpacity)` from config.

## Scaling Rules (Critical — read before writing any JSX)

### The Rule

Every element inside `Widget.tsx` that the user sees must use **`cqmin`-based
inline styles**. Never use Tailwind size classes (`text-sm`, `w-8 h-8`,
`size={24}`) or hardcoded pixel sizes in the front-face component.

### Why

`skipScaling: true` means the widget container is a CSS `container-type: size`.
Tailwind classes use `rem`/`px` which are **viewport-relative**, not
container-relative. A widget resized to 600px wide looks fine, but at 200px
wide the content overflows or disappears completely.

### The Formula: `min(Xpx, Ycqmin)`

- `X` = maximum size in pixels (caps scaling on very large widgets)
- `Y` = percentage of the smaller container dimension

### Quick Reference Table

| Element                | `cqmin` | px cap  | Example               |
| ---------------------- | ------- | ------- | --------------------- |
| Hero / primary number  | 20–30   | 32–64px | `min(48px, 25cqmin)`  |
| Large heading          | 7–10    | 16–24px | `min(20px, 8cqmin)`   |
| Body / list item text  | 5–6     | 13–16px | `min(14px, 5.5cqmin)` |
| Label / caption        | 4–5     | 11–13px | `min(12px, 4.5cqmin)` |
| Footer / tiny metadata | 3–4     | 10–11px | `min(10px, 3.5cqmin)` |
| Primary icon           | 20–30   | 48–80px | `min(64px, 28cqmin)`  |
| Decorative icon        | 8–15    | 16–48px | `min(32px, 12cqmin)`  |
| Button / small icon    | 4–6     | 14–24px | `min(20px, 5cqmin)`   |
| Padding / gap          | 2–4     | 8–16px  | `min(12px, 2.5cqmin)` |

### Applying to Icons (Lucide)

```tsx
// CORRECT
<SomeIcon style={{ width: 'min(32px, 10cqmin)', height: 'min(32px, 10cqmin)' }} />

// WRONG
<SomeIcon size={24} />
<SomeIcon className="w-8 h-8" />
```

### Fully Unbounded Scaling (for clocks, timers, hero numbers)

```tsx
// No px cap — scales to fill widget completely
style={{ fontSize: '28cqmin' }}

// OR clamp: min, preferred, max
style={{ fontSize: 'clamp(24px, 25cqmin, 120px)' }}
```

### Settings Exception

Settings render in the settings drawer from the schema, outside the widget's
container, so they never use container query units. A `custom` field component
(`settingsFields.tsx`) uses normal Tailwind classes:

```tsx
// settingsFields.tsx — Tailwind is fine here
<label className="text-xs font-bold text-slate-600">Label</label>
<input className="w-full px-3 py-2 text-sm border rounded-xl" />
```

---

## File Naming Conventions

- Widget directory: `PascalCase/` matching the component name
- Component export: `YourWidget`. Settings are the default export of `settings.schema.ts`
- `lazyNamed` second argument must **exactly match** the exported name
- Widget type string in `WidgetType`: match existing style — newer widgets use
  kebab-case (`'your-widget'`), older ones use camelCase (`yourWidget`). Prefer
  kebab-case for new widgets.

---

## Import Path Rules

Always use the `@/` alias. Never use relative `../../` paths.

```ts
// CORRECT
import { WidgetData } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';

// WRONG
import { WidgetData } from '../../types';
```

---

## Common Mistakes That Break Things

| Mistake                                                                  | Consequence                                                                                                                    | Fix                                                                                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Skipping `WIDGET_SCALING_CONFIG` entry                                   | `pnpm type-check` fails and CI blocks the PR — the map is an exhaustive `Record<WidgetType, …>`, NOT a silent runtime fallback | Add entry with `skipScaling: true`                                                                                 |
| Using `text-sm` in Widget.tsx                                            | Content doesn't scale; looks broken at small sizes                                                                             | Use `style={{ fontSize: 'min(14px, 5.5cqmin)' }}`                                                                  |
| Using `size={24}` on icons                                               | Icon stays 24px regardless of widget size                                                                                      | Use `style={{ width/height }}`                                                                                     |
| `lazyNamed` export name mismatch                                         | Silent runtime crash, widget shows loading spinner forever                                                                     | Match export name exactly                                                                                          |
| Writing a `Settings.tsx` panel or adding to `WIDGET_SETTINGS_COMPONENTS` | Nothing renders it: the legacy maps are empty and the drawer reads schemas                                                     | Declare the settings in `settings.schema.ts` and register it in `WIDGET_SETTINGS_SCHEMAS`                          |
| Forgetting `WIDGET_GRADE_LEVELS` entry                                   | TypeScript error, widget may not appear in filtered dock                                                                       | Add entry to map                                                                                                   |
| Using `as YourWidgetConfig` on defaults                                  | Mismatched fields silently accepted                                                                                            | Use `satisfies YourWidgetConfig`                                                                                   |
| Relative imports                                                         | Module resolution fails in some build contexts                                                                                 | Always use `@/`                                                                                                    |
| Forgetting `ConfigForWidget` branch                                      | TypeScript narrows to `never` for your type                                                                                    | Add ternary branch                                                                                                 |
| Hand-rolling empty states                                                | Inconsistent design across widgets                                                                                             | Use `ScaledEmptyState`                                                                                             |
| Mixing `cqw`/`cqh` instead of `cqmin`                                    | Scaling breaks when widget is non-square                                                                                       | Always use `cqmin`                                                                                                 |
| `skipScaling: false` on new widgets                                      | Widget uses legacy CSS-transform, scales inconsistently                                                                        | Set `skipScaling: true`                                                                                            |
| Full-widget root background in `Widget.tsx`                              | Masks the glass shell; global/per-widget Transparency slider looks broken.                                                     | Keep the root transparent. Apply `hexToRgba(cardColor, cardOpacity)` only to internal surfaces (rows/cells/cards). |
| Opaque `contentClassName` on `WidgetLayout`                              | Reintroduces a full-widget shell even if content is otherwise correct                                                          | Keep `contentClassName` structurally neutral; put backgrounds on smaller child surfaces                            |
| Loading/empty/error state uses full-bleed opaque fill                    | Transparency works in the default view but breaks in edge states                                                               | Apply the same transparent-root rule to all widget states                                                          |
| Lifecycle tracked with booleans (`isRunning`, `submitted`, `ended`)      | Impossible combinations (`isRunning` with no start time) reach the screen                                                      | One union + reducer (Step 9)                                                                                       |
| `status === 'ended'` checks spread across files                          | Two screens disagree about the same session                                                                                    | Check `kind` on the derived state in one place                                                                     |
| `useEffect` that sets state from other state                             | Extra renders, stale or looping state                                                                                          | Derive during render, or dispatch from the subscription                                                            |
| Teacher-only action hidden in the UI but not in rules                    | A scripted student can end, reveal or reopen                                                                                   | Mirror it in `firestore.rules` with a rules test                                                                   |

---

## Reading Existing Global Config in Widget.tsx

Admin building defaults reach a widget two ways. See the `admin-widget-config`
skill for both.

**When the widget is added.** `getAdminBuildingConfig` in
`utils/adminBuildingConfig.ts` layers the teacher's building defaults between
`WIDGET_DEFAULTS` and explicit overrides. It copies fields through a `switch` on
the widget type, so add a `case` for yours; no component code is needed.

**Live, in the component.** For a value that should keep following the admin
config (an option list, a schedule), read it in the component.
`useWidgetBuildingId(widget)` returns the widget's effective building, already
canonical:

```tsx
import { useAuth } from '@/context/useAuth';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import { canonicalizeBuildingKeyedRecord } from '@/config/buildings';

const { featurePermissions } = useAuth();
const buildingId = useWidgetBuildingId(widget) ?? 'schumann';

const globalConfig = useMemo(() => {
  const perm = featurePermissions.find((p) => p.widgetType === 'your-widget');
  return perm?.config as YourWidgetGlobalConfig | undefined;
}, [featurePermissions]);

const buildingDefaults =
  canonicalizeBuildingKeyedRecord(globalConfig?.buildingDefaults ?? {})[
    buildingId
  ] ?? {};
```

Building ids are the short canonical form (`'schumann'`, not
`'schumann-elementary'`); the long forms are legacy aliases, which is why the
record is canonicalized before the lookup.

---

## Reference Implementations

Study these before writing new widget code — they represent the current
gold standard for each pattern:

| Pattern                                            | Reference File                                                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Clean scaling (hero number)                        | `components/widgets/ClockWidget/Widget.tsx`                                                                                               |
| Icon + text layout                                 | `components/widgets/Weather/Widget.tsx`                                                                                                   |
| List with cqmin rows                               | `components/widgets/LunchCount/redesign/RedesignedLunchCount.tsx`                                                                         |
| Building-defaults consumption                      | `components/widgets/SpecialistSchedule/SpecialistScheduleWidget.tsx` (exception to the standard `Widget.tsx` convention — do not imitate) |
| Schema-driven settings                             | `components/widgets/Checklist/settings.schema.ts`                                                                                         |
| Good empty state usage                             | `components/widgets/QRWidget/Widget.tsx`                                                                                                  |
| Transparent-root front-face pattern                | `components/widgets/ExpectationsWidget/Widget.tsx`                                                                                        |
| Student view union + reducer + tests               | `components/miniApp/miniAppViewState.ts`, `tests/components/miniApp/miniAppViewState.test.ts`                                             |
| Session phase derived from a Firestore doc         | `utils/quizSessionPhase.ts`, `utils/videoActivityState.ts`                                                                                |
| Shared assigned-session lifecycle                  | `utils/sessionLifecycle.ts`                                                                                                               |
| Timer clock (pure functions over persisted config) | `utils/timeToolClock.ts`                                                                                                                  |
| Small phone-side reducer                           | `components/poll/pollPhoneState.ts`                                                                                                       |

> **SpecialistSchedule file layout (reference note):** SpecialistSchedule is
> the canonical building-defaults example, but its front face is
> `SpecialistScheduleWidget.tsx`, a non-standard filename; don't imitate it. Its
> other files are `index.ts`, `utils.ts`, `settings.schema.ts` and
> `settingsFields.tsx` (the `custom` field components the schema renders).
