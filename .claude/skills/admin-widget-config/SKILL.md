---
name: admin-widget-config
description: 'Use this skill whenever the user asks to add, edit, create, or wire up a widget configuration modal in the SPART Board admin settings. This covers Admin Settings > Widgets > Widget Config Modal — NOT the user-level widget settings panel on the dashboard. Triggers include: add admin config for a widget, create a config modal, the widget needs global settings, add building defaults, wire up the config button, admin config is not showing, or any request to manage widget behavior from the admin level. Always use this skill for admin-level widget configuration — do not place these settings in the user-facing widget settings panel.'
---

# SPART Board — Widget Admin Config Modal Skill

## What this skill covers

Creating or editing the **admin-level widget configuration modals** accessed via:

**Admin Settings → Widgets tab → ⚙️ (gear) button on a widget card**

This is **not** the user-level settings drawer (the drawer that opens when a teacher clicks the gear on their own widget, built from the widget's `settings.schema.ts`). This is the global admin config that sets **building-level defaults** and **admin-only controls** that users cannot see or edit.

---

## Architecture Overview

### Where config data lives

All widget admin configs are stored in Firestore:

```
/feature_permissions/{widgetType}
  .config: Record<string, unknown>   ← this is where your settings go
  .widgetType: string
  .accessLevel: 'admin' | 'beta' | 'public'
  .enabled: boolean
```

The `config` field is a flexible object typed per widget. Always store building-specific defaults nested under `buildingDefaults[canonicalBuildingId(buildingId)]`.

### Two implementation paths

#### Path A — Dedicated Modal (Gold Standard, prefer for complex widgets)

A self-contained `*ConfigurationModal.tsx` component that handles its own Firestore read/write.

**Example:** `components/admin/SpecialistScheduleConfigurationModal.tsx`

This is the **gold standard**. Prefer this path when:

- The widget has rich, complex configuration (calendars, building-specific schedules, multi-tab layouts)
- The UI needs custom layout beyond a simple panel stack

**Wiring location:** `components/admin/FeaturePermissionsManager.tsx` — the explicit conditional block near the bottom of the JSX:

```tsx
{
  activeModalTool?.type === 'your-widget-type' && (
    <YourWidgetConfigurationModal
      isOpen={true}
      onClose={() => setActiveModalTool(null)}
    />
  );
}
```

Also add the type to `CUSTOM_MODAL_TYPES` near the top of the same file. `GenericConfigurationModal` renders for every type that is not in that list, so without the entry both modals open:

```tsx
const CUSTOM_MODAL_TYPES: readonly string[] = [
  // existing entries, kept alphabetical...
  'your-widget-type',
];
```

#### Path B — Panel Inside Generic Modal (prefer for simpler widgets)

A `*ConfigurationPanel.tsx` component rendered inside the shared `GenericConfigurationModal`.

**Wiring location 1:** Register in the `BUILDING_CONFIG_PANELS` map in `components/admin/FeatureConfigurationPanel.tsx`. The map is keyed by plain string, and a panel with typed `config` props is cast on the way in:

```tsx
const BUILDING_CONFIG_PANELS: Partial<Record<string, BuildingConfigPanel>> = {
  // existing entries...
  'your-widget-type':
    YourWidgetConfigurationPanel as unknown as BuildingConfigPanel,
};
```

**Wiring location 2:** Import the panel at the top of `FeatureConfigurationPanel.tsx`:

```tsx
import { YourWidgetConfigurationPanel } from './YourWidgetConfigurationPanel';
```

That is all the wiring Path B needs. The "No admin settings." placeholder at the bottom of `FeatureConfigurationPanel.tsx` hides for every key of `BUILDING_CONFIG_PANELS` (its guard ends in `...Object.keys(BUILDING_CONFIG_PANELS)`). Add a type to the literal list in that guard only when its settings render elsewhere in the file without a map entry.

---

## Files to Modify (Checklist)

### For Path A (Dedicated Modal):

- [ ] **CREATE** `components/admin/YourWidgetConfigurationModal.tsx`
- [ ] **EDIT** `components/admin/FeaturePermissionsManager.tsx` — add import + conditional render + add the type to `CUSTOM_MODAL_TYPES`
- [ ] **EDIT** `types.ts` — add `YourWidgetGlobalConfig` interface if not already present
- [ ] **EDIT** `utils/adminBuildingConfig.ts` — add a `case` so building defaults reach new widgets (see "How Configs Reach the Widget")

### For Path B (Panel in Generic Modal):

- [ ] **CREATE** `components/admin/YourWidgetConfigurationPanel.tsx`
- [ ] **EDIT** `components/admin/FeatureConfigurationPanel.tsx` — add import + register in `BUILDING_CONFIG_PANELS`
- [ ] **EDIT** `types.ts` — add `YourWidgetGlobalConfig` interface if not already present
- [ ] **EDIT** `utils/adminBuildingConfig.ts` — add a `case` so building defaults reach new widgets (see "How Configs Reach the Widget")

---

## The Gold Standard Pattern (Path A)

Study `components/admin/SpecialistScheduleConfigurationModal.tsx` carefully before implementing. Key patterns it uses:

### Modal shell

Use the shared `Modal` from `@/components/common/Modal`. It owns the overlay, Escape, focus handling and the close button, so never hand-roll a `fixed inset-0` shell:

```tsx
<Modal
  isOpen={isOpen}
  onClose={onClose}
  maxWidth="max-w-5xl"
  customHeader={header}
  footer={footer}
  className="p-0!"
  contentClassName=""
  footerClassName="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between w-full shrink-0"
>
  <div className="p-6 space-y-8">{/* loading state, then the sections */}</div>
</Modal>
```

`header` holds the title and close button; `footer` holds the Save button.

### Firestore read pattern

```tsx
const fetchConfig = useCallback(async () => {
  if (isAuthBypass) {
    setLoading(false);
    return;
  }
  try {
    const docRef = doc(db, 'feature_permissions', 'your-widget-type');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as FeaturePermission;
      if (data.config)
        setConfig(data.config as unknown as YourWidgetGlobalConfig);
    }
  } catch (err) {
    console.error('Failed to fetch your-widget config:', err);
  } finally {
    setLoading(false);
  }
}, []);
```

### Firestore write pattern

```tsx
const { addToast } = useDashboard();

try {
  await setDoc(
    doc(db, 'feature_permissions', 'your-widget-type'),
    {
      type: 'your-widget-type',
      config: config as unknown as Record<string, unknown>,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
  addToast('Configuration saved!', 'success');
} catch (err) {
  console.error('Failed to save your-widget config:', err);
  addToast('Failed to save configuration.', 'error');
}
```

### Building selector

Get the building list from `useAdminBuildings()`, not the static `BUILDINGS` array: admins manage buildings in Admin Settings > Organization > Buildings, and the hook returns the organization's own list. Track the selection with `useBuildingSelection` and render the shared `BuildingSelector`, which carries its own tour anchors:

```tsx
const BUILDINGS = useAdminBuildings();
const [selectedBuildingId, setSelectedBuildingId] =
  useBuildingSelection(BUILDINGS);
// The hook can return a legacy long-form id; key buildingDefaults off the canonical one.
const canonicalId = canonicalBuildingId(selectedBuildingId);

<BuildingSelector
  selectedId={selectedBuildingId}
  onSelect={setSelectedBuildingId}
/>;
```

Store per-building data as:

```tsx
config.buildingDefaults[canonicalId] = {/* building-specific config */};
```

Always key by `canonicalBuildingId(buildingId)` from `@/config/buildings`, never the raw selector ID. Before spreading the record back on save, run it through `canonicalizeBuildingKeyedRecord(config.buildingDefaults ?? {})` so legacy keys don't linger beside canonical ones. See `ClockConfigurationPanel.tsx` and `TimeToolConfigurationPanel.tsx`.

### Required imports

```tsx
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import {
  canonicalBuildingId,
  canonicalizeBuildingKeyedRecord,
} from '@/config/buildings';
import { BuildingSelector } from './BuildingSelector';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { useDashboard } from '@/context/useDashboard';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
```

---

## What Goes In an Admin Config

### Type 1 — Standardized Defaults (mirroring user settings)

Any setting that exists in the widget's user-level settings (`components/widgets/YourWidget/settings.schema.ts`) should be replicated here as a per-building **default value**. When a teacher adds the widget, it initializes from this config based on their assigned building.

> Read the widget's `settings.schema.ts` first to inventory all configurable fields. There are no hand-written `Settings.tsx` files any more.

### Type 2 — Admin-Only Controls

Settings that should **not** be exposed to users at all:

- API keys / endpoint URLs (e.g., Google Sheet IDs, Apps Script URLs)
- Feature flags (e.g., OCR mode: Standard vs Gemini AI)
- DPI calibration values
- Grade-level targeting
- Content library management (sticker libraries, routine repositories, mini-app lists)
- Lock flags that prevent user override of specific fields

---

## How Configs Reach the Widget

### On a new widget

When a teacher adds a widget, `DashboardContext` layers its initial `config` as widget defaults, then the building's admin defaults, then any explicit overrides. The building layer comes from `getAdminBuildingConfig` in `utils/adminBuildingConfig.ts`, which canonicalizes `buildingDefaults`, picks the teacher's first selected building, and copies fields through a `switch` on the widget type.

**A widget with no `case` in that switch gets nothing**: the `default` branch returns an empty object. Add one that validates each field before copying it:

```ts
case 'your-widget-type': {
  if (typeof raw.someToggle === 'boolean') out.someToggle = raw.someToggle;
  if (raw.fontFamily) out.fontFamily = raw.fontFamily;
  break;
}
```

### Live, inside the widget

For a value that should follow the admin config after the widget exists (an option list, a schedule), read `featurePermissions` in the component. `useWidgetBuildingId(widget)` (`@/hooks/useWidgetBuildingId`) returns the widget's effective building, already canonical:

```tsx
const { featurePermissions } = useAuth();
const buildingId = useWidgetBuildingId(widget) ?? 'schumann';
const globalConfig = useMemo(() => {
  const perm = featurePermissions.find(
    (p) => p.widgetType === 'your-widget-type'
  );
  return perm?.config as YourWidgetGlobalConfig | undefined;
}, [featurePermissions]);
const buildingConfig =
  canonicalizeBuildingKeyedRecord(globalConfig?.buildingDefaults ?? {})[
    buildingId
  ] ?? defaultConfig;
```

---

## Types Pattern

In `types.ts`, add a global config interface:

```tsx
export interface YourWidgetGlobalConfig {
  buildingDefaults?: Record<string, YourWidgetBuildingConfig>;
  // admin-only top-level fields here
}

export interface YourWidgetBuildingConfig {
  // mirrors user-level WidgetConfig fields as optional defaults
  fontFamily?: string;
  someToggle?: boolean;
  // ... other default fields
}
```

Update `FeaturePermission` if it doesn't already have a union type for your config — most widgets use `config?: Record<string, unknown>` on `FeaturePermission` and cast at the call site, which is fine.

---

## Panel Pattern (Path B)

For simpler configs, the panel takes its own typed config and reports changes upward:

```tsx
interface YourWidgetConfigurationPanelProps {
  config: YourWidgetGlobalConfig;
  onChange: (newConfig: YourWidgetGlobalConfig) => void;
}
```

It renders the `BuildingSelector` and the config fields, and updates one building at a time:

```tsx
const buildingDefaults = canonicalizeBuildingKeyedRecord(
  config.buildingDefaults ?? {}
);
const current = buildingDefaults[canonicalId] ?? {};

const handleUpdateBuilding = (updates: Partial<YourWidgetBuildingConfig>) =>
  onChange({
    ...config,
    buildingDefaults: {
      ...buildingDefaults,
      [canonicalId]: { ...current, ...updates },
    },
  });
```

The parent `GenericConfigurationModal` handles Save/Cancel and Firestore persistence via `FeaturePermissionsManager`'s `updatePermission` → `savePermission` flow, so the panel never touches Firestore.

See `ClockConfigurationPanel.tsx`, `ScheduleConfigurationPanel.tsx`, or `DiceConfigurationPanel.tsx` for simple examples.

---

## Tour Anchors

Every control an admin could be walked to needs a live tour anchor (`components/CLAUDE.md`, "Live tour anchors"), and the `Live Tour Anchors` PR check fails on a new control without one. Admin config uses a shared set of ids that are already registered in `config/tourAnchors.ts`, so no new registry entry is needed:

| Control                 | Anchor                                                                         |
| ----------------------- | ------------------------------------------------------------------------------ |
| A config field          | `tourFieldAttr('admin.widget-config.field', 'your-widget-type', '<fieldKey>')` |
| Save / Close            | `tourTypeAttr('admin.widget-config.save' \| '.close', 'your-widget-type')`     |
| Add / remove row button | `tourTypeAttr('admin.widget-config.add' \| '.remove', 'your-widget-type')`     |
| Building selector       | Built into `BuildingSelector`                                                  |

Spread the result onto the element (`<input {...tourFieldAttr(...)} />`); `Toggle` takes it through its `anchor` prop.

---

## UI Standards

Match the specialist-schedule modal's visual quality:

- **Section headers:** `SettingsLabel` from `@/components/common/SettingsLabel`
- **Cards/sections:** `Card` from `@/components/common/Card` (`rounded="xl" shadow="none" className="bg-slate-50"`), or `bg-slate-50 p-5 rounded-2xl border border-slate-200`
- **Building picker:** the shared `BuildingSelector`, fed by `useAdminBuildings()`
- **Input fields:** `px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[color]-500 outline-none font-bold`
- **Primary button:** `bg-brand-blue-primary text-white` or widget-specific accent color
- **Save feedback:** `addToast(message, 'success' | 'error')` from `useDashboard()`
- **Loading state:** Show spinner or "Loading..." while fetching from Firestore
- **isAuthBypass guard:** Always skip Firestore ops when `isAuthBypass` is true (dev mode)
- **Copy:** follow "On-screen copy" in `components/CLAUDE.md` (a label and its control need no sentence under them)

---

## Common Mistakes to Avoid

1. **Wrong location** — Do NOT put this in the widget's `settings.schema.ts`. That is the user-level settings drawer. Admin config goes in `components/admin/`.

2. **Not wiring in FeaturePermissionsManager** — Creating the modal file is not enough. You MUST add the conditional render block in `FeaturePermissionsManager.tsx`. Without this, the gear button does nothing.

3. **Not adding to `CUSTOM_MODAL_TYPES`** — If you create a dedicated modal but leave the widget type out of that list, `GenericConfigurationModal` renders too.

4. **Missing isAuthBypass guard** — Dev/test environments use `isAuthBypass = true` to skip Firebase. Always check this before Firestore reads/writes.

5. **Hardcoding building IDs or importing `BUILDINGS`** — Use `useAdminBuildings()`; the static array is only the seed list.

6. **Forgetting to update types.ts** — If you add new config fields, add them to the interface in `types.ts`. The `config` field on `FeaturePermission` accepts `Record<string, unknown>` and is cast at the callsite.

7. **Using local widget state** — Admin configs are global. Ensure saves go to Firestore, not just component state.

8. **No `case` in `getAdminBuildingConfig`** — The admin saves defaults and new widgets ignore them.

9. **Controls without tour anchors** — The `Live Tour Anchors` check fails the PR.
