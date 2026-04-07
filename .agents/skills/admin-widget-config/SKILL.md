---
name: admin-widget-config
description: Use this skill whenever the user asks to add, edit, create, or wire up a widget configuration modal in the SpartBoard admin settings. This covers Admin Settings > Feature Permissions > Widget Config Modal — NOT the user-level widget settings panel on the dashboard. Triggers include: add admin config for a widget, create a config modal, the widget needs global settings, add building defaults, wire up the config button, admin config is not showing, or any request to manage widget behavior from the admin level. Always use this skill for admin-level widget configuration — do not place these settings in the user-facing widget settings panel.
---

# SpartBoard — Widget Admin Config Modal Skill

## What this skill covers

Creating or editing the **admin-level widget configuration modals** accessed via:

**Admin Settings → Feature Permissions tab → ⚙️ (gear) button on a widget card**

This is **not** the user-level settings panel (the small panel that opens when a teacher clicks the gear on their own widget). This is the global admin config that sets **building-level defaults** and **admin-only controls** that users cannot see or edit.

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

The `config` field is a flexible object typed per widget. Always store building-specific defaults nested under `buildingDefaults[buildingId]`.

### Two implementation paths

#### Path A — Dedicated Modal (Gold Standard, prefer for complex widgets)

A self-contained `*ConfigurationModal.tsx` component that handles its own Firestore read/write.

**Example:** `components/admin/SpecialistScheduleConfigurationModal.tsx`

This is the **gold standard**. Prefer this path when:
- The widget has rich, complex configuration (calendars, building-specific schedules, multi-tab layouts)
- The UI needs custom layout beyond a simple panel stack

**Wiring location:** `components/admin/FeaturePermissionsManager.tsx` — the explicit conditional block near the bottom of the JSX:
```tsx
{activeModalTool?.type === 'your-widget-type' && (
  <YourWidgetConfigurationModal
    isOpen={true}
    onClose={() => setActiveModalTool(null)}
  />
)}
```
Also add the type to the exclusion array above `GenericConfigurationModal`:
```tsx
{activeModalTool &&
  !['instructionalRoutines', 'stickers', 'calendar', 'specialist-schedule', 'miniApp', 'starter-pack', 'your-widget-type'].includes(activeModalTool.type) && (
    <GenericConfigurationModal ... />
  )}
```

#### Path B — Panel Inside Generic Modal (prefer for simpler widgets)

A `*ConfigurationPanel.tsx` component rendered inside the shared `GenericConfigurationModal`.

**Wiring location 1:** Register in `BUILDING_CONFIG_PANELS` map in `components/admin/FeatureConfigurationPanel.tsx`:
```tsx
const BUILDING_CONFIG_PANELS: Partial<Record<WidgetType | InternalToolType, BuildingConfigPanel>> = {
  // existing entries...
  'your-widget-type': YourWidgetConfigurationPanel,
};
```

**Wiring location 2:** Import the panel at the top of `FeatureConfigurationPanel.tsx`:
```tsx
import { YourWidgetConfigurationPanel } from './YourWidgetConfigurationPanel';
```

**Wiring location 3:** Add to the exclusion list in `FeatureConfigurationPanel.tsx` at the bottom (the `![]includes(tool.type)` guard that shows the "No global settings available" placeholder):
```tsx
![
  'lunchCount', 'weather', /* ... existing ... */,
  ...Object.keys(BUILDING_CONFIG_PANELS),
].includes(tool.type)
```
Note: Since BUILDING_CONFIG_PANELS already covers this with `Object.keys(...)`, you usually only need to register in the map.

---

## Files to Modify (Checklist)

### For Path A (Dedicated Modal):
- [ ] **CREATE** `components/admin/YourWidgetConfigurationModal.tsx`
- [ ] **EDIT** `components/admin/FeaturePermissionsManager.tsx` — add import + conditional render + update exclusion array
- [ ] **EDIT** `types.ts` — add `YourWidgetGlobalConfig` interface if not already present

### For Path B (Panel in Generic Modal):
- [ ] **CREATE** `components/admin/YourWidgetConfigurationPanel.tsx`
- [ ] **EDIT** `components/admin/FeatureConfigurationPanel.tsx` — add import + register in `BUILDING_CONFIG_PANELS`
- [ ] **EDIT** `types.ts` — add `YourWidgetGlobalConfig` interface if not already present

---

## The Gold Standard Pattern (Path A)

Study `components/admin/SpecialistScheduleConfigurationModal.tsx` carefully before implementing. Key patterns it uses:

### Modal shell
```tsx
<div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
  <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-white/20 animate-in zoom-in-95 duration-200">
    {/* Header */}
    {/* Content - flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar */}
    {/* Footer with Save button */}
  </div>
</div>
```

### Firestore read pattern
```tsx
const fetchConfig = useCallback(async () => {
  if (isAuthBypass) { setLoading(false); return; }
  const docRef = doc(db, 'feature_permissions', 'your-widget-type');
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const data = snap.data() as FeaturePermission;
    if (data.config) setConfig(data.config as unknown as YourWidgetGlobalConfig);
  }
  setLoading(false);
}, []);
```

### Firestore write pattern
```tsx
await setDoc(
  doc(db, 'feature_permissions', 'your-widget-type'),
  { type: 'your-widget-type', config: config as unknown as Record<string, unknown>, updatedAt: Date.now() },
  { merge: true }
);
```

### Building selector
Always use `BUILDINGS` from `@/config/buildings` for the building list. Use a tab or sidebar selector so admins can configure each building independently. Store per-building data as:
```tsx
config.buildingDefaults[buildingId] = { /* building-specific config */ }
```

### Required imports
```tsx
import { BUILDINGS } from '@/config/buildings';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { Toast } from '../common/Toast';
import { Button } from '../common/Button';
```

---

## What Goes In an Admin Config

### Type 1 — Standardized Defaults (mirroring user settings)
Any setting that exists in the user-level widget settings (`components/widgets/YourWidget/Settings.tsx`) should be replicated here as a per-building **default value**. When a teacher adds the widget, it initializes from this config based on their assigned building.

> Read the user-level `Settings.tsx` file for the widget first to inventory all configurable fields.

Common pattern: check `featurePermissions` in `AuthContext` / `useAuth()` to hydrate widget initial state from global config.

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

When a widget is added to a dashboard, its initial `config` is typically populated from:
1. The user's `selectedBuildings[0]` from `useAuth()`
2. The `featurePermissions` array from `useAuth()` → find the permission for the widget type → read `.config.buildingDefaults[buildingId]`

Make sure the widget's initialization code in `DashboardContext.tsx` or the widget component itself reads from `featurePermissions`. Reference how `SpecialistScheduleSettings.tsx` reads `featurePermissions` for a working example:
```tsx
const globalConfig = useMemo(() => {
  const perm = featurePermissions.find(p => p.widgetType === 'your-widget-type');
  return perm?.config as YourWidgetGlobalConfig | undefined;
}, [featurePermissions]);
const buildingId = selectedBuildings[0] ?? 'schumann-elementary';
const buildingConfig = globalConfig?.buildingDefaults?.[buildingId] ?? defaultConfig;
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

For simpler configs, the panel component receives:
```tsx
interface YourWidgetConfigurationPanelProps {
  config: Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}
```

It renders building selector tabs + config fields. The parent `GenericConfigurationModal` handles Save/Cancel and Firestore persistence via `FeaturePermissionsManager`'s `updatePermission` → `savePermission` flow.

See `ClockConfigurationPanel.tsx`, `ScheduleConfigurationPanel.tsx`, or `DiceConfigurationPanel.tsx` for simple examples.

---

## UI Standards

Match the specialist-schedule modal's visual quality:

- **Section headers:** `text-sm font-black text-slate-700 uppercase tracking-widest`
- **Cards/sections:** `bg-slate-50 p-5 rounded-2xl border border-slate-200`
- **Building tabs:** Tab strip across the top of content area using `BUILDINGS` array
- **Input fields:** `px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[color]-500 outline-none font-bold`
- **Primary button:** `bg-brand-blue-primary text-white` or widget-specific accent color
- **Toast feedback:** Use `<Toast>` component for save confirmations/errors
- **Loading state:** Show spinner or "Loading..." while fetching from Firestore
- **isAuthBypass guard:** Always skip Firestore ops when `isAuthBypass` is true (dev mode)

---

## Common Mistakes to Avoid

1. **Wrong location** — Do NOT put this in `components/widgets/YourWidget/Settings.tsx`. That is the user-level panel. Admin config goes in `components/admin/`.

2. **Not wiring in FeaturePermissionsManager** — Creating the modal file is not enough. You MUST add the conditional render block in `FeaturePermissionsManager.tsx`. Without this, the gear button does nothing.

3. **Not adding to the exclusion array** — If you create a dedicated modal but forget to exclude the widget type from the `GenericConfigurationModal` fallback, both will try to render.

4. **Missing isAuthBypass guard** — Dev/test environments use `isAuthBypass = true` to skip Firebase. Always check this before Firestore reads/writes.

5. **Hardcoding building IDs** — Always import and iterate over `BUILDINGS` from `@/config/buildings` rather than hardcoding building IDs.

6. **Forgetting to update types.ts** — If you add new config fields, add them to the interface in `types.ts`. The `config` field on `FeaturePermission` accepts `Record<string, unknown>` and is cast at the callsite.

7. **Using local widget state** — Admin configs are global. Ensure saves go to Firestore, not just component state.
