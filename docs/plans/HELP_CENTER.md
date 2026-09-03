# Help Center — Shortcuts & Gestures modal rebuilt as an admin-configurable help library

Turns the "Shortcuts & Gestures" cheat sheet into a Help center with a Shortcuts tab and a
Guides tab whose content (embedded Docs, Slides, videos, PDFs, and Guided Learning activities)
is managed from the admin panel. Scope was settled in a design interview on 2026-09-03; this
document is the contract and the input to `/pauls-skills:mass-plan-implementation`. Every item
below is self-contained: an implementer should be able to build it from the item text plus the
code, without this conversation.

Out of scope (separate follow-ups): building targeting on help items, per-org custom
categories, org admins hiding global items, an in-app rich-text guide editor, thumbnails, the
Subs portal and mobile Remote surfaces, capability-key enforcement at runtime.

## Why

The cheat sheet is a hard-coded dark modal with three arrays that have drifted from the keys
the app actually binds. Teachers have no in-app place to find how-to material, and Paul has no
way to publish docs, slide decks, videos, or walkthrough activities without a code change. The
rebuild makes one Help surface the source of truth for shortcuts and gives admins a paste-a-link
library with open counts so Paul can see which materials are worth making more of.

## Product decisions (settled — do not re-litigate)

| Decision            | Answer                                                                                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name and shape      | One modal named **Help**. Light, on the shared `Modal` shell. Roughly 90vw two-pane: left nav (tabs + categories), right content. Under 768px: full-screen sheet with a category `<select>` above the content.                                           |
| Tabs                | **Shortcuts** and **Guides** only. Item kind (Docs, Slides, Videos, Activities) is an icon and a filter chip on Guides, not a tab.                                                                                                                       |
| Landing             | Ctrl/⌘+/ lands on Shortcuts. The board-actions FAB and the widget `?` land on Guides. Last tab is remembered for the session only (module-level variable, not localStorage).                                                                             |
| Search              | One search box at the top that filters both tabs (Fuse.js, already a dependency). Results show tab origin.                                                                                                                                               |
| Shortcuts source    | Stays hard-coded and translated. Full audit of every bound key and gesture is required; the current list is stale. Shortcuts are never admin-editable.                                                                                                   |
| Authoring model     | Every Guides item is either an **embed** (URL → inferred type) or a **Guided Learning activity** (reference to the shared admin GL library, played solo in teacher mode with no session). No rich text.                                                  |
| Categories          | Super-admin-defined, ordered. Seeded on first open of the admin tab with: Getting started, Boards & widgets, Quizzes & activities, Sharing & classes, Admin. Editable and deletable.                                                                     |
| Who edits           | Users with the legacy admin flag (`isAdmin` from `/admins`). No org-role capability enforcement yet.                                                                                                                                                     |
| Scope               | Derived, no UI choice. Super admins (per `isSuperAdmin()` in rules / `userRoles.superAdmins` client-side) publish globally (`orgId: null`). Every other admin publishes to their own `orgId`. Admins see global + their org; super admins see all.       |
| Org items in the UI | Org items appear inside the global categories, badged with the org short name. No custom categories in v1.                                                                                                                                               |
| Widget deep link    | `?` button in the shared `SettingsPanel` header next to Close. Hidden when no visible item lists that widget type. Opens Help on Guides filtered to the widget.                                                                                          |
| GL items            | Admin picker lists the shared admin GL library and the admin's personal GL library; picking a personal set copies it into the shared library (`building_guided_learning`) and stores the new `setId`. Requires a fresh Google token; clear error if not. |
| Embeds              | Https only. Rendered in a sandboxed iframe with an "Open ↗" button. Unconvertible URLs render as an open-in-new-tab card. Form shows a one-line note that Google files must be shared with anyone with the link.                                         |
| Open counts         | Per-item `openCount`, incremented by any signed-in user via a narrow rule, deduped per item per browser session. Shown in the admin tab.                                                                                                                 |
| Ordering / drafts   | Drag reorder within a category (dnd-kit, `SortableList`) saving `order`. `visible` toggle for drafts.                                                                                                                                                    |
| i18n                | App chrome and shortcuts translated in all four locales under a new `helpCenter` namespace; old `widgets.cheatSheet` keys removed. Admin-entered item text is not translated.                                                                            |
| Onboarding          | Keep firing `spart:cheatsheet-opened` and the localStorage flag whenever Help opens on any tab. Relabel the onboarding task "Open the Help center".                                                                                                      |
| Delivery            | Stacked PRs on `dev-paul`, one PR per item below, phases in order. Rules tests are CI-only on this machine.                                                                                                                                              |
| Tests               | Unit: embed inference, shortcut data. Component: modal tabs, search, Guides rendering, admin form. Rules: new collections and the `openCount` rule. No Playwright.                                                                                       |

## Constraints discovered in code (do not re-derive)

| Fact                                                                                                                                                                                                                                                                                                                         | Source                                                                                                                | Consequence                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cheat sheet is `components/common/CheatSheetModal.tsx`, a `<Modal variant="bare">` with a hand-rolled dark panel and three `useMemo` arrays.                                                                                                                                                                                 | `CheatSheetModal.tsx`                                                                                                 | Replace the file; do not extend it.                                                                                                            |
| Opened by Ctrl/⌘+/ in `DashboardView.tsx:1068-1073` (guarded by `isTypingFieldActive()`), by `BoardActionsFab.tsx:215-217`, and mounted only while open at `DashboardView.tsx:1665-1669`. State is `isCheatSheetOpen` at `:390`.                                                                                             | `components/layout/DashboardView.tsx`, `components/layout/BoardActionsFab.tsx`                                        | Help state stays in DashboardView. Extend it to `{ open, tab, widgetType? }`.                                                                  |
| On open it writes `localStorage['spart_cheatsheet_opened']='true'` and dispatches `spart:cheatsheet-opened`; the Onboarding widget listens for both (`open-cheatsheet` task).                                                                                                                                                | `CheatSheetModal.tsx:131-142`, `components/widgets/Onboarding/hooks/useOnboardingDetectors.ts:37-45`, `Widget.tsx:35` | Keep the event name and key unchanged.                                                                                                         |
| i18n keys live under `widgets.cheatSheet.*` in `locales/{en,de,es,fr}.json` (en at :1470). A locale-parity test exists at `tests/i18n/deBoardTafelTerminologyLocales.test.ts`.                                                                                                                                               | `locales/*.json`                                                                                                      | New `helpCenter.*` namespace in all four files in the same PR; delete the old keys.                                                            |
| `Modal.tsx` props: `variant`, `maxWidth`, `className`, `contentClassName`, `customHeader`, `captureEscape`, `ariaLabel`. Default panel is `bg-white rounded-2xl shadow-2xl max-h-[90vh]`. It manages `modalStore` open-count.                                                                                                | `components/common/Modal.tsx:8-24, 99-120`                                                                            | Use it with `variant="default"`; the open-count is what suppresses the floating widget toolbar (`DraggableWindow.tsx:219-226`).                |
| Board-level gestures are one `useGesture` block in `DashboardView.tsx:588+`; widget shortcuts are Alt+S/P/D/M and Esc in `DraggableWindow.tsx:2985-3370`; other `keydown` handlers are listed in item P1-1.                                                                                                                  | grep of `addEventListener('keydown'`, `onKeyDown=`                                                                    | The audit reads code, not the old list.                                                                                                        |
| `utils/urlHelpers.ts` `convertToEmbedUrl(url)` handles YouTube, Drive files, Vids, Docs (`?rm=minimal`), Slides (`/preview`), Sheets, Forms; returns input unchanged otherwise. Tests in `utils/urlHelpers.test.ts`.                                                                                                         | `utils/urlHelpers.ts:74-195`                                                                                          | Reuse. Add `inferHelpEmbedType(url)` beside it; do not fork the converter.                                                                     |
| Sandboxed iframe precedent: `sandbox="allow-scripts allow-forms allow-popups allow-same-origin"` (`BlendingBoard/Widget.tsx:83`). `firebase.json` CSP is `frame-ancestors` only; outbound iframes are unrestricted.                                                                                                          | `components/widgets/BlendingBoard/Widget.tsx`, `firebase.json:83-101`                                                 | Same sandbox string plus `referrerPolicy="strict-origin-when-cross-origin"`. No header changes.                                                |
| `admin_settings/*` is admin-read-only (`firestore.rules:697-713`).                                                                                                                                                                                                                                                           | `firestore.rules`                                                                                                     | Teacher-facing content cannot live there. New collections `help_center` and `help_resources`.                                                  |
| Strictest existing admin-content rule is `plc_resources` (`hasOnly` allowlist, `kind in [...]`, `createdByAdminUid == auth.uid`, int timestamps).                                                                                                                                                                            | `firestore.rules:3713-3737`                                                                                           | Template for the new rules (drafted in P2-2).                                                                                                  |
| `isAdmin()`, `isSuperAdmin()` (legacy `superAdmins[]` list or operator-org member `roleId == 'super_admin'`), and `isOrgMember(orgId)` already exist in rules; announcements use `orgId == null                                                                                                                              |                                                                                                                       | isOrgMember(orgId)                                                                                                                             |     | isAdmin()` for read. | `firestore.rules:91-112, 3667-3676` | Reuse all three. Client-side super-admin check: `useAuth().userRoles?.superAdmins` (see `OrganizationPanel.tsx:181`); org from `useAuth().orgId`. |
| `firestore.rules` comment: CEL cannot resolve the caller's org dynamically; but `isOrgMember(request.resource.data.orgId)` is resolvable because `orgId` comes from the document.                                                                                                                                            | `firestore.rules:91-95`                                                                                               | Scope enforcement works by checking membership in the org named on the doc.                                                                    |
| Firestore `in` queries cannot include `null`.                                                                                                                                                                                                                                                                                | Firestore semantics                                                                                                   | Teacher hook runs two queries (`orgId == null`, `orgId == myOrg`) and merges; admins with no org run one.                                      |
| Admin panel tabs are `TAB_GROUPS` in `components/admin/AdminSettings.tsx:38-129`; Content group holds Backgrounds, Announcements, Templates.                                                                                                                                                                                 | `AdminSettings.tsx`                                                                                                   | Add `help-center` to the Content group.                                                                                                        |
| Paste-a-link admin precedent: `components/admin/Announcements/EmbedConfigEditor.tsx` calls `convertToEmbedUrl` on blur; `DashboardTemplatesManager.tsx` and `PlcResourcesManager/` are the list-CRUD precedents.                                                                                                             | `components/admin/*`                                                                                                  | Match their look. Do not reuse `EmbedConfigEditor` wholesale (it has record/live tabs); copy the URL tab pattern.                              |
| Shared admin GL library: `building_guided_learning/{setId}` holds full `GuidedLearningSet` docs (authed read, admin write). Hook API: `useGuidedLearning().buildingSets`, `saveBuildingSet(set)`, `loadSetData(driveFileId)` for personal sets. Admin UI: `components/admin/GuidedLearningConfigurationPanel.tsx`.           | `hooks/useGuidedLearning.ts:33-63, 293`, `firestore.rules:890`                                                        | GL items store `setId` into this collection. Copy-from-personal = `loadSetData` then `saveBuildingSet` with a new id.                          |
| `GuidedLearningPlayer` props: `{ set, onClose?, onAnswer?, teacherMode?, timeMultiplier? }`. Renders in any positioned box with `style={{ containerType: 'size' }}`; the manager wraps it in `relative aspect-video w-full overflow-hidden bg-slate-900`.                                                                    | `components/widgets/GuidedLearning/components/GuidedLearningPlayer.tsx:66-79`, `GuidedLearningManager.tsx:1479-1490`  | Guides tab renders it exactly that way with `teacherMode`. No session, no `/guided-learning/` link.                                            |
| The GL "share link" `/guided-learning/{sessionId}` is the student app; a signed-in teacher becomes a student under their own uid and view counting only runs in view-only mode.                                                                                                                                              | `hooks/useGuidedLearningSession.ts:379`, `components/guidedLearning/GuidedLearningStudentApp.tsx:76-150`              | Not used for help items. A pasted `/guided-learning/` URL is treated as a generic `other` embed.                                               |
| Floating widget toolbar is a portalled pill in `DraggableWindow.tsx` (Settings, Pin, Screenshot, Annotate, Duplicate, Group, Snap, Maximize, Minimize, Close). Every widget's settings panel uses `components/common/SettingsPanel.tsx`; its header is at `:243-258` (`{widget.customTitle ?? title}` + Close `IconButton`). | `components/common/DraggableWindow.tsx`, `components/common/SettingsPanel.tsx`                                        | The `?` goes in `SettingsPanel`'s header, not the pill.                                                                                        |
| `SettingsPanel` is rendered from `DraggableWindow.tsx:3381`; DraggableWindow must not consume the full `useDashboard()` value (canvas hot path).                                                                                                                                                                             | CLAUDE.md "Canvas hot path"                                                                                           | The `?` opens Help by dispatching a window event handled in DashboardView; it reads help items through a small hook with a module-level cache. |
| Org capability keys are a closed union `CapabilityId` in `types/organization.ts:26-60` with labels in `config/organizationCapabilities.ts`; nothing enforces them at runtime.                                                                                                                                                | `types/organization.ts`, `config/organizationCapabilities.ts`, `components/admin/Organization/views/RolesView.tsx`    | Add `manageHelpResources` for future use only.                                                                                                 |
| dnd-kit sortable wrapper exists: `components/common/SortableList.tsx`.                                                                                                                                                                                                                                                       | `package.json`, `components/common/SortableList.tsx`                                                                  | Use it for category and item reorder.                                                                                                          |
| `TOOLS` metadata (type, icon, label) is `config/tools.ts:90`.                                                                                                                                                                                                                                                                | `config/tools.ts`                                                                                                     | Source for the widget-type multi-select in the admin form and for icons in the Guides filter.                                                  |
| Dev branch pushes deploy rules to the shared prod project.                                                                                                                                                                                                                                                                   | repo memory                                                                                                           | New rules are additive (new collections only) and safe to deploy ahead of the client.                                                          |
| Comments: one short line max; no multi-line comment blocks in the diff.                                                                                                                                                                                                                                                      | CLAUDE.md                                                                                                             | Applies to every item.                                                                                                                         |

## Data model

New file `types/helpCenter.ts`. All new fields optional in TypeScript where a legacy doc could
lack them; a normalizer supplies defaults.

### `HelpCategory` (inside `help_center/config`)

```ts
export interface HelpCategory {
  id: string; // slug, stable
  name: string;
  order: number;
}
export interface HelpCenterConfig {
  categories: HelpCategory[];
  updatedAt: number; // ms epoch int
  updatedBy: string; // uid
}
export const DEFAULT_HELP_CATEGORIES: HelpCategory[] = [
  { id: 'getting-started', name: 'Getting started', order: 0 },
  { id: 'boards-widgets', name: 'Boards & widgets', order: 1 },
  { id: 'quizzes-activities', name: 'Quizzes & activities', order: 2 },
  { id: 'sharing-classes', name: 'Sharing & classes', order: 3 },
  { id: 'admin', name: 'Admin', order: 4 },
];
```

### `HelpResourceItem` (`help_resources/{itemId}`)

```ts
export type HelpResourceKind = 'embed' | 'guided-learning';
export type HelpEmbedType =
  | 'youtube'
  | 'doc'
  | 'slides'
  | 'sheet'
  | 'pdf'
  | 'drive'
  | 'other';

export interface HelpResourceItem {
  id: string; // == doc id
  kind: HelpResourceKind;
  title: string;
  description: string; // may be ''
  categoryId: string;
  order: number;
  visible: boolean;
  orgId: string | null; // null = global (super admin only)
  widgetTypes: WidgetType[]; // may be []
  url: string | null; // embed only, https
  embedType: HelpEmbedType | null; // embed only, inferred at save
  setId: string | null; // guided-learning only, id in building_guided_learning
  openCount: number;
  createdBy: string; // uid
  createdByEmail: string; // display snapshot
  createdAt: number; // ms epoch int
  updatedAt: number;
}
```

`inferHelpEmbedType(url)` (in `utils/helpEmbed.ts`): `youtube.com`/`youtu.be` → `youtube`;
`docs.google.com/document` → `doc`; `/presentation` → `slides`; `/spreadsheets` → `sheet`;
`drive.google.com/file` with `.pdf` in the path or `?helpKind=pdf` absent → `drive`; a URL ending in
`.pdf` → `pdf`; everything else → `other`. `isAllowedHelpUrl(url)` = parses and `protocol === 'https:'`.
`toHelpEmbedSrc(url)` = `convertToEmbedUrl(url)`; when the result equals the input and `embedType`
is `other`, the Guides tab shows an open-in-new-tab card instead of an iframe.

### Shortcut data (`config/helpShortcuts.ts`)

```ts
export interface HelpShortcut {
  id: string;
  keys: string[][];
  labelKey: string;
  group: 'board' | 'widget' | 'navigation' | 'editing';
}
export interface HelpGesture {
  id: string;
  labelKey: string;
  descriptionKey: string;
  group: 'board' | 'widget';
}
export const HELP_SHORTCUTS: HelpShortcut[];
export const HELP_GESTURES: HelpGesture[];
```

`keys` is an array of chords, each chord an array of key tokens (`['Ctrl','/']`, with `Ctrl` rendered
as ⌘ on Mac using the existing platform check in `CheatSheetModal.tsx`).

## Routes

None added. Help is a modal inside `/`.

## Phases and items

Each item has: model tier for the implementer, key files, done-when, and notes. Items within a
phase are file-disjoint unless stated. **Protected files** (owned by the orchestrator, shipped as
small dedicated PRs from implementers' `concerns`): `firestore.rules`, `firestore.indexes.json`,
`firebase.json`, `.github/workflows/*`. Rule text is drafted in P2-2 so implementers can quote it.

### Phase 1 — shortcut audit and the Help modal shell

#### P1-1 Shortcut and gesture audit → typed data — `sonnet`

Key files: new `config/helpShortcuts.ts`, new `config/helpShortcuts.test.ts`; read `components/layout/DashboardView.tsx` (Ctrl+/ at :1068, `useGesture` block at :588+, any other `e.key` checks), `components/common/DraggableWindow.tsx` (Alt+S/P/D/M, Esc, screenshot long-press, and any `e.key` in its keydown handler), `components/layout/BoardActionsFab.tsx`, `components/layout/BoardNavFab.tsx`, `components/layout/dock/*.tsx`, `components/layout/AnnotationOverlay.tsx`, `components/common/SettingsPanel.tsx`, `components/common/DialogContainer.tsx`, `components/common/ImageLightbox.tsx`, and the existing arrays in `components/common/CheatSheetModal.tsx` for the old wording.

Do: grep every `keydown` listener and `onKeyDown` handler under `components/layout`, `components/common`, `hooks`, `context` for global or board-level bindings (ignore bindings scoped to a single input, list, or menu such as arrow keys inside a dropdown). For each binding record the chord, the action, and the file:line. Do the same for touch gestures in the `useGesture` block and DraggableWindow (drag, pinch, two-finger pan, long-press, double-tap). Produce `HELP_SHORTCUTS` and `HELP_GESTURES` with stable ids and `labelKey`s of the form `helpCenter.shortcuts.<id>` / `helpCenter.gestures.<id>`. Drop entries from the old list that no longer bind; add every binding that exists. Put the audit table (chord, action, source file:line) in the PR description, not in code.

Done when: the test asserts ids are unique, every `labelKey` starts with `helpCenter.`, and at least the bindings at `DashboardView.tsx:1068` (Ctrl+/) and the four Alt chords in DraggableWindow are present. `pnpm run type-check` and `pnpm run lint` pass.

Notes: do not touch locales; P1-2 adds the strings from the `labelKey`s you define and reads your PR description for wording. Export nothing else from this file.

#### P1-2 Help modal shell, Shortcuts tab, search, i18n move — `opus`

Key files: new `components/help/HelpCenterModal.tsx`, new `components/help/HelpShortcutsTab.tsx`, new `components/help/helpCenterState.ts`, new `components/help/HelpCenterModal.test.tsx`, delete `components/common/CheatSheetModal.tsx`, `components/layout/DashboardView.tsx:27, 390, 1068-1073, 1588, 1657-1669`, `components/layout/BoardActionsFab.tsx:215-217`, `components/widgets/Onboarding/Widget.tsx:35` (label only), `locales/en.json`, `locales/de.json`, `locales/es.json`, `locales/fr.json`, `config/helpShortcuts.ts` (from P1-1; if not merged, create it with the current three arrays translated to the P1-1 shape and let P1-1 rebase).

Do:

1. `helpCenterState.ts`: `export type HelpTab = 'shortcuts' | 'guides'`; `export interface HelpOpenRequest { tab?: HelpTab; widgetType?: WidgetType }`; `export const HELP_OPEN_EVENT = 'spart:open-help'`; `export function requestOpenHelp(req: HelpOpenRequest)` that dispatches a `CustomEvent` with `detail: req`; a module-level `lastTab` getter/setter.
2. `DashboardView`: replace `isCheatSheetOpen` with `helpState: { open: boolean; tab: HelpTab; widgetType?: WidgetType }`. Ctrl/⌘+/ toggles with `tab: 'shortcuts'`. `BoardActionsFab` prop renamed `onOpenHelp` opening `tab: lastTab ?? 'guides'`. Add a `window` listener for `HELP_OPEN_EVENT` that opens with the event detail. Mount `HelpCenterModal` only while open.
3. `HelpCenterModal`: `<Modal variant="default" maxWidth="max-w-6xl" className="h-[88vh]" contentClassName="p-0" ariaLabel=...>` with a custom header: title, search input (`role="searchbox"`, autofocus), Close. Body: left nav 220px (tabs as `role="tablist"`; Guides shows categories in P2-4, render a placeholder list for now), right pane scrolls. Under `md`: nav collapses to a `<select>` above the pane. On mount write `localStorage['spart_cheatsheet_opened']='true'` and dispatch `spart:cheatsheet-opened` exactly as the old modal did.
4. `HelpShortcutsTab`: renders `HELP_SHORTCUTS` grouped by `group` with `<kbd>` pills (port `KeyBadge` and the Mac check from the old file), then `HELP_GESTURES` grouped board/widget. Filter by the search string using Fuse over the translated label and description text.
5. Guides tab in this PR: an empty state via a plain centered message "Guides are coming soon" keyed `helpCenter.guides.placeholder`. P2-4 replaces it.
6. i18n: create `helpCenter` namespace: `title`, `search`, `tabs.shortcuts`, `tabs.guides`, `shortcuts.<id>`, `gestures.<id>`, `gestures.<id>Description`, `groups.*`, `footer`, `close`, `guides.placeholder`, `onboardingTask` ("Open the Help center"). Remove `widgets.cheatSheet` from all four locales. Provide de/es/fr translations (machine-quality is fine, match the register of neighboring keys).
7. Tests: opens on Shortcuts for Ctrl+/ request, opens on Guides for a `HELP_OPEN_EVENT`, search narrows the shortcut list, the onboarding event fires on mount, Escape closes.

Done when: `pnpm run type-check`, `pnpm run lint`, `pnpm run test -- tests/i18n components/help` pass; the light modal is verified in a Vite harness or the bypass server (memory: the auth-bypass server cannot render the teacher shell; use a temp harness page and delete it before commit).

Notes: keep `useDashboard` and `useToolVisibility` out of `components/help/*` so the modal can be mounted from the Subs portal later. Light theme per the settled decision; body text `text-slate-700`, headings `text-slate-900`, matching `WhatsNewModal`.

### Phase 2 — data model, rules, admin tab, Guides tab (after Phase 1 merges)

#### P2-1 Types, embed inference, normalizers, hooks — `sonnet`

Key files: new `types/helpCenter.ts`, new `utils/helpEmbed.ts`, new `utils/helpEmbed.test.ts`, new `utils/helpCenterNormalize.ts`, new `utils/helpCenterNormalize.test.ts`, new `hooks/useHelpResources.ts`, new `hooks/useHelpResources.test.ts`, reference `utils/urlHelpers.ts`, `hooks/useGuidedLearning.ts`, `context/AuthContextValue.ts:26, 231`.

Do:

1. Types exactly as in "Data model", including `DEFAULT_HELP_CATEGORIES`.
2. `utils/helpEmbed.ts`: `isAllowedHelpUrl`, `inferHelpEmbedType`, `toHelpEmbedSrc` per the data model section, plus `HELP_IFRAME_SANDBOX = 'allow-scripts allow-forms allow-popups allow-same-origin'`.
3. `utils/helpCenterNormalize.ts`: `normalizeHelpResourceItem(id, data): HelpResourceItem | null` (null when `kind` or `title` missing), `normalizeHelpCenterConfig(data): HelpCenterConfig` (defaults to `DEFAULT_HELP_CATEGORIES` when `categories` missing or empty), `sortHelpItems(items)` by category order then `order` then `title`.
4. `hooks/useHelpResources.ts`: `useHelpResources({ includeHidden }: { includeHidden: boolean })` returns `{ items, categories, loading, error }`. Subscribes with `onSnapshot` to `help_center/config` and to two queries on `help_resources`: `where('orgId','==',null)` and, when `useAuth().orgId` is set, `where('orgId','==',orgId)`; merges by id. `includeHidden: false` filters `visible !== false`. Also export `useHelpItemsForWidget(widgetType)` built on the same subscription through a module-level shared listener (one Firestore subscription per page regardless of how many settings panels mount) returning visible items whose `widgetTypes` include the type.
5. Tests: inference for each `HelpEmbedType`, http rejection, normalizer defaults, category sort, and the hook merging two query results with mocked `onSnapshot`.

Done when: unit tests and `pnpm run type-check` pass without touching any other file.

Notes: `useAuth()` is safe here; the modal itself must not import `useDashboard`. Firestore reads for teachers depend on the rules in P2-2; the hook must tolerate `permission-denied` on the org query by logging once and using the global results.

#### P2-2 Rules and rules tests (protected; orchestrator PR) — `opus`

Key files: `firestore.rules` (insert after `plc_resources`, ~:3737), new `tests/rules/helpCenter.test.ts`, reference `tests/rules/plcContributions.test.ts` for setup, `firestore.rules:91-112` for `isSuperAdmin`, `:3667-3676` for `isOrgMember` usage.

Rule text to draft:

```
match /help_center/config {
  allow read: if request.auth != null;
  allow write: if isAdmin() && isSuperAdmin()
    && request.resource.data.keys().hasOnly(['categories', 'updatedAt', 'updatedBy'])
    && request.resource.data.categories is list
    && request.resource.data.updatedBy == request.auth.uid
    && request.resource.data.updatedAt is int;
}

match /help_resources/{itemId} {
  function helpScopeOk(d) {
    return d.orgId == null ? isSuperAdmin() : (d.orgId is string && isOrgMember(d.orgId));
  }
  function helpShapeOk(d) {
    return d.id == itemId
      && d.keys().hasOnly(['id','kind','title','description','categoryId','order','visible',
           'orgId','widgetTypes','url','embedType','setId','openCount',
           'createdBy','createdByEmail','createdAt','updatedAt'])
      && d.kind in ['embed','guided-learning']
      && d.title is string && d.title.size() > 0 && d.title.size() <= 200
      && d.description is string && d.description.size() <= 1000
      && d.categoryId is string && d.order is int && d.visible is bool
      && d.widgetTypes is list && d.openCount is int
      && (d.kind == 'embed'
            ? (d.url is string && d.url.matches('^https://.*') && d.embedType is string && d.setId == null)
            : (d.setId is string && d.url == null && d.embedType == null))
      && d.createdByEmail is string && d.createdAt is int && d.updatedAt is int;
  }
  allow read: if request.auth != null
    && (resource.data.orgId == null || isAdmin() || isOrgMember(resource.data.orgId));
  allow create: if isAdmin() && helpShapeOk(request.resource.data)
    && helpScopeOk(request.resource.data)
    && request.resource.data.createdBy == request.auth.uid
    && request.resource.data.openCount == 0;
  allow update: if (isAdmin() && helpShapeOk(request.resource.data)
    && helpScopeOk(resource.data)
    && request.resource.data.orgId == resource.data.orgId
    && request.resource.data.createdBy == resource.data.createdBy
    && request.resource.data.openCount == resource.data.openCount)
    || (request.auth != null
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['openCount'])
    && request.resource.data.openCount == resource.data.openCount + 1);
  allow delete: if isAdmin() && helpScopeOk(resource.data);
}
```

Tests: super admin creates global; org admin cannot create global; org admin creates for own org; org admin cannot create for another org; teacher in org reads global and own-org items but not another org's; teacher increments `openCount` by exactly 1 and cannot change it by 2 or together with `title`; admin update cannot change `orgId` or `openCount`; `http://` url rejected; `guided-learning` with a `url` rejected; config write by non-super admin rejected. Note the `isAdmin()` guard also requires an `/admins/{email}` doc in the emulator fixture.

Done when: the rules test file passes in CI (local emulator is unreliable on this machine).

Notes: `list` queries filtered by `orgId == null` and `orgId == myOrg` satisfy the read rule; a client query without a filter will be denied, which is intended. Two `get()` calls inside `isSuperAdmin` are within the per-request limit.

#### P2-3 Capability key `manageHelpResources` — `haiku`

Key files: `types/organization.ts:26-60`, `config/organizationCapabilities.ts:33`, `components/admin/Organization/views/RolesView.tsx:295-297`, any test that enumerates capabilities (grep `postAnnouncements` under `tests/` and `components/admin/Organization`).

Do: add `'manageHelpResources'` to the Admin group of `CapabilityId` after `postAnnouncements`, with label "Manage help resources". Ensure new-role defaults and any snapshot/enumeration tests include it. Do not wire enforcement anywhere.

Done when: type-check, lint, and the organization tests pass.

#### P2-4 Admin Help Center tab — `opus`

Key files: new `components/admin/HelpCenter/HelpCenterManager.tsx`, new `components/admin/HelpCenter/HelpItemForm.tsx`, new `components/admin/HelpCenter/HelpCategoryEditor.tsx`, new `components/admin/HelpCenter/GuidedLearningPicker.tsx`, new `components/admin/HelpCenter/HelpCenterManager.test.tsx`, `components/admin/AdminSettings.tsx:60-80` (add the tab), reference `components/admin/DashboardTemplatesManager.tsx`, `components/admin/PlcResourcesManager/`, `components/admin/Announcements/EmbedConfigEditor.tsx` (URL tab pattern), `components/common/SortableList.tsx`, `config/tools.ts:90`, `hooks/useGuidedLearning.ts`, `hooks/useHelpResources.ts` (P2-1), `types/helpCenter.ts` (P2-1).

Do:

1. Tab entry `{ id: 'help-center', label: 'Help Center', icon: LifeBuoy, component: HelpCenterManager }` in the Content group.
2. `HelpCenterManager`: uses `useHelpResources({ includeHidden: true })`. Derives `isSuperAdmin` from `useAuth().userRoles?.superAdmins` containing the user's lowercased email (same check as `OrganizationPanel.tsx:181`) and `orgId` from `useAuth().orgId`. Scope shown as a read-only badge on each item: "Everyone" or the org short name. Non-super admins with no `orgId` see a notice that they must belong to an organization to publish and the Add button is disabled. On first render, if the config doc does not exist and the user is super admin, write it with `DEFAULT_HELP_CATEGORIES` (seed). Non-super admins see the categories read-only.
3. Layout: category sections (collapsible) each listing its items with kind icon, title, scope badge, visibility toggle, `openCount`, edit and delete. Drag reorder within a category through `SortableList`, writing `order` for the affected items in a `writeBatch`. Items from other orgs never appear (the hook already limits the query); super admins see all orgs with the badge.
4. `HelpCategoryEditor` (super admin only): add, rename, delete (delete blocked while items reference the category), drag reorder; writes the whole `categories` array with `updatedAt`, `updatedBy`.
5. `HelpItemForm` (modal via shared `Modal`): kind segmented control (Embed / Guided Learning activity). Embed: URL input, on blur validate `isAllowedHelpUrl` and show the inferred type chip and a live preview iframe using `toHelpEmbedSrc`; one-line note "Google files must be shared with anyone with the link." Both kinds: title, description, category select, widget types multi-select from `TOOLS` (searchable checklist), visible toggle. Save computes `embedType`, `orgId` (null for super admin, else the admin's org), `createdBy`/`createdByEmail` on create, timestamps, `openCount: 0` on create; update never sends `openCount`, `orgId`, `createdBy`.
6. `GuidedLearningPicker`: two lists, "Shared library" (`buildingSets`) and "My library" (`sets` from `useGuidedLearning`), searchable. Picking a shared set stores its id. Picking a personal set calls `loadSetData(driveFileId)`, assigns a new id, `saveBuildingSet`, and stores the new id; surface the token error verbatim in a toast if Drive access fails and leave the form open.
7. Tests: seed happens once for super admin and not for org admin; org admin save stamps `orgId`; super admin save stamps `null`; embed type inference shown; http URL blocks save; reorder writes `order` values.

Done when: type-check, lint, targeted tests pass; the tab is verified in a Vite harness page wrapping `AdminSettings` (delete the harness before commit).

Notes: admin surfaces are light UI; `text-slate-500` is fine there. Follow the `admin-widget-config` skill only for styling conventions; this is a content list, not a widget config modal.

#### P2-5 Guides tab in the Help modal — `opus`

Key files: new `components/help/HelpGuidesTab.tsx`, new `components/help/HelpResourceViewer.tsx`, new `components/help/HelpGuidesTab.test.tsx`, `components/help/HelpCenterModal.tsx` (replace the placeholder, wire categories into the left nav), `hooks/useHelpResources.ts` (P2-1), `utils/helpEmbed.ts` (P2-1), `components/widgets/GuidedLearning/components/GuidedLearningPlayer.tsx` (import lazily), `hooks/useGuidedLearning.ts` (read a shared set by id: add `loadBuildingSet(setId)` if no single-doc getter exists), `locales/*.json` (`helpCenter.guides.*`).

Do:

1. Left nav under the Guides tab lists categories that have at least one visible item; "All" on top. Kind filter chips (Docs, Slides, Videos, Activities, Other) above the list, multi-select, mapped from `embedType` and `kind`.
2. Item list: cards with kind icon, title, description, org badge when `orgId` is set, widget-type pills. Search (from the modal header) filters title, description, and category name via Fuse. Empty states through plain centered copy: no items at all ("Your admin hasn't added guides yet"), no matches.
3. Opening a card shows `HelpResourceViewer` in the right pane with a back button: embeds render `<iframe src={toHelpEmbedSrc(url)} sandbox={HELP_IFRAME_SANDBOX} referrerPolicy="strict-origin-when-cross-origin" allow="autoplay; fullscreen">` in a `relative w-full aspect-video` box for youtube and a `min-h-[60vh]` box for docs/slides/sheet/pdf/drive; `other` with an unconverted URL renders an open-in-new-tab card. Every viewer has an "Open ↗" link with `rel="noopener noreferrer"`. Guided-learning items load the set from `building_guided_learning` and render `<GuidedLearningPlayer set={set} teacherMode />` inside `relative aspect-video w-full overflow-hidden rounded-lg bg-slate-900` with `style={{ containerType: 'size' }}`; missing set shows a plain "This activity is no longer available" message.
4. When opened with `widgetType` (from P1-2's state), preselect the filter to items containing that type and show a clearable chip with the widget's label from `TOOLS`.
5. Open counting: on viewer mount call `incrementHelpOpenCount(itemId)` from `hooks/useHelpResources.ts` (add it there in this item: `updateDoc(doc(db,'help_resources',id), { openCount: increment(1) })`), guarded by a module-level `Set` of ids opened this page load. Swallow `permission-denied` with a single `console.warn`.
6. Tests: category nav derived from visible items only, chip filtering, widget-type preselect, viewer renders iframe with sandbox for an embed, increment called once per id across two mounts, GL branch renders the player with `teacherMode`.

Done when: type-check, lint, targeted tests pass; verified visually in the same harness approach as P1-2.

Notes: lazy-import `GuidedLearningPlayer` so the Help modal bundle does not pull the GL widget for teachers who never open an activity. Keep `useDashboard` out of `components/help/*`.

### Phase 3 — widget deep link and admin counts (after Phase 2 merges)

#### P3-1 `?` in the widget settings header — `sonnet`

Key files: `components/common/SettingsPanel.tsx:243-258`, new `components/common/SettingsPanel.help.test.tsx`, `hooks/useHelpResources.ts` (`useHelpItemsForWidget` from P2-1), `components/help/helpCenterState.ts` (`requestOpenHelp` from P1-2), `locales/*.json` (`helpCenter.widgetHelp` = "Guides for this widget").

Do: in the header, before the Close button, render an `IconButton` with `CircleHelp` (lucide) and `aria-label={t('helpCenter.widgetHelp')}` only when `useHelpItemsForWidget(widget.type).length > 0`. Click calls `requestOpenHelp({ tab: 'guides', widgetType: widget.type })` and closes the settings panel via the existing `onClose`. The hook must read from the shared module-level subscription so mounting the panel adds no Firestore listener.

Done when: a test mounts `SettingsPanel` with the hook mocked to return items and asserts the button dispatches `spart:open-help` with the widget type, and asserts no button when the hook returns `[]`. Type-check and lint pass.

Notes: `SettingsPanel` is on the canvas hot path; do not add `useDashboard()` or any context that re-renders on provider commits.

#### P3-2 Open counts in the admin tab and plan close-out — `sonnet`

Key files: `components/admin/HelpCenter/HelpCenterManager.tsx` (P2-4), `docs/plans/HELP_CENTER.md` (this file), `public/changelog.json` via `pnpm run changelog:draft`.

Do: show `openCount` on every item row with a small eye icon and a per-category total in the section header; add a "Sort by opens" toggle for the flat view. Draft a changelog entry for the Help center (rewrite the generated text). Mark shipped items in this document with PR numbers.

Done when: type-check, lint pass; changelog entry reads as a user-facing note.

## Status (2026-09-03)

All items shipped:

- P1-1 #2809
- P1-2 #2815
- P2-1 #2810
- P2-2 #2807
- P2-3 #2808
- P2-4 #2814
- P2-5 #2819
- P3-1 #2818
- P3-2 this PR

## Verification matrix (orchestrator, before each phase merge)

| Check                                        | How                                                                                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Shortcut list matches bound keys             | P1-1 PR description table is spot-checked against `DashboardView.tsx` and `DraggableWindow.tsx`; Ctrl+/ and Alt+S/P/D/M present.        |
| Onboarding still completes                   | P1-2 test asserts `spart:cheatsheet-opened` on mount; Onboarding detector unchanged.                                                    |
| Locale parity                                | `pnpm run test -- tests/i18n` after P1-2; no `widgets.cheatSheet` key remains in any locale (`grep -rn cheatSheet locales/`).           |
| Teachers can read, admins scoped             | P2-2 rules tests in CI.                                                                                                                 |
| Open count cannot be abused                  | P2-2 test: +2 denied, +1 with another field denied.                                                                                     |
| GL item plays without a session              | P2-5 test renders the player with `teacherMode`; no `guided_learning_sessions` write in the Help modal (grep).                          |
| No new Firestore listener per settings panel | P3-1: `useHelpItemsForWidget` reads a module-level subscription; verify `onSnapshot` call count in the test equals 1 across two panels. |
| Widget toolbar suppressed while Help is open | Manual in harness: floating pill hidden with the modal open (relies on `Modal` open-count).                                             |

## Open assumptions (flag to Paul if any is wrong)

1. Super admin on the client is derived from `userRoles.superAdmins` containing the user's email, the same check `OrganizationPanel` uses. If the operator-org `roleId == 'super_admin'` path is the only source for some admins, P2-4 should also check `useAuth().roleId === 'super_admin'`.
2. Admins who belong to no organization cannot publish org-scoped items and see a notice; they are expected to be super admins in practice.
3. Cross-org read of help items is denied by rules, mirroring announcements, even though the content is low-risk.
4. The Guides tab hides categories with no visible items rather than showing empty sections.
