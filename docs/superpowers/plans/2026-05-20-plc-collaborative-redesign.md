# PLC Collaborative Space Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the PLC area into the go-to collaborative space — sidebar navigation, real in-PLC quiz/VA authoring + full assignment configuration (no board needed), a filterable shared-data view, Google-Docs-embedded shared notes, a clean designed landing page, and an admin surface to curate/push resources & assignments to specific or all PLCs.

**Architecture:** Single feature branch (`dev-paul-plc-redesign`), single PR, many commits. Work is sequenced into **three waves**: (1) a sequential **scaffolding** commit that lands all shared-file changes (types, firestore rules, i18n, the new left-rail shell, and empty body stubs) so parallel work can't collide on shared files; (2) **five parallel work-streams**, each owning its own new files (Home, Authoring+Assignment, Shared Data, Docs, Admin Push); (3) a sequential **integration** commit that wires bodies into the rail, deletes the retired bento/grid code, and runs full validation. The redesign reuses the proven `SettingsModal`/`AdminSettings` left-rail pattern, the self-contained `QuizEditorModal`/`VideoActivityEditorModal`, `AssignClassPicker`, `QuizAssignmentSettingsModal`, the `EmbedWidget` Google-Docs iframe, and the existing `isAdmin()` rule helper. It preserves the existing shared-doc / no-fan-out cost posture (school-district budgets).

**Tech Stack:** React 19 + TypeScript + Vite (flat structure, `@/` = repo root), Tailwind, Firestore (+ security rules + `@firebase/rules-unit-testing`), react-i18next, Vitest + Testing Library, lucide-react. Package manager: **pnpm**. Validate with `pnpm run validate`.

---

## Single-PR + Parallelization Model

**Branch:** create `dev-paul-plc-redesign` off `dev-paul`. All commits land here; one PR into `dev-paul` at the end (regular merge to main later — never squash dev-paul→main).

### Dependency graph

```
Wave 1 (sequential, ONE agent) ── scaffolding commit
        │  (lands shared-file edits: types.ts, firestore.rules, locales/en.json,
        │   PlcDashboard rail shell, empty body stub components, new hooks' empty shells)
        ▼
Wave 2 (FIVE agents IN PARALLEL) ── each owns disjoint new files, one+ commit each
        ├─ Stream A: Home landing page
        ├─ Stream B: In-PLC authoring + full assignment config
        ├─ Stream C: Filterable Shared Data view
        ├─ Stream D: Docs-as-notes (Google Docs embed)
        └─ Stream E: Admin curate/push  (+ PLC Resources inbox body)
        ▼
Wave 3 (sequential, ONE agent) ── integration commit
        (swap stubs → real bodies in the rail, delete bento/grid + usePlcOverviewLayout,
         full `pnpm run validate`, manual-verification checklist)
```

### Why this avoids merge conflicts inside one branch

The only files multiple streams would otherwise touch are **`types.ts`, `firestore.rules`, `locales/en.json`, and `PlcDashboard.tsx`**. Wave 1 makes _all_ edits to those four files up front (every type, every rule, every i18n key, and the rail with stub imports). Wave 2 streams then create/modify **only their own new files** and **their own new hooks** — no shared-file edits. Wave 3 re-touches `PlcDashboard.tsx` once (stub→real swap) and deletes retired files. Because waves are sequential and intra-wave file ownership is disjoint, there are no overlapping edits.

### File ownership per stream (Wave 2)

- **Stream A (Home):** `components/plc/home/*`
- **Stream B (Authoring/Assignment):** `components/plc/authoring/*`, `components/plc/assignments/PlcAssignmentConfigModal.tsx`, reuse of editors
- **Stream C (Shared Data):** `components/plc/sharedData/*`
- **Stream D (Docs):** `components/plc/docs/*`, `hooks/usePlcDocs.ts`
- **Stream E (Admin Push):** `components/admin/PlcResourcesManager/*`, `components/plc/resources/*`, `hooks/usePlcResources.ts`

---

## File Structure Map

**New directories/files:**

```
components/plc/
  PlcDashboardRail.tsx                 (Wave 1)  left-rail nav, mirrors SettingsModal rail
  sections.ts                          (Wave 1)  PlcSectionId union + SECTIONS config (single source of truth)
  home/
    PlcHome.tsx                        (A)       clean designed landing page (replaces bento)
    cards/AttentionCard.tsx            (A)       "needs attention": active assignments + recent results
    cards/QuickCreateCard.tsx          (A)       create quiz / VA / assignment / add doc
    cards/RecentDocsCard.tsx           (A)
    cards/MembersStripCard.tsx         (A)
  authoring/
    PlcAuthorQuizModal.tsx             (B)       mounts QuizEditorModal in-PLC, saves, hands to config
    PlcAuthorVideoActivityModal.tsx    (B)       mounts VideoActivityEditorModal in-PLC
  assignments/
    PlcAssignmentsSection.tsx          (B)       replaces header CTAs flow; create-from-scratch + assign in-tab
    PlcAssignmentConfigModal.tsx       (B)       in-PLC full settings + class picker (no board hand-off)
  sharedData/
    PlcSharedDataBody.tsx              (C)       filterable results view
    PlcSharedDataFilters.tsx           (C)       filter bar (type / assignment / teacher / date / class)
    sharedDataSelectors.ts             (C)       pure filter+group helpers (heavily unit-tested)
  docs/
    PlcDocsBody.tsx                    (D)       Google-Docs embed surface (replaces plain-text notes)
    PlcDocPicker.tsx                   (D)       add/rename/remove doc links
  resources/
    PlcResourcesBody.tsx               (E)       PLC-side "pushed resources" inbox
hooks/
  usePlcDocs.ts                        (D)
  usePlcResources.ts                   (E)
components/admin/PlcResourcesManager/
  PlcResourcesManager.tsx              (E)       admin curate/push UI (new AdminSettings tab)
  PlcTargetPicker.tsx                  (E)       all-PLCs vs selected-PLCs multi-select
```

**Modified files:**

```
types.ts                  (Wave 1)  + PlcDoc, PlcResource, PlcResourceKind, PlcResourceScope, dueAt fields
firestore.rules           (Wave 1)  + /plcs/{id}/docs, + /plc_resources, + admin read on /plcs
locales/en.json           (Wave 1)  + plcDashboard.* keys for every new section/control
components/plc/PlcDashboard.tsx  (Wave 1 stub wiring; Wave 3 real wiring) rail instead of header pills
context/... (none)         —         no context changes
components/admin/AdminSettings.tsx  (E)  + "PLC Resources" tab entry
```

**Deleted files (Wave 3, after Home replaces them):**

```
components/plc/overview/PlcBentoGrid.tsx, PlcBentoTile.tsx, bentoSizes.ts, tileRegistry.tsx
components/plc/grid/PlcGridLayout.tsx, PlcGridTile.tsx, tileGridMath.ts, useTileResize.ts
components/plc/tabs/PlcOverviewTab.tsx
hooks/usePlcOverviewLayout.ts
components/plc/overview/tiles/*   (after salvaging reusable content into home/cards)
tests/hooks/usePlcOverviewLayout.test.ts, tests/components/plc/PlcGridTile.test.tsx, tests/utils/plcLayoutMigration.test.ts
```

> Salvage note for Stream A: `ActiveAssignmentsTile` uses `usePlcAssignmentIndex(plc.id)` → `{ entries }` filtered to `status==='active'||'paused'`; `CompletedAssignmentsTile` delegates to `<PlcAnalyticsBody plc compact previewLimit={4} />`; `QuizLibraryTile` uses `usePlcQuizzes(plc.id)` → `{ quizzes }`. Reuse those data sources in Home cards; do not reuse the drag/grid wrappers.

---

## Shared Additions (all landed in Wave 1)

### types.ts additions

```typescript
// --- PLC shared Google Docs (Stream D) ---
export interface PlcDoc {
  id: string;
  /** Human label for the doc tab/list row. */
  title: string;
  /** Raw Google Docs/Drive URL as pasted by a member. Rendered via convertToEmbedUrl(). */
  url: string;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
}

// --- Admin-curated resources pushed to PLCs (Stream E) ---
export type PlcResourceKind =
  | 'quiz'
  | 'video-activity'
  | 'assignment'
  | 'doc'
  | 'board';

export type PlcResourceScope = 'all' | 'selected';

export interface PlcResource {
  id: string;
  kind: PlcResourceKind;
  /** Display title shown in the admin list + the PLC inbox. */
  title: string;
  /** Optional admin note describing the resource / how to use it. */
  description: string;
  /**
   * Pointer to the canonical source. For quiz/video-activity/assignment this is
   * the `/synced_*` group id; for 'doc' this is the Google Docs URL; for 'board'
   * the `/shared_boards` shareId. Importers resolve per-kind.
   */
  refId: string;
  scope: PlcResourceScope;
  /** Target PLC ids when scope==='selected'. Empty when scope==='all'. */
  plcIds: string[];
  createdByAdminUid: string;
  createdByAdminEmail: string;
  createdAt: number;
  updatedAt: number;
}
```

Also add an optional **due date** to the two assignment-settings types (Stream B surfaces it; absent = no due date, fully backward-compatible):

```typescript
// in QuizAssignmentSettings (types.ts ~3180): add
  /** Optional due date (ms epoch). Absent / null = no due date. PLC-config + board both honor it. */
  dueAt?: number | null;

// in VideoActivitySessionOptions (types.ts ~3606): add
  /** Optional due date (ms epoch). Absent / null = no due date. */
  dueAt?: number | null;
```

> The Firestore rule for `assignments` templates pins `sessionOptions is map` (open shape) and does not enumerate `QuizSessionOptions` keys, so adding `dueAt` requires **no rule change**. `QuizAssignmentSettings` is stored on the personal `quiz_assignments` doc whose rule does not key-lock settings — confirm during Stream B Task B0 and adjust only if a `hasOnly` lock exists there.

### firestore.rules additions

**(1) Allow admins to read `/plcs` (so the admin push UI can list PLCs to target).** Modify the existing `/plcs/{plcId}` read rule (firestore.rules:1339-1340):

```javascript
      // Members can read; admins can also read so the admin PLC-resource
      // push UI can enumerate PLCs to target. Non-members get nothing.
      allow read: if request.auth != null
        && (request.auth.uid in resource.data.memberUids || isAdmin());
```

**(2) New `/plcs/{plcId}/docs/{docId}` block** (insert after the `/notes` block, before the closing `}` of `/plcs/{plcId}`). Mirrors the notes block's membership posture:

```javascript
      // PLC shared Google Docs (Stream D). Lightweight pointers — the doc
      // content lives in Google, not here. Any current member can CRUD.
      match /docs/{docId} {
        allow read: if request.auth != null
          && request.auth.uid in get(
               /databases/$(database)/documents/plcs/$(plcId)
             ).data.memberUids;

        allow create: if request.auth != null
          && request.auth.uid in get(
               /databases/$(database)/documents/plcs/$(plcId)
             ).data.memberUids
          && request.resource.data.keys().hasOnly([
               'id', 'title', 'url',
               'createdBy', 'createdByName', 'createdAt', 'updatedAt'
             ])
          && request.resource.data.id == docId
          && request.resource.data.createdBy == request.auth.uid
          && request.resource.data.title is string
          && request.resource.data.url is string
          && request.resource.data.createdByName is string
          && request.resource.data.createdAt is int
          && request.resource.data.updatedAt is int;

        // Any member can rename / re-point / bump updatedAt. createdBy/createdAt/id immutable.
        allow update: if request.auth != null
          && request.auth.uid in get(
               /databases/$(database)/documents/plcs/$(plcId)
             ).data.memberUids
          && request.resource.data.keys().hasOnly([
               'id', 'title', 'url',
               'createdBy', 'createdByName', 'createdAt', 'updatedAt'
             ])
          && request.resource.data.id == resource.data.id
          && request.resource.data.createdBy == resource.data.createdBy
          && request.resource.data.createdAt == resource.data.createdAt
          && request.resource.data.title is string
          && request.resource.data.url is string
          && request.resource.data.updatedAt is int;

        allow delete: if request.auth != null
          && request.auth.uid in get(
               /databases/$(database)/documents/plcs/$(plcId)
             ).data.memberUids;
      }
```

**(3) New top-level `/plc_resources/{resourceId}` block** (insert near `dashboard_templates`, ~firestore.rules:2355). Read posture matches `dashboard_templates`/`instructional_routines` (any authenticated user reads; admins write). The `plcIds`/`scope` targeting is a UX convenience and client-filtered — these are curated content pointers, same sensitivity tier as templates:

```javascript
    // Admin-curated resources pushed to PLCs. Any authenticated teacher can
    // read (matches dashboard_templates / instructional_routines); the PLC
    // client filters by scope + plcIds. Only admins write. Single shared doc
    // per resource — no per-PLC fan-out (cost posture).
    match /plc_resources/{resourceId} {
      allow read: if request.auth != null;
      allow create, update: if isAdmin()
        && request.resource.data.id == resourceId
        && request.resource.data.kind in
             ['quiz', 'video-activity', 'assignment', 'doc', 'board']
        && request.resource.data.scope in ['all', 'selected']
        && request.resource.data.plcIds is list
        && request.resource.data.title is string
        && request.resource.data.refId is string
        && request.resource.data.createdByAdminUid == request.auth.uid;
      allow delete: if isAdmin();
    }
```

### locales/en.json additions

Add a `plcDashboard` block extension with keys for every new section + control. Pattern: `t('plcDashboard.x', { defaultValue: '...' })`. Because the i18n test only validates config (not key presence) and all call-sites pass `defaultValue`, missing keys never break tests — but add English keys for the primary strings anyway (sections, filter labels, admin-push labels). Concrete keys are listed inline in each task's code.

---

## WAVE 1 — Scaffolding (sequential, one agent, one commit)

### Task 1: PLC section config + rail component

**Files:**

- Create: `components/plc/sections.ts`
- Create: `components/plc/PlcDashboardRail.tsx`
- Test: `tests/components/plc/PlcDashboardRail.test.tsx`

- [ ] **Step 1: Write `sections.ts` (single source of truth for nav)**

```typescript
// components/plc/sections.ts
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  Film,
  BarChart3,
  FileText,
  ListChecks,
  Users2,
  Sparkles,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react';
import { PlcFeatureSettings } from '@/types';

export type PlcSectionId =
  | 'home'
  | 'quizzes'
  | 'videoActivities'
  | 'assignments'
  | 'sharedData'
  | 'docs'
  | 'todos'
  | 'members'
  | 'resources'
  | 'settings';

export interface PlcSectionDef {
  id: PlcSectionId;
  icon: LucideIcon;
  labelKey: string;
  labelDefault: string;
  /** Feature flag gating this section; absent = always shown. */
  feature?: keyof PlcFeatureSettings;
}

export const PLC_SECTIONS: readonly PlcSectionDef[] = [
  {
    id: 'home',
    icon: LayoutDashboard,
    labelKey: 'plcDashboard.tabs.home',
    labelDefault: 'Home',
  },
  {
    id: 'quizzes',
    icon: BookOpen,
    labelKey: 'plcDashboard.tabs.quizzes',
    labelDefault: 'Quizzes',
    feature: 'quizzes',
  },
  {
    id: 'videoActivities',
    icon: Film,
    labelKey: 'plcDashboard.tabs.videoActivities',
    labelDefault: 'Video Activities',
    feature: 'videoActivities',
  },
  {
    id: 'assignments',
    icon: ClipboardList,
    labelKey: 'plcDashboard.tabs.assignments',
    labelDefault: 'Assignments',
    feature: 'assignments',
  },
  {
    id: 'sharedData',
    icon: BarChart3,
    labelKey: 'plcDashboard.tabs.sharedData',
    labelDefault: 'Shared Data',
  },
  {
    id: 'docs',
    icon: FileText,
    labelKey: 'plcDashboard.tabs.docs',
    labelDefault: 'Docs',
    feature: 'notes',
  },
  {
    id: 'todos',
    icon: ListChecks,
    labelKey: 'plcDashboard.tabs.todos',
    labelDefault: 'To-Dos',
    feature: 'todos',
  },
  {
    id: 'members',
    icon: Users2,
    labelKey: 'plcDashboard.tabs.members',
    labelDefault: 'Members',
  },
  {
    id: 'resources',
    icon: Sparkles,
    labelKey: 'plcDashboard.tabs.resources',
    labelDefault: 'Resources',
  },
  {
    id: 'settings',
    icon: SettingsIcon,
    labelKey: 'plcDashboard.tabs.settings',
    labelDefault: 'Settings',
  },
] as const;
```

- [ ] **Step 2: Write the failing rail test**

```tsx
// tests/components/plc/PlcDashboardRail.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PlcDashboardRail } from '@/components/plc/PlcDashboardRail';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

describe('PlcDashboardRail', () => {
  it('renders a tab per visible section and marks the active one', () => {
    const onSelect = vi.fn();
    render(
      <PlcDashboardRail
        activeSection="home"
        onSelect={onSelect}
        visibleSections={[
          { id: 'home', label: 'Home', icon: () => null },
          { id: 'quizzes', label: 'Quizzes', icon: () => null },
        ]}
      />
    );
    const home = screen.getByRole('tab', { name: 'Home' });
    expect(home).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Quizzes' }));
    expect(onSelect).toHaveBeenCalledWith('quizzes');
  });
});
```

- [ ] **Step 3: Run it, expect FAIL**

Run: `pnpm exec vitest run tests/components/plc/PlcDashboardRail.test.tsx`
Expected: FAIL — `PlcDashboardRail` not found.

- [ ] **Step 4: Implement `PlcDashboardRail.tsx`**

Contract (mirror `components/settingsModal/SettingsModal.tsx` `RailTab` exactly — light rail recolored for PLC; vertical `role="tablist"`, roving tabindex `aria-selected`, icon+label at `lg`, icon-only at `md`):

```tsx
// components/plc/PlcDashboardRail.tsx
import React from 'react';
import type { PlcSectionId } from './sections';

export interface PlcRailItem {
  id: PlcSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}
interface PlcDashboardRailProps {
  activeSection: PlcSectionId;
  onSelect: (id: PlcSectionId) => void;
  visibleSections: PlcRailItem[];
}
export const PlcDashboardRail: React.FC<PlcDashboardRailProps> = ({
  activeSection,
  onSelect,
  visibleSections,
}) => (
  <nav
    role="tablist"
    aria-orientation="vertical"
    className="hidden md:flex flex-col md:w-[76px] lg:w-56 shrink-0 bg-slate-50 border-r border-slate-200 overflow-y-auto p-2 gap-0.5"
  >
    {visibleSections.map((s) => {
      const active = s.id === activeSection;
      return (
        <button
          key={s.id}
          id={`plc-tab-${s.id}`}
          role="tab"
          aria-selected={active}
          aria-controls={`plc-panel-${s.id}`}
          tabIndex={active ? 0 : -1}
          onClick={() => onSelect(s.id)}
          title={s.label}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors justify-center lg:justify-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 ${
            active
              ? 'bg-brand-blue-primary text-white font-semibold shadow-sm'
              : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
          }`}
        >
          <s.icon className="w-5 h-5 shrink-0" />
          <span className="hidden lg:inline truncate">{s.label}</span>
        </button>
      );
    })}
  </nav>
);
```

- [ ] **Step 5: Run test, expect PASS**

Run: `pnpm exec vitest run tests/components/plc/PlcDashboardRail.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/plc/sections.ts components/plc/PlcDashboardRail.tsx tests/components/plc/PlcDashboardRail.test.tsx
git commit -m "feat(plc): add section config + left-rail nav component"
```

### Task 2: types.ts — PlcDoc, PlcResource, dueAt

**Files:** Modify `types.ts`

- [ ] **Step 1:** Add the `PlcDoc`, `PlcResourceKind`, `PlcResourceScope`, `PlcResource` blocks (verbatim from "Shared Additions") near the other PLC types (~types.ts:530).
- [ ] **Step 2:** Add `dueAt?: number | null` to `QuizAssignmentSettings` (~3180) and `VideoActivitySessionOptions` (~3606) with the comments shown above.
- [ ] **Step 3:** Run `pnpm run type-check`. Expected: PASS (additive only).
- [ ] **Step 4: Commit**

```bash
git add types.ts
git commit -m "feat(plc): add PlcDoc, PlcResource types and assignment dueAt field"
```

### Task 3: firestore.rules — docs, plc_resources, admin read on /plcs

**Files:** Modify `firestore.rules`; Test: `tests/rules/plcDocs.test.ts`, `tests/rules/plcResources.test.ts`

- [ ] **Step 1: Write failing rules tests** (mirror `tests/rules/plcOverviewAndContent.test.ts` harness — `@firebase/rules-unit-testing`, seed a PLC doc with `memberUids`, assert member CRUD allowed / non-member denied for `/plcs/{id}/docs`; for `/plc_resources` assert admin write allowed, non-admin write denied, any-auth read allowed).

```typescript
// tests/rules/plcDocs.test.ts  (skeleton — fill seed helpers from plcOverviewAndContent.test.ts)
import { describe, it, beforeAll, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
// ... reuse the test env + seedPlc(memberUids) helpers from plcOverviewAndContent.test.ts
describe('/plcs/{id}/docs', () => {
  it('member can create a doc with the locked schema', async () => {
    // member context createDoc(`plcs/p1/docs/d1`, { id:'d1', title:'Plan', url:'https://docs.google.com/...', createdBy:<uid>, createdByName:'A', createdAt:1, updatedAt:1 })
    // await assertSucceeds(...)
  });
  it('non-member cannot read docs', async () => {
    /* assertFails read */
  });
});
```

```typescript
// tests/rules/plcResources.test.ts
describe('/plc_resources', () => {
  it('admin can create a resource', async () => {
    /* assertSucceeds with isAdmin context */
  });
  it('non-admin cannot create', async () => {
    /* assertFails */
  });
  it('any authenticated user can read', async () => {
    /* assertSucceeds read */
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm exec vitest run tests/rules/plcDocs.test.ts tests/rules/plcResources.test.ts`
- [ ] **Step 3: Edit `firestore.rules`** — apply the three changes from "Shared Additions" (admin read on `/plcs`, `/docs` block, `/plc_resources` block).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/rules/plcDocs.test.ts tests/rules/plcResources.test.ts
git commit -m "feat(plc): firestore rules for shared docs, admin-pushed resources, admin PLC read"
```

### Task 4: Convert PlcDashboard shell to the rail + section switch (with STUB bodies)

**Files:** Modify `components/plc/PlcDashboard.tsx`; Create stub components so imports compile.

- [ ] **Step 1: Create empty stub bodies** (each renders a titled placeholder; replaced in Wave 2/3). One file each:
      `components/plc/home/PlcHome.tsx`, `components/plc/assignments/PlcAssignmentsSection.tsx`, `components/plc/sharedData/PlcSharedDataBody.tsx`, `components/plc/docs/PlcDocsBody.tsx`, `components/plc/resources/PlcResourcesBody.tsx`. Stub shape:

```tsx
// components/plc/home/PlcHome.tsx  (STUB — Stream A replaces)
import React from 'react';
import { Plc } from '@/types';
import type { PlcSectionId } from '../sections';
interface PlcHomeProps {
  plc: Plc;
  onNavigate: (id: PlcSectionId) => void;
}
export const PlcHome: React.FC<PlcHomeProps> = () => (
  <div data-testid="plc-home-stub" />
);
```

(Repeat with the matching prop contract for each — see each stream's task for the final prop list; stubs must declare the SAME props so Wave 2 only changes internals.)

- [ ] **Step 2: Rewrite `PlcDashboard.tsx` body** to: keep the `fixed inset-0 z-modal` dialog + gradient header + Escape handling, **remove the header tab pills**, render `<PlcDashboardRail>` on the left (md+) and a mobile drill-in list (reuse the existing mobile-menu block), and switch section content via a `renderSection(id)` function. Map: `home`→`PlcHome` (existing `quizzes`→`PlcQuizLibraryTab`, `videoActivities`→`PlcVideoActivitiesTab`, `todos`→`PlcTodosTab`, `members`→`MembersBody`, `settings`→`PlcSettingsTab` stay), `assignments`→`PlcAssignmentsSection` (stub), `sharedData`→`PlcSharedDataBody` (stub), `docs`→`PlcDocsBody` (stub), `resources`→`PlcResourcesBody` (stub). Visible-section filtering reuses `getPlcFeatures(plc)` + `PLC_SECTIONS`. Keep the "active section hidden → fall back to home" adjust-state-during-render guard.

- [ ] **Step 3:** Run `pnpm run type-check` + existing PLC tests: `pnpm exec vitest run tests/components/plc`. Expected: PASS (stubs satisfy imports).
- [ ] **Step 4: Add i18n keys** to `locales/en.json` for `plcDashboard.tabs.home/sharedData/docs/resources` (others already exist).
- [ ] **Step 5: Commit**

```bash
git add components/plc/PlcDashboard.tsx components/plc/home components/plc/assignments components/plc/sharedData components/plc/docs components/plc/resources locales/en.json
git commit -m "feat(plc): replace header tab pills with left-rail nav + section stubs"
```

- [ ] **Step 6: Push branch, open Draft PR** (so CI runs on every wave-2 push):

```bash
git push -u origin dev-paul-plc-redesign
gh pr create --draft --base dev-paul --title "PLC collaborative space redesign" --body "Tracks docs/superpowers/plans/2026-05-20-plc-collaborative-redesign.md"
```

---

## WAVE 2 — Parallel work-streams (five agents at once)

> Each stream branches its work mentally off the Wave-1 HEAD, edits ONLY its owned files, commits independently, and pushes. No stream edits `types.ts`, `firestore.rules`, `locales/en.json` (except appending its own keys at the very end of the json object — coordinate by each stream appending to a distinct nested object `plcDashboard.<sectionKey>` to avoid line overlap), or `PlcDashboard.tsx`.

### Stream A — Home landing page

**Files:** `components/plc/home/PlcHome.tsx` (replace stub) + `components/plc/home/cards/*`; Test: `tests/components/plc/PlcHome.test.tsx`

- [ ] **A1 — Write failing test:** Home renders an "attention" region listing active assignments and a quick-create region; clicking "Create quiz" calls `onNavigate('assignments')` (or opens authoring once Stream B lands — for the test, assert `onNavigate` wiring). Mock `usePlcAssignmentIndex` → `{ entries:[{id,kind:'quiz',title:'Unit 3',status:'active',ownerName:'Mr A',createdAt:1}], loading:false }`, `usePlcContributions` → `{ contributions:[], loading:false }`, `usePlcQuizzes` → `{ quizzes:[], loading:false }`, `usePlcDocs` → `{ docs:[], loading:false }`.

```tsx
// tests/components/plc/PlcHome.test.tsx  (key assertions)
expect(screen.getByText('Unit 3')).toBeInTheDocument(); // active assignment surfaced
fireEvent.click(screen.getByRole('button', { name: /create quiz/i }));
expect(onNavigate).toHaveBeenCalledWith('assignments');
```

- [ ] **A2 — Run, expect FAIL.**
- [ ] **A3 — Implement `PlcHome` + cards.** Props: `{ plc: Plc; onNavigate: (id: PlcSectionId) => void }`. Layout = a calm, responsive CSS grid (NOT draggable): `AttentionCard` (active assignments via `usePlcAssignmentIndex` filtered `status==='active'||'paused'` + recent results count via `usePlcContributions`), `QuickCreateCard` (buttons → `onNavigate`), `RecentDocsCard` (`usePlcDocs`, last 3), `MembersStripCard` (avatars from `plc.memberUids`/`memberEmails`). Follow brand: glassmorphism, type hierarchy, `cqmin`-free (this is modal chrome, normal Tailwind sizing fine). Reuse salvaged content from `overview/tiles/ActiveAssignmentsTile.tsx` rendering logic.
- [ ] **A4 — Run, expect PASS.**
- [ ] **A5 — Commit:** `git commit -m "feat(plc): clean designed Home landing page (replaces bento overview)"`

### Stream B — In-PLC authoring + full assignment configuration

**Files:** `components/plc/authoring/PlcAuthorQuizModal.tsx`, `components/plc/authoring/PlcAuthorVideoActivityModal.tsx`, `components/plc/assignments/PlcAssignmentsSection.tsx` (replace stub), `components/plc/assignments/PlcAssignmentConfigModal.tsx`; Tests under `tests/components/plc/`.

Reuse contracts (verbatim signatures gathered):

- `QuizEditorModal` props: `{ isOpen, quiz: QuizData|null, onClose, onSave: (q:QuizData)=>Promise<void>, folders?, folderId?, onFolderChange? }`. New quiz seed = `{ id: crypto.randomUUID(), title:'', questions:[], createdAt:now, updatedAt:now }`.
- Save via `useQuiz(userId).saveQuiz(quiz, existingDriveFileId?) => Promise<QuizMetadata>`.
- `VideoActivityEditorModal` props: `{ isOpen, activity: VideoActivityData|null, onClose, onSave, aiEnabled?, isAdmin?, folders?, folderId?, onFolderChange? }`; save via `useVideoActivity(...).saveActivity(activity, driveFileId?)`.
- Assignment creation: `useQuizAssignments(...).createAssignment(quizRef: AssignmentQuizRef, settings: QuizAssignmentSettings, options?: CreateAssignmentOptions)` where `AssignmentQuizRef = { id, title, driveFileId, questions }`. Full settings editor: `QuizAssignmentSettingsModal` props `{ assignment: QuizAssignment, rosters: ClassRoster[], onClose, onSave:(patch:Partial<QuizAssignmentSettings>)=>..., defaultTeacherName? }`. Class picker: `AssignClassPicker` props `{ rosters, value:{rosterIds:string[]}, onChange, disabled? }` + `makeEmptyPickerValue()`.
- PLC template/sheet wiring (reuse existing): `createSyncedQuizGroup({ groupId, uid, title, questions, plcId })`, `writePlcAssignmentTemplate(plcId, uid, ShareAssignmentTemplateInput)`, `QuizDriveService.createPlcSheetAndShare({ plcName, quizTitle, memberEmailsToShareWith })`. VA: `createSyncedVideoActivityGroup({ groupId, uid, title, youtubeUrl, questions, plcId })` (+ NEW VA template writer — see B5).

- [ ] **B0 — Verify settings rule:** read the `quiz_assignments` rule in `firestore.rules`; confirm it does not `hasOnly`-lock settings keys (so `dueAt` is accepted). If it does, add `dueAt` to the allowed set in a tiny rules edit + a rules test. (This is the only case where Stream B may touch `firestore.rules` — coordinate: if so, do it as the FIRST Stream B commit before any other stream pushes a rules change. If no lock exists, skip.)
- [ ] **B1 — Authoring modal test (quiz):** mounting `PlcAuthorQuizModal` with `isOpen` renders `QuizEditorModal`; on its `onSave`, asserts `saveQuiz` called then the config step opens. Mock `useQuiz`, `QuizEditorModal` (render a button that calls `onSave(fakeQuiz)`).
- [ ] **B2 — Run FAIL → implement `PlcAuthorQuizModal`:** wraps `QuizEditorModal`; on save → `saveQuiz` → build `AssignmentQuizRef` from the saved `QuizMetadata` + quiz questions → open `PlcAssignmentConfigModal`. → Run PASS.
- [ ] **B3 — `PlcAssignmentConfigModal` test + impl:** renders mode selector + `AssignmentSettingsToggleGroup` + `AssignClassPicker` + a **due-date** input; on confirm calls `createAssignment(quizRef, settings, { rosterIds, mode, ... })` then `writePlcAssignmentTemplate(...)` and `createSyncedQuizGroup(...)` with `plcId`. NO board hand-off, NO `setPendingAssignmentEdit`. Test asserts `createAssignment` receives `settings.plc` set + `dueAt` when entered + rosterIds forwarded.
- [ ] **B4 — `PlcAuthorVideoActivityModal`** mirror of B2 for VA (`VideoActivityEditorModal` + `saveActivity` + `createAssignment` from `useVideoActivityAssignments` positional args).
- [ ] **B5 — VA PLC template writer (gap fill):** add `writePlcVideoActivityAssignmentTemplate` alongside the quiz one (in `hooks/usePlcAssignments.ts` or a sibling) so VA assignments surface in the Assignments library like quizzes do. Unit-test it writes the locked-shape template doc. _(If a VA template subcollection/rule does not exist, scope this to writing a `PlcVideoActivityEntry` via existing `writePlcVideoActivityEntry` instead and note it — do not invent a new ruled collection in this stream; flag for Wave 3.)_
- [ ] **B6 — `PlcAssignmentsSection`** (replace stub): a Library / In-Progress / Completed view (reuse `PlcAssignmentsLibrarySubTab`, `PlcAssignmentsInProgressSubTab`, `PlcAssignmentsCompletedSubTab` bodies) PLUS prominent **"Create Quiz Assignment"** / **"Create Video Assignment"** buttons that open the authoring modals (B2/B4) — replacing the old pick-from-library-only CTAs. Props: `{ plc: Plc }` (drop the `onCloseDashboard` board hand-off prop).
- [ ] **B7 — Commit(s):**

```bash
git commit -m "feat(plc): author quizzes/VAs and configure assignments fully in-PLC (no board)"
```

### Stream C — Filterable Shared Data

**Files:** `components/plc/sharedData/PlcSharedDataBody.tsx` (replace stub), `PlcSharedDataFilters.tsx`, `sharedDataSelectors.ts`; Tests: `tests/components/plc/sharedDataSelectors.test.ts`, `tests/components/plc/PlcSharedDataBody.test.tsx`.

Data sources (existing, no new fields needed): `usePlcAssignmentIndex(plc.id)` → `{ entries: PlcAssignmentIndexEntry[] }` (has `kind`, `ownerUid`, `ownerName`, `title`, `status`, `createdAt`) for the assignment list + by-type/by-teacher/by-date/by-assignment filtering; `usePlcContributions(plc.id)` → `{ contributions: PlcContribution[] }` for results, where `contribution.responses[].classPeriod` powers by-class filtering and `responses[].scorePercent` powers aggregates.

- [ ] **C1 — Selectors test (pure functions):** write `tests/components/plc/sharedDataSelectors.test.ts` covering `filterEntries(entries, filters)` (type/teacher/date/assignment) and `filterContributionResponses(contributions, { classPeriod })` and `summarize(contributions)` (avg score, # teachers, # students). Real fixtures.
- [ ] **C2 — Run FAIL → implement `sharedDataSelectors.ts`** (pure, no React). → PASS.
- [ ] **C3 — `PlcSharedDataFilters` test + impl:** controlled filter bar — `type: 'all'|'quiz'|'video-activity'`, `teacherUid: string|'all'`, `assignmentId: string|'all'`, `classPeriod: string|'all'`, `dateRange`. Emits an `onChange(filters)`.
- [ ] **C4 — `PlcSharedDataBody` test + impl:** wires the two hooks + selectors + filter bar; renders grouped result cards (reuse `PlcAnalyticsBody`'s per-quiz card / `PlcAggregateSection` drilldown where possible). Empty/loading/error states. Props: `{ plc: Plc }`. Test: with two entries (1 quiz, 1 VA) and a `type='quiz'` filter, only the quiz card shows; teacher filter narrows; class-period filter narrows the response counts.
- [ ] **C5 — Commit:** `git commit -m "feat(plc): filterable shared-data view (type/assignment/teacher/class/date)"`

### Stream D — Docs-as-notes (Google Docs embed)

**Files:** `hooks/usePlcDocs.ts`, `components/plc/docs/PlcDocsBody.tsx` (replace stub), `components/plc/docs/PlcDocPicker.tsx`; Tests: `tests/hooks/usePlcDocs.test.ts`, `tests/components/plc/PlcDocsBody.test.tsx`.

Reuse: `convertToEmbedUrl(url)` + `ensureProtocol(url)` from `utils/urlHelpers.ts` (already rewrites `docs.google.com/document/...` to embeddable `/edit?rm=minimal`), and the EmbedWidget iframe pattern (sandbox `allow-scripts allow-forms allow-popups allow-same-origin` for `docs.google.com`, `allow="...; clipboard-write; ..."`).

- [ ] **D1 — `usePlcDocs` hook test:** mirror `tests/hooks/usePlcNotes.test.ts`. Asserts `createDoc({title,url})` writes `/plcs/{id}/docs/{uuid}` with the locked schema (`id,title,url,createdBy,createdByName,createdAt,updatedAt`), `updateDoc`, `deleteDoc`, and snapshot mapping. Hook signature: `usePlcDocs(plcId: string | null): { docs: PlcDoc[]; loading: boolean; error: Error|null; createDoc: (i:{title:string;url:string})=>Promise<string>; updateDoc:(id:string,patch:{title?:string;url?:string})=>Promise<void>; deleteDoc:(id:string)=>Promise<void> }`.
- [ ] **D2 — Run FAIL → implement `usePlcDocs.ts`** (model on `usePlcNotes.ts`: onSnapshot list, debounced not needed, stamp `createdBy`/`createdByName` from `useAuth().user`). → PASS.
- [ ] **D3 — `PlcDocsBody` test + impl:** left list of docs (`PlcDocPicker` to add/rename/remove) + right pane rendering the selected doc via an `<iframe src={convertToEmbedUrl(ensureProtocol(doc.url))} sandbox="allow-scripts allow-forms allow-popups allow-same-origin" allow="clipboard-write; ..." />`. Empty state CTA "Add a Google Doc". Validate that pasted URLs containing `docs.google.com` are accepted; warn (no crash) otherwise. Test: with one doc, the iframe `src` is the converted embed URL; "Add" calls `createDoc`.
- [ ] **D4 — Commit:** `git commit -m "feat(plc): Google Docs embed as the shared-notes surface"`

### Stream E — Admin curate & push to PLCs

**Files:** `hooks/usePlcResources.ts`, `components/admin/PlcResourcesManager/PlcResourcesManager.tsx`, `components/admin/PlcResourcesManager/PlcTargetPicker.tsx`, `components/plc/resources/PlcResourcesBody.tsx` (replace stub); Modify `components/admin/AdminSettings.tsx` (add tab — this file is owned solely by Stream E); Tests under `tests/components/`.

- [ ] **E1 — `usePlcResources` hook test + impl.** Two read modes:
  - Admin mode `usePlcResources({ asAdmin: true })` → lists ALL `/plc_resources` for curation + `createResource(input)`, `updateResource`, `deleteResource` (writes gated by rules to admins).
  - PLC mode `usePlcResources({ plcId })` → merges two listeners: `where('scope','==','all')` and `where('plcIds','array-contains', plcId)`, de-duped by id. Returns `{ resources: PlcResource[]; loading; error }`.
    Test the PLC-mode merge/de-dupe with a fake Firestore (mirror an existing two-query hook test) and the admin-mode create payload shape (`createdByAdminUid` = current uid, `scope`/`plcIds` consistent).
- [ ] **E2 — `PlcTargetPicker` test + impl:** radio `All PLCs` vs `Selected PLCs` + a multi-select list of PLCs (from `usePlcs({ enabled:true })` — admins can now read `/plcs` per Wave-1 rule change). Emits `{ scope, plcIds }`.
- [ ] **E3 — `PlcResourcesManager` test + impl:** admin form to create a resource — choose `kind` (quiz / video-activity / assignment / doc / board), pick the source (for quiz/VA/assignment: a synced-group/template picker; for doc: a URL field; for board: a shared-board picker), title + description, `PlcTargetPicker`, submit → `createResource`. Below: list of existing resources with edit/delete. Test asserts a submit calls `createResource` with the assembled `PlcResource` (sans server fields).
- [ ] **E4 — Wire into AdminSettings:** add a `PLC Resources` entry to `components/admin/AdminSettings.tsx`'s rail/section switch rendering `<PlcResourcesManager />`. (Follow the existing AdminSettings tab pattern.) Add an admin-only test that the tab renders.
- [ ] **E5 — `PlcResourcesBody` (PLC inbox) test + impl** (replace stub): props `{ plc: Plc }`; `usePlcResources({ plcId: plc.id })`; renders pushed resources grouped by kind with a per-row **"Use in this PLC"** action that routes per-kind to the existing import path (quiz → `shareQuizWithPlc`/`writePlcQuizEntry` flow; doc → `usePlcDocs().createDoc`; assignment → existing `PlcAssignmentImportModal`; board → existing shared-board import; VA → `writePlcVideoActivityEntry`). For v1, "Use" may simply deep-link to the relevant section if a one-click import is heavy — but prefer one-click where the existing helper exists. Test: a `kind:'doc'` resource's "Use" calls `createDoc({title,url:refId})`.
- [ ] **E6 — Commit(s):**

```bash
git commit -m "feat(plc): admin curate + push resources/assignments to specific or all PLCs"
```

---

## WAVE 3 — Integration (sequential, one agent, one commit group)

### Task W3-1: Swap stubs → real bodies in the rail

- [ ] Confirm all five stream files export the real components with the SAME prop contracts the stubs declared. In `PlcDashboard.tsx` `renderSection`, the imports already point at the real files (stubs were replaced in place), so no import change is needed — verify each section renders. Pass `onNavigate={handleNavigateSection}` to `PlcHome`.
- [ ] Run `pnpm exec vitest run tests/components/plc` — expected PASS.

### Task W3-2: Delete retired bento/grid/overview code

- [ ] `git rm` the files in the "Deleted files" list (bento, grid, `PlcOverviewTab.tsx`, `usePlcOverviewLayout.ts`, `overview/tiles/*` once salvaged, and their tests).
- [ ] Grep for dangling imports: `rg "usePlcOverviewLayout|PlcBentoGrid|PlcGridLayout|tileRegistry|PlcOverviewTab" --type ts --type tsx` → expect zero hits outside deleted files.
- [ ] Run `pnpm run type-check`. Fix any dangling references.

### Task W3-3: Full validation + manual checklist

- [ ] **Step 1:** `pnpm run validate` (type-check:all + lint --max-warnings 0 + format:check + tests + functions tests). Fix all failures.
- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "refactor(plc): wire redesigned sections into rail; remove legacy bento/grid overview"
```

- [ ] **Step 3:** `git push`. Mark PR ready: `gh pr ready`.
- [ ] **Step 4 — Manual verification on dev preview (Paul, Premium account):**
  - Open a PLC → left-rail nav (not header pills); rail is icon+label at desktop, icon-only at md, drill-in on mobile.
  - Home is a clean designed landing page; no draggable tiles; active assignments + quick-create + recent docs + members all render.
  - Assignments → "Create Quiz Assignment" authors a quiz from scratch, configures mode/settings/class picker/**due date**, assigns — **without** opening a board; music/board never changes. Same for Video.
  - Shared Data → filter by type, by specific assignment, by teacher, by class period, by date — results narrow correctly.
  - Docs → add a Google Doc URL; it embeds and is editable inline (real Google collab); add/rename/remove works.
  - Admin (admin account) → AdminSettings ▸ PLC Resources → push a quiz + a doc to one PLC and to "All PLCs"; confirm the PLC's Resources inbox shows them and "Use in this PLC" works.
  - Confirm To-Dos, Members, Settings, Quiz Library, Video Activities sections still work.

---

## Self-Review

**1. Spec coverage** (against the four approved decisions + the seven asks):

- Sidebar nav instead of horizontal tabs → Wave 1 Task 1 + Task 4. ✓
- Actual quiz/VA creation → Stream B (B1–B6). ✓
- Assignment creation w/ all settings + class pickers in-PLC, no board changes → Stream B (B3, B6); removes `setPendingAssignmentEdit` hand-off. ✓ (+ `dueAt` net-new in Wave 1 Task 2.)
- All assignment data → filterable shared data → Stream C. ✓ (type/assignment/teacher/class/date.)
- Embed Google Docs for shared notes → Stream D. ✓ (Docs as the surface.)
- Admin create/curate/push to specific or all PLCs → Stream E + Wave 1 Tasks 2/3. ✓
- "Clean designed landing page" decision → Stream A; bento/grid deleted in Wave 3. ✓
- "Anything else" extras (attention/quick-create/recent-docs/members on Home) → Stream A cards. ✓

**2. Placeholder scan:** No "TBD/TODO/implement later". Two intentional _conditional_ branches are explicit decisions, not placeholders: B0 (only edit the `quiz_assignments` rule **if** a `hasOnly` settings lock exists) and B5 (fall back to `writePlcVideoActivityEntry` **if** no VA template collection/rule exists — flagged for Wave 3). Both specify exact fallback behavior.

**3. Type consistency:** `PlcSectionId` defined once in `sections.ts`, imported by rail, stubs, and `PlcDashboard`. Hook return shapes match the verbatim signatures gathered (`usePlcAssignmentIndex`→`{entries,loading,error}`, `usePlcContributions`→`{contributions,loading,error}`, `usePlcQuizzes`→`{quizzes,...}`). `usePlcDocs`/`usePlcResources` return shapes are defined in D1/E1 and consumed consistently. `AssignClassPicker` value is `{ rosterIds: string[] }` everywhere. `createAssignment` quiz arg is `AssignmentQuizRef { id,title,driveFileId,questions }` — Stream B builds it from `saveQuiz`'s returned `QuizMetadata`.

**Cost posture preserved:** new `/plc_resources` is one shared doc per resource (no per-PLC/per-member copies); PLC reads via two bounded queries; `/plcs/{id}/docs` are lightweight pointers (content in Google); deleting `usePlcOverviewLayout` removes a per-user doc+listener. Net listener change is neutral-to-negative. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-20-plc-collaborative-redesign.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task with two-stage review between tasks. For Wave 2, dispatch the five streams **in parallel** (one subagent each), since their files are disjoint. Fast iteration, isolated context.
2. **Inline Execution** — execute tasks in this session with checkpoints for review (Wave 2 streams run sequentially in one session).

Which approach?
