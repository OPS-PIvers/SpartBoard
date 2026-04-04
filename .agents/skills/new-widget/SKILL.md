---
name: new-widget
description: Use this skill whenever building a new widget for the SPART Board or making significant structural changes to an existing widget. Covers the complete widget creation workflow including type registration, file structure, component architecture, CSS container query scaling rules, settings panels, appearance panels, admin config wiring, and all required config file updates. Follow the step-by-step checklist and refer to the provided templates and reference implementations to ensure your widget integrates seamlessly with the SPART Board's architecture and design standards.
---

# SPART Board — New Widget Skill

## The Complete Checklist (do these in order)

Every new widget touches **8 locations**. Missing any one causes TypeScript
errors, broken dock entries, invisible gear buttons, or scaling failures.

Before shipping the widget, also verify the front-face component follows the
transparency ownership rule:

- the widget window shell owns overall transparency,
- the first full-size widget content layer defaults to `bg-transparent`,
- any readability background is localized to cards, chips, panels, control
  bars, or the actual media/canvas stage,
- never add a full-size opaque inner shell that visually replaces the widget
  window background.

| # | File | What to add |
|---|------|-------------|
| 1 | `types.ts` | `WidgetType` union member, config interface, `WidgetConfig` union, `ConfigForWidget` branch |
| 2 | `config/tools.ts` | Entry in `TOOLS` array |
| 3 | `components/widgets/YourWidget/` | Subdirectory with `Widget.tsx`, `Settings.tsx`, `index.ts` |
| 4 | `components/widgets/WidgetRegistry.ts` | Entries in `WIDGET_COMPONENTS`, `WIDGET_SETTINGS_COMPONENTS`, `WIDGET_APPEARANCE_COMPONENTS`, `WIDGET_SCALING_CONFIG` |
| 5 | `config/widgetDefaults.ts` | Entry in `WIDGET_DEFAULTS` |
| 6 | `config/widgetGradeLevels.ts` | Entry in `WIDGET_GRADE_LEVELS` |
| 7 | `components/admin/` | Admin config panel or modal (see spart-widget-admin-config skill) |
| 8 | `components/admin/FeaturePermissionsManager.tsx` | Wire admin config modal if using dedicated modal path |

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
├── Widget.tsx       ← main front-face component
├── Settings.tsx     ← back-face settings + appearance panels
└── index.ts         ← re-exports (optional but clean)
```

### index.ts (keep it simple)
```ts
export { YourWidget } from './Widget';
export { YourWidgetSettings } from './Settings';
export { YourWidgetAppearanceSettings } from './Settings'; // if needed
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
        subtitle="Flip to set up this widget."
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
  content={
    <div className="h-full w-full bg-white rounded-3xl">
      ...
    </div>
  }
/>
```

If a widget truly needs a stage surface, constrain it to the actual canvas,
image frame, or media area and prefer translucent treatment first. Full-widget
opaque fills should be rare and explicitly justified.

### Settings.tsx — Template
```tsx
import React from 'react';
import { WidgetData } from '@/types';
import { YourWidgetConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';

// SETTINGS — normal Tailwind classes, NO cqmin needed
export const YourWidgetSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as YourWidgetConfig;

  const update = (updates: Partial<YourWidgetConfig>) => {
    updateWidget(widget.id, { config: { ...config, ...updates } });
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
          Some Setting
        </label>
        <input
          type="text"
          value={config.someText ?? ''}
          onChange={(e) => update({ someText: e.target.value })}
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
          placeholder="Enter value..."
        />
      </div>
    </div>
  );
};

// APPEARANCE SETTINGS — only export if your widget has style/appearance controls
// (font, color theme, opacity beyond the universal transparency slider, etc.)
export const YourWidgetAppearanceSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as YourWidgetConfig;
  const update = (updates: Partial<YourWidgetConfig>) => {
    updateWidget(widget.id, { config: { ...config, ...updates } });
  };

  return (
    <div className="p-4 space-y-4">
      {/* Color, font, theme controls here */}
    </div>
  );
};
```

---

## Step 4 — WidgetRegistry.ts

Add entries to **all four** of these exports (skip `WIDGET_APPEARANCE_COMPONENTS`
only if the widget genuinely has no appearance/style settings):

```ts
// WIDGET_COMPONENTS
'your-widget': lazyNamed(
  () => import('./YourWidget/Widget'),
  'YourWidget'
),

// WIDGET_SETTINGS_COMPONENTS
'your-widget': lazyNamed(
  () => import('./YourWidget/Settings'),
  'YourWidgetSettings'
),

// WIDGET_APPEARANCE_COMPONENTS (omit only if no appearance tab needed)
'your-widget': lazyNamed(
  () => import('./YourWidget/Settings'),
  'YourWidgetAppearanceSettings'
),

// WIDGET_SCALING_CONFIG
'your-widget': {
  baseWidth: 300,    // reasonable default spawn width
  baseHeight: 250,   // reasonable default spawn height
  canSpread: true,   // true = fills container; false = fixed at baseWidth/Height
  skipScaling: true, // ALWAYS true for new widgets (see scaling rules below)
  padding: 0,
},
```

**`canSpread` guidance:**
- `true` — widget content fills the full container naturally (most widgets)
- `false` — widget has a fixed aspect ratio or must not stretch (e.g., QR code, traffic light)

**Never omit `skipScaling: true`** on a new widget. The only exceptions that
intentionally omit it are `drawing` (canvas coordinates) and `seating-chart`
(absolute-positioned nodes). All new widgets use container queries.

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
`spart-widget-admin-config` skill for the full admin config workflow.

At minimum, register in `FeatureConfigurationPanel.tsx`'s `BUILDING_CONFIG_PANELS`
map — even if the panel is initially empty — so the gear button in Admin
Settings → Feature Permissions renders something instead of the
"No global settings available" placeholder.

For widgets with meaningful building-level defaults (fonts, preloaded content,
feature flags), invest in a proper config panel using the specialist-schedule
modal as the gold standard.

---

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

| Element | `cqmin` | px cap | Example |
|---------|---------|--------|---------|
| Hero / primary number | 20–30 | 32–64px | `min(48px, 25cqmin)` |
| Large heading | 7–10 | 16–24px | `min(20px, 8cqmin)` |
| Body / list item text | 5–6 | 13–16px | `min(14px, 5.5cqmin)` |
| Label / caption | 4–5 | 11–13px | `min(12px, 4.5cqmin)` |
| Footer / tiny metadata | 3–4 | 10–11px | `min(10px, 3.5cqmin)` |
| Primary icon | 20–30 | 48–80px | `min(64px, 28cqmin)` |
| Decorative icon | 8–15 | 16–48px | `min(32px, 12cqmin)` |
| Button / small icon | 4–6 | 14–24px | `min(20px, 5cqmin)` |
| Padding / gap | 2–4 | 8–16px | `min(12px, 2.5cqmin)` |

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

### Settings Panel Exception
The settings panel (`Settings.tsx`) flips to the **back face** of the widget
and does NOT use container queries. Normal Tailwind classes are correct there:
```tsx
// Settings.tsx — Tailwind is fine here
<label className="text-xs font-bold text-slate-600">Label</label>
<input className="w-full px-3 py-2 text-sm border rounded-xl" />
```

---

## File Naming Conventions

- Widget directory: `PascalCase/` matching the component name
- Component exports: `YourWidget`, `YourWidgetSettings`, `YourWidgetAppearanceSettings`
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

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Skipping `WIDGET_SCALING_CONFIG` entry | Widget won't render — falls to `DEFAULT_SCALING_CONFIG` silently | Add entry with `skipScaling: true` |
| Using `text-sm` in Widget.tsx | Content doesn't scale; looks broken at small sizes | Use `style={{ fontSize: 'min(14px, 5.5cqmin)' }}` |
| Using `size={24}` on icons | Icon stays 24px regardless of widget size | Use `style={{ width/height }}` |
| `lazyNamed` export name mismatch | Silent runtime crash, widget shows loading spinner forever | Match export name exactly |
| Forgetting `WIDGET_GRADE_LEVELS` entry | TypeScript error, widget may not appear in filtered dock | Add entry to map |
| Using `as YourWidgetConfig` on defaults | Mismatched fields silently accepted | Use `satisfies YourWidgetConfig` |
| Relative imports | Module resolution fails in some build contexts | Always use `@/` |
| Forgetting `ConfigForWidget` branch | TypeScript narrows to `never` for your type | Add ternary branch |
| Hand-rolling empty states | Inconsistent design across widgets | Use `ScaledEmptyState` |
| Mixing `cqw`/`cqh` instead of `cqmin` | Scaling breaks when widget is non-square | Always use `cqmin` |
| `skipScaling: false` on new widgets | Widget uses legacy CSS-transform, scales inconsistently | Set `skipScaling: true` |
| Full-size root like `w-full h-full bg-white` in `Widget.tsx` | Widget transparency slider appears broken because inner content masks the window shell | Make the root `bg-transparent` and move readability treatment to localized surfaces |
| Opaque `contentClassName` on `WidgetLayout` | Reintroduces a full-widget shell even if content is otherwise correct | Keep `contentClassName` structurally neutral; put backgrounds on smaller child surfaces |
| Loading/empty/error state uses full-bleed opaque fill | Transparency works in the default view but breaks in edge states | Apply the same transparent-root rule to all widget states |

---

## Reading Existing Global Config in Widget.tsx

If the widget has admin-level building defaults, read them in the component:

```tsx
import { useAuth } from '@/context/useAuth';

const { featurePermissions, selectedBuildings } = useAuth();
const buildingId = selectedBuildings[0] ?? 'schumann-elementary';

const globalConfig = useMemo(() => {
  const perm = featurePermissions.find(p => p.widgetType === 'your-widget');
  return perm?.config as YourWidgetGlobalConfig | undefined;
}, [featurePermissions]);

const buildingDefaults = globalConfig?.buildingDefaults?.[buildingId] ?? {};
```

Then merge `buildingDefaults` with widget-instance `config` when the widget is
first added (or read both in the component and let instance config override).

---

## Reference Implementations

Study these before writing new widget code — they represent the current
gold standard for each pattern:

| Pattern | Reference File |
|---------|----------------|
| Clean scaling (hero number) | `components/widgets/ClockWidget/Widget.tsx` |
| Icon + text layout | `components/widgets/Weather/Widget.tsx` |
| List with cqmin rows | `components/widgets/LunchCount/Widget.tsx` |
| Building-defaults consumption | `components/widgets/SpecialistSchedule/Widget.tsx` |
| Settings + Appearance split | `components/widgets/ClockWidget/Settings.tsx` |
| Good empty state usage | `components/widgets/QRWidget/Widget.tsx` |
| Transparent-root front-face pattern | `components/widgets/ExpectationsWidget/Widget.tsx` |
