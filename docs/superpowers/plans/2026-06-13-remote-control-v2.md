# Remote Control v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing teacher remote (`/remote`) feel production-quality for Tuesday's live-board presentation by cutting tap-to-board latency, adding live two-way sync + reliability UI, and shipping Activity Wall and Embed remote controls.

**Architecture:** The remote reuses the dashboard's existing Firestore transport (`updateWidget`/`updateDashboardSettings` → `DashboardContext` debounced auto-save → `onSnapshot` on desktop). We thread an additive `{ immediate: true }` intent flag from remote control call sites through `updateWidget`/`updateDashboardSettings` into the save scheduler so control writes flush immediately while structural/position writes keep their current debounce. `MobileRemoteView` switches from manual-Sync-only to live snapshot reflection (keeping its 5s pending-write echo guard) and gains a connection chip, last-synced indicator, and tap feedback. New `RemoteActivityWallControl` reuses the Activity Wall submissions subcollection and its read/write shapes; the Embed control ships spotlight/swap (slide nav only if the spike passes).

**Tech Stack:** React + Vite + TypeScript, Firebase/Firestore (modular SDK), pnpm, vitest + @testing-library/react.

---

## File Structure

| File                                                             | Create/Modify | Single responsibility                                                                                                                                                       |
| ---------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/superpowers/spikes/2026-06-13-embed-slide-control.md`      | Create        | Written outcome of the Embed slide-control feasibility spike (Task 1).                                                                                                      |
| `context/DashboardContext.tsx`                                   | Modify        | Thread an `immediate` intent flag through `updateWidget`/`updateDashboardSettings` into the debounced auto-save effect so control writes bypass the debounce (Task 2).      |
| `context/DashboardContext.immediate.test.tsx`                    | Create        | Unit tests asserting control writes schedule immediately while structural/position writes stay debounced (Task 2).                                                          |
| `components/remote/MobileRemoteView.tsx`                         | Modify        | Live snapshot reflection (no manual Sync required), connection status chip, last-synced indicator; pass `immediate` through write-through handlers (Task 3).                |
| `components/remote/MobileRemoteView.test.tsx`                    | Create        | Tests for live-sync reflection + pending-guard echo suppression + connection chip (Task 3).                                                                                 |
| `components/remote/useRemoteConnection.ts`                       | Create        | Hook returning Firestore connection status + last-synced timestamp for the chip/indicator (Task 3).                                                                         |
| `components/remote/useRemoteConnection.test.tsx`                 | Create        | Unit test for the connection hook (Task 3).                                                                                                                                 |
| `components/remote/controls/RemoteActivityWallControl.tsx`       | Create        | Activity Wall remote control: active/pause toggle, QR affordance (anonymous-join gated), pending-queue listener, approve, remove, count badge (Task 4).                     |
| `components/remote/controls/RemoteActivityWallControl.test.tsx`  | Create        | Tests for the Activity Wall control (Task 4).                                                                                                                               |
| `components/remote/RemoteWidgetCard.tsx`                         | Modify        | Register `activity-wall` → `RemoteActivityWallControl` and `embed` → `RemoteEmbedControl` in `renderControls`; add tap-feedback prop pass-through (Task 4, Task 5, Task 6). |
| `components/remote/controls/RemoteEmbedControl.tsx`              | Create        | Embed remote control: spotlight/swap (always); slide prev/next only if the spike passed (Task 5).                                                                           |
| `components/remote/controls/RemoteEmbedControl.test.tsx`         | Create        | Tests for the Embed control (Task 5).                                                                                                                                       |
| `docs/superpowers/checklists/2026-06-13-remote-v2-smoke-test.md` | Create        | Manual two-device acceptance checklist (Task 7).                                                                                                                            |

Reference points (read before editing):

- Debounced auto-save effect: `context/DashboardContext.tsx` L2180–2294. Tiers (L2229–2233): `200` structural (`isStructuralChange`), `100` settings-only (`lastUpdateWasSettingsOnly.current`), `800` config/position. `updateWidget` def L4659–4733 (sets `lastUpdateWasSettingsOnly.current = false`, L4664). `updateDashboardSettings` def L5070–5091 (sets `lastUpdateWasSettingsOnly.current = true`, L5075). Context value exports L5493+ / L5619+.
- `MobileRemoteView`: `components/remote/MobileRemoteView.tsx` — `REMOTE_SUPPORTED_TYPES` L40–56, `REMOTE_SKIP_TYPES` L59–65, live auto-sync effect with `pendingWidgetTimers` 5s guard L148–178, `handleUpdateWidget` L195–219, `handleUpdateDashboardSettings` L224–236, Sync button L356–366.
- `RemoteWidgetCard`: `components/remote/RemoteWidgetCard.tsx` — `renderControls` switch L73–146, Spotlight/Maximize L159–173.
- Control templates: `components/remote/controls/RemoteTrafficLightControl.tsx` (config write pattern), `RemoteNextUpControl.tsx` (active-toggle + counter pattern).
- Activity Wall: `components/widgets/ActivityWall/Widget.tsx` — `LiveSubmission` L220–232, submissions subcollection listener L470–504 (path `collection(db, 'activity_wall_sessions', `${user.uid}_${activeActivity.id}`, 'submissions')`), `moderationCounts` L1096–1106, `deleteSubmission` (deleteDoc) L1202–1257, session metadata `setDoc(doc(db,'activity_wall_sessions',activeSessionId), { active... })` L452–467, `activeActivityId` selects active activity L336/L849. Type id is `'activity-wall'` (`types.ts` L58). `canOfferAnonymousJoin = canAccessFeature('anonymous-join')` L299.
- Embed: `components/widgets/Embed/Widget.tsx` — config L45–56, iframe `src={finalEmbedUrl}` L568, `finalEmbedUrl = applyStartAt(applyAutoplay(embedUrl, autoplay), startAtSeconds)` L215–218. `EmbedConfig` `types.ts` L1142–1153. `convertToEmbedUrl` `utils/urlHelpers.ts` L68; Google Slides branch L151–167 rewrites to `/presentation/d/<id>/preview` and **clears `parsed.search`/`parsed.hash`** (L163–164).
- Firebase mock convention (co-located tests): `components/widgets/ActivityWall/Widget.test.tsx` L104–133 — `vi.mock('@/config/firebase', () => ({ db: {}, functions: {}, storage: {} }))` and `vi.mock('firebase/firestore', () => ({ collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, ... }))`.
- Existing remote test conventions: `components/layout/RemoteControlMenu.test.tsx` — `vi.mock('@/context/useDashboard')`, `vi.mock('@/context/useAuth')`, `@testing-library/user-event`.

Run all tests with `pnpm vitest run <path>`. Pre-commit runs eslint+prettier; commit messages are prefixed `[AI] `.

---

### Task 1: Embed slide-control feasibility spike (timeboxed — do FIRST)

Investigation only — no feature code. Decide whether slide next/prev is drivable for Paul's deck. Timebox: 45 minutes. Outcome gates Task 5.

**Files:**

- Create: `docs/superpowers/spikes/2026-06-13-embed-slide-control.md`
- Read: `utils/urlHelpers.ts` (`convertToEmbedUrl`, Google Slides branch L151–167), `components/widgets/Embed/Widget.tsx` (L210–218, L563–581), `components/widgets/Embed/applyStartAt.ts`, `components/widgets/Embed/applyAutoplay.ts`

Steps:

- [ ] Read `convertToEmbedUrl` in `utils/urlHelpers.ts` L68–167 and record exactly how a `docs.google.com/presentation/...` URL is transformed. Note (already confirmed): the Slides branch sets `parsed.pathname = '/presentation/d/<id>/preview'`, then `parsed.search = ''` and `parsed.hash = ''` (L162–164) — any `?slide=` / `#slide=id.p` is stripped.
- [ ] Read `components/widgets/Embed/Widget.tsx` L210–218 and L563–581 — confirm the iframe `src` is `finalEmbedUrl` (derived from `convertToEmbedUrl` output) and that there is no slide-index field on `EmbedConfig` (`types.ts` L1142–1153).
- [ ] Determine the deck format Paul will present: ask whether it is a Google Slides "publish to web" (`/presentation/d/e/<id>/pubembed?...`) link or a normal `/edit` / share link. The publish-to-web `pubembed` form supports `&slide=N` and `&start=false`, but `convertToEmbedUrl`'s Slides branch matches `/presentation/(?:u/\d+/)?d/([\w-]+)` and rewrites to `/preview`, discarding it.
- [ ] Decision checkpoint — write the verdict in the spike doc:
  - PASS only if the deck is a publish-to-web link whose slide param survives `convertToEmbedUrl` (it does **not** today) OR Task 5 adds a narrow bypass that preserves a slide param for `pubembed` URLs without regressing existing embeds, AND a manual two-device check shows smooth/reliable slide changes.
  - FAIL (expected, per current code): `/preview` has no slide-index URL contract and `convertToEmbedUrl` strips query/hash, so iframe-src slide navigation is not reliably drivable. Task 5 ships spotlight/swap only.
- [ ] Record the verdict (`PASS` or `FAIL`) and a one-line rationale at the top of `docs/superpowers/spikes/2026-06-13-embed-slide-control.md`.
- [ ] Commit: `git add docs/superpowers/spikes/2026-06-13-embed-slide-control.md && git commit -m "[AI] Spike: Embed slide-control feasibility verdict"`

---

### Task 2: Latency fast-path — immediate-write intent flag

Add an additive `immediate` flag so remote control writes flush to Firestore right away while structural/position writes keep their debounce. Default path unchanged.

**Files:**

- Modify: `context/DashboardContext.tsx` — `updateWidget` L4659–4733, `updateDashboardSettings` L5070–5091, debounce-tier logic L2223–2233, context value exports (~L5493, ~L5619)
- Modify: `types.ts` — extend the `updateWidget`/`updateDashboardSettings` signatures in `DashboardContextType` (find the interface that types the context value)
- Test: Create `context/DashboardContext.immediate.test.tsx`

Steps:

- [ ] Add an `immediate` intent ref near `lastUpdateWasSettingsOnly` (L1199 region) in `context/DashboardContext.tsx`:
  ```tsx
  // Set true by a remote-originated control write to bypass the auto-save
  // debounce for that one scheduling pass; consumed (reset) inside the effect.
  const pendingImmediateWrite = useRef<boolean>(false);
  ```
- [ ] Write the failing test `context/DashboardContext.immediate.test.tsx` that renders a harness consuming the context and asserts an immediate widget write schedules with a 0ms (immediate) timer while a structural write uses the 200ms debounce. Use fake timers:

  ```tsx
  import { render, act } from '@testing-library/react';
  import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
  import { useDashboard } from '@/context/useDashboard';
  import { DashboardProvider } from '@/context/DashboardContext';

  vi.mock('@/services/dashboardService', () => ({
    saveDashboard: vi.fn().mockResolvedValue(undefined),
  }));

  const Harness = ({
    onReady,
  }: {
    onReady: (api: ReturnType<typeof useDashboard>) => void;
  }) => {
    const api = useDashboard();
    onReady(api);
    return null;
  };

  describe('updateWidget immediate fast-path', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('flushes a control write to saveDashboard before the 800ms config debounce', async () => {
      const { saveDashboard } = await import('@/services/dashboardService');
      let api!: ReturnType<typeof useDashboard>;
      render(
        <DashboardProvider>
          <Harness
            onReady={(a) => {
              api = a;
            }}
          />
        </DashboardProvider>
      );
      act(() => {
        api.updateWidget(
          'w1',
          { config: { active: 'red' } },
          { immediate: true }
        );
      });
      act(() => {
        vi.advanceTimersByTime(20);
      });
      expect(saveDashboard).toHaveBeenCalledTimes(1);
    });
  });
  ```

  > Note: if `DashboardProvider` needs auth/board fixtures to mount, mirror the provider/mocks used in the nearest existing `context/*.test.tsx`; keep the assertion (immediate flush < debounce window) intact.

- [ ] Run it & expect FAIL: `pnpm vitest run context/DashboardContext.immediate.test.tsx` → fails (signature rejects the 3rd arg / write not flushed immediately).
- [ ] Update the `updateWidget` signature and body (L4659–4664) to accept and record the flag:
  ```tsx
  const updateWidget = useCallback(
    (id: string, updates: Partial<WidgetData>, opts?: { immediate?: boolean }) => {
      if (!activeIdRef.current) return;
      if (isActiveBoardReadOnlyRef.current) return;
      lastLocalUpdateAt.current = Date.now();
      lastUpdateWasSettingsOnly.current = false;
      if (opts?.immediate) pendingImmediateWrite.current = true;
  ```
  (leave the rest of the body L4665–4731 unchanged).
- [ ] Update `updateDashboardSettings` (L5070–5075) the same way:
  ```tsx
  const updateDashboardSettings = useCallback(
    (updates: Partial<Dashboard['settings']>, opts?: { immediate?: boolean }) => {
      if (!activeIdRef.current) return;
      if (isActiveBoardReadOnlyRef.current) return;
      lastLocalUpdateAt.current = Date.now();
      lastUpdateWasSettingsOnly.current = true;
      if (opts?.immediate) pendingImmediateWrite.current = true;
  ```
- [ ] In the debounce-tier logic (L2229–2234), consume the flag so an immediate write wins and resets:
  ```tsx
  const debounceMs = pendingImmediateWrite.current
    ? 0 // remote control write — flush now (Firestore round-trip is the only latency)
    : isStructuralChange
      ? 200 // add/remove widget
      : lastUpdateWasSettingsOnly.current
        ? 100 // settings toggle (spotlight, maximize, etc.)
        : 800; // widget config / position
  ```
- [ ] Reset the flag where the debounce is consumed, alongside `lastUpdateWasSettingsOnly.current = false` at L2238:
  ```tsx
  saveTimerRef.current = setTimeout(() => {
    lastUpdateWasSettingsOnly.current = false; // reset after consuming debounce
    pendingImmediateWrite.current = false; // reset immediate intent after flush
  ```
- [ ] Update the `DashboardContextType` signatures in `types.ts` for `updateWidget` and `updateDashboardSettings` to add the optional `opts?: { immediate?: boolean }` parameter, and update any `liveActionsRef`/wrapper call sites in `DashboardContext.tsx` (e.g. L5389–5391) to forward the 3rd arg.
- [ ] Run it & expect PASS: `pnpm vitest run context/DashboardContext.immediate.test.tsx` → passes.
- [ ] Run the existing context suite to confirm no regression: `pnpm vitest run context/` → passes.
- [ ] Commit: `git add context/DashboardContext.tsx context/DashboardContext.immediate.test.tsx types.ts && git commit -m "[AI] Remote v2: immediate-write fast-path through updateWidget/updateDashboardSettings"`

---

### Task 3: Live two-way sync + connection status + last-synced + tap feedback

Reflect the live context snapshot without requiring manual Sync (keep the 5s echo guard), add a connection chip + last-synced indicator, and thread `immediate` through the write-through handlers.

**Files:**

- Create: `components/remote/useRemoteConnection.ts`
- Create: `components/remote/useRemoteConnection.test.tsx`
- Modify: `components/remote/MobileRemoteView.tsx` — handlers L195–236, top bar L324–385
- Create: `components/remote/MobileRemoteView.test.tsx`

Steps:

- [ ] Write the failing test `components/remote/useRemoteConnection.test.tsx`:

  ```tsx
  import { renderHook, act } from '@testing-library/react';
  import { describe, it, expect, vi } from 'vitest';
  import { useRemoteConnection } from './useRemoteConnection';

  describe('useRemoteConnection', () => {
    it('starts connected and updates lastSyncedAt when markSynced is called', () => {
      vi.useFakeTimers().setSystemTime(new Date('2026-06-13T10:00:00Z'));
      const { result } = renderHook(() => useRemoteConnection());
      expect(result.current.status).toBe('connected');
      expect(result.current.lastSyncedAt).toBeNull();
      act(() => {
        result.current.markSynced();
      });
      expect(result.current.lastSyncedAt).toBe(
        Date.parse('2026-06-13T10:00:00Z')
      );
      vi.useRealTimers();
    });

    it('reports reconnecting when the browser goes offline', () => {
      const { result } = renderHook(() => useRemoteConnection());
      act(() => {
        Object.defineProperty(navigator, 'onLine', {
          configurable: true,
          value: false,
        });
        window.dispatchEvent(new Event('offline'));
      });
      expect(result.current.status).toBe('reconnecting');
    });
  });
  ```

- [ ] Run it & expect FAIL: `pnpm vitest run components/remote/useRemoteConnection.test.tsx` → fails (module missing).
- [ ] Implement `components/remote/useRemoteConnection.ts`:

  ```tsx
  import { useCallback, useEffect, useState } from 'react';

  export type RemoteConnectionStatus = 'connected' | 'reconnecting';

  export interface RemoteConnection {
    status: RemoteConnectionStatus;
    lastSyncedAt: number | null;
    markSynced: () => void;
  }

  /**
   * Drives the remote's connection chip + last-synced indicator. Uses the
   * browser online/offline signal as a cheap proxy for Firestore reachability
   * (no new channel); `markSynced` is called whenever a fresh context snapshot
   * is reflected so "updated just now" stays honest.
   */
  export const useRemoteConnection = (): RemoteConnection => {
    const [status, setStatus] = useState<RemoteConnectionStatus>(
      typeof navigator !== 'undefined' && navigator.onLine === false
        ? 'reconnecting'
        : 'connected'
    );
    const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

    useEffect(() => {
      const online = () => setStatus('connected');
      const offline = () => setStatus('reconnecting');
      window.addEventListener('online', online);
      window.addEventListener('offline', offline);
      return () => {
        window.removeEventListener('online', online);
        window.removeEventListener('offline', offline);
      };
    }, []);

    const markSynced = useCallback(() => setLastSyncedAt(Date.now()), []);
    return { status, lastSyncedAt, markSynced };
  };
  ```

- [ ] Run it & expect PASS: `pnpm vitest run components/remote/useRemoteConnection.test.tsx` → passes.
- [ ] Commit: `git add components/remote/useRemoteConnection.ts components/remote/useRemoteConnection.test.tsx && git commit -m "[AI] Remote v2: useRemoteConnection hook for connection chip + last-synced"`
- [ ] Write the failing test `components/remote/MobileRemoteView.test.tsx` (live-sync reflection + pending-guard echo + connection chip). Mock `useDashboard`/`useAuth` per `RemoteControlMenu.test.tsx`:

  ```tsx
  import { render, screen, act } from '@testing-library/react';
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { MobileRemoteView } from './MobileRemoteView';
  import { useDashboard } from '@/context/useDashboard';
  import { useAuth } from '@/context/useAuth';

  vi.mock('@/context/useDashboard', () => ({ useDashboard: vi.fn() }));
  vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }));
  vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k }),
  }));

  const board = (active: string | undefined) => ({
    id: 'b1',
    name: 'Board 1',
    widgets: [
      { id: 'tl', type: 'traffic', z: 1, config: { active }, version: 1 },
    ],
    settings: {},
  });

  describe('MobileRemoteView live sync', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        remoteControlEnabled: true,
      });
    });

    it('reflects a new context snapshot without a manual Sync tap', () => {
      const updateWidget = vi.fn();
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        activeDashboard: board(undefined),
        updateWidget,
        updateDashboardSettings: vi.fn(),
        loadDashboard: vi.fn(),
        dashboards: [board(undefined)],
      });
      const { rerender } = render(<MobileRemoteView />);
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        activeDashboard: board('green'),
        updateWidget,
        updateDashboardSettings: vi.fn(),
        loadDashboard: vi.fn(),
        dashboards: [board('green')],
      });
      act(() => rerender(<MobileRemoteView />));
      expect(
        screen.getByRole('button', { name: /Set traffic light to Green/i })
      ).toHaveAttribute('aria-pressed', 'true');
    });

    it('renders a Connected status chip', () => {
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        activeDashboard: board(undefined),
        updateWidget: vi.fn(),
        updateDashboardSettings: vi.fn(),
        loadDashboard: vi.fn(),
        dashboards: [board(undefined)],
      });
      render(<MobileRemoteView />);
      expect(screen.getByText(/Connected/i)).toBeInTheDocument();
    });
  });
  ```

  > Note: the live-sync reflection already exists (L148–178) — this test pins that behavior before the chip change so the refactor can't regress it.

- [ ] Run it & expect FAIL: `pnpm vitest run components/remote/MobileRemoteView.test.tsx` → the "Connected" chip assertion fails (chip not rendered yet); reflection assertion may already pass.
- [ ] In `MobileRemoteView.tsx`, import and use the hook near the other hooks (after L76): `const conn = useRemoteConnection();` and call `conn.markSynced()` inside the live auto-sync effect (after the `setLocalWidgets(...)` reconciliation, ~L177) and in `handleSync` (~L188).
- [ ] Thread `immediate` through the write-through handlers. `handleUpdateWidget` (L216) becomes `ctxUpdateWidget(id, updates, { immediate: true });` and `handleUpdateDashboardSettings` (L233) becomes `ctxUpdateDashboardSettings(updates, { immediate: true });` — every remote control write is intent-classified as immediate.
- [ ] Add the connection chip + last-synced indicator to the top bar. Insert into the centre column (replace the static subtitle at L348–353):
  ```tsx
  <div className="flex flex-col items-center gap-0.5">
    <span className="text-white font-black text-sm truncate max-w-40">
      {activeDashboard.name}
    </span>
    <span className="flex items-center gap-1.5 text-xs">
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          conn.status === 'connected'
            ? 'bg-green-400'
            : 'bg-amber-400 animate-pulse'
        }`}
      />
      <span
        className={
          conn.status === 'connected' ? 'text-white/50' : 'text-amber-300'
        }
      >
        {conn.status === 'connected' ? 'Connected' : 'Reconnecting…'}
      </span>
      {conn.lastSyncedAt && (
        <span className="text-white/30">· updated just now</span>
      )}
    </span>
  </div>
  ```
- [ ] Run it & expect PASS: `pnpm vitest run components/remote/MobileRemoteView.test.tsx` → passes.
- [ ] Add tap-feedback to `RemoteWidgetCard` control buttons via the existing `active:scale-95` pattern (already present on Spotlight/Maximize L193/L215) — confirm both control buttons carry `active:scale-95` and add a brief pressed ring: append `focus-visible:ring-2 focus-visible:ring-blue-400/60` to both button `className`s (L193, L215). (Per-control press-confirm is added in Task 6 for the demo-path controls.)
- [ ] Run the remote suite: `pnpm vitest run components/remote/` → passes.
- [ ] Commit: `git add components/remote/MobileRemoteView.tsx components/remote/MobileRemoteView.test.tsx components/remote/RemoteWidgetCard.tsx && git commit -m "[AI] Remote v2: live sync reflection, connection chip, last-synced, immediate writes"`

---

### Task 4: RemoteActivityWallControl (active/pause, QR gate, moderation: pending queue, approve, remove, count badge)

New control reusing the Activity Wall submissions subcollection (path `activity_wall_sessions/{teacherUid}_{activityId}/submissions`) and its read/write shapes. Approve writes `status: 'approved'` via `updateDoc`; remove uses `deleteDoc` (same as the widget's `deleteSubmission`, `Widget.tsx` L1212).

**Files:**

- Create: `components/remote/controls/RemoteActivityWallControl.tsx`
- Create: `components/remote/controls/RemoteActivityWallControl.test.tsx`
- Modify: `components/remote/RemoteWidgetCard.tsx` — import + `renderControls` switch (L73–146)
- Modify: `components/remote/MobileRemoteView.tsx` — add `'activity-wall'` to `REMOTE_SUPPORTED_TYPES` (L40–56)

Steps:

- [ ] Write the failing test `components/remote/controls/RemoteActivityWallControl.test.tsx` using the ActivityWall firebase-mock convention (`Widget.test.tsx` L104–133):

  ```tsx
  import { render, screen, act } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import { describe, it, expect, vi, beforeEach } from 'vitest';

  const mockCollection = vi.fn(() => ({}));
  const mockDoc = vi.fn(() => ({}));
  const mockOnSnapshot = vi.fn();
  const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
  const mockDeleteDoc = vi.fn().mockResolvedValue(undefined);

  vi.mock('@/config/firebase', () => ({ db: {} }));
  vi.mock('firebase/firestore', () => ({
    collection: mockCollection,
    doc: mockDoc,
    onSnapshot: mockOnSnapshot,
    updateDoc: mockUpdateDoc,
    deleteDoc: mockDeleteDoc,
  }));
  vi.mock('@/context/useAuth', () => ({
    useAuth: () => ({
      user: { uid: 'teacher1' },
      canAccessFeature: () => true,
    }),
  }));

  import { RemoteActivityWallControl } from './RemoteActivityWallControl';
  import type { WidgetData } from '@/types';

  const widget = {
    id: 'aw1',
    type: 'activity-wall',
    z: 1,
    version: 1,
    config: {
      activeActivityId: 'act1',
      activities: [{ id: 'act1', title: 'Q', moderationEnabled: true }],
    },
  } as unknown as WidgetData;

  const emitSubmissions = (
    subs: Array<{ id: string; content: string; status: string }>
  ) => {
    const cb = mockOnSnapshot.mock.calls.at(-1)?.[1] as (snap: unknown) => void;
    act(() =>
      cb({
        docs: subs.map((s) => ({ data: () => ({ ...s, submittedAt: 1 }) })),
      })
    );
  };

  describe('RemoteActivityWallControl', () => {
    beforeEach(() => vi.clearAllMocks());

    it('lists pending submissions with a count badge', () => {
      render(
        <RemoteActivityWallControl widget={widget} updateWidget={vi.fn()} />
      );
      emitSubmissions([
        { id: 's1', content: 'hello', status: 'pending' },
        { id: 's2', content: 'world', status: 'approved' },
      ]);
      expect(screen.getByText('hello')).toBeInTheDocument();
      expect(screen.getByText(/1 pending/i)).toBeInTheDocument();
    });

    it('approve fires updateDoc with status approved', async () => {
      const user = userEvent.setup();
      render(
        <RemoteActivityWallControl widget={widget} updateWidget={vi.fn()} />
      );
      emitSubmissions([{ id: 's1', content: 'hello', status: 'pending' }]);
      await user.click(screen.getByRole('button', { name: /approve hello/i }));
      expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), {
        status: 'approved',
      });
    });

    it('remove fires deleteDoc', async () => {
      const user = userEvent.setup();
      render(
        <RemoteActivityWallControl widget={widget} updateWidget={vi.fn()} />
      );
      emitSubmissions([{ id: 's1', content: 'hello', status: 'pending' }]);
      await user.click(screen.getByRole('button', { name: /remove hello/i }));
      expect(mockDeleteDoc).toHaveBeenCalled();
    });

    it('hides the QR affordance when anonymous-join is gated off', () => {
      vi.doMock('@/context/useAuth', () => ({
        useAuth: () => ({
          user: { uid: 'teacher1' },
          canAccessFeature: () => false,
        }),
      }));
      render(
        <RemoteActivityWallControl widget={widget} updateWidget={vi.fn()} />
      );
      expect(
        screen.queryByRole('button', { name: /show join qr/i })
      ).toBeNull();
    });
  });
  ```

- [ ] Run it & expect FAIL: `pnpm vitest run components/remote/controls/RemoteActivityWallControl.test.tsx` → fails (module missing).
- [ ] Implement `components/remote/controls/RemoteActivityWallControl.tsx`:

  ```tsx
  import React, { useEffect, useMemo, useState } from 'react';
  import { Check, Trash2, QrCode, Play, Pause } from 'lucide-react';
  import {
    collection,
    doc,
    onSnapshot,
    updateDoc,
    deleteDoc,
  } from 'firebase/firestore';
  import { db } from '@/config/firebase';
  import { useAuth } from '@/context/useAuth';
  import { WidgetData } from '@/types';

  interface RemoteActivityWallControlProps {
    widget: WidgetData;
    updateWidget: (id: string, updates: Partial<WidgetData>) => void;
  }

  interface RemoteSubmission {
    id: string;
    content: string;
    submittedAt: number;
    status: 'approved' | 'pending';
  }

  interface AWActivity {
    id: string;
    title?: string;
    moderationEnabled?: boolean;
  }

  export const RemoteActivityWallControl: React.FC<
    RemoteActivityWallControlProps
  > = ({ widget, updateWidget }) => {
    const { user, canAccessFeature } = useAuth();
    const canOfferAnonymousJoin = canAccessFeature('anonymous-join');
    const config = widget.config as {
      activeActivityId?: string;
      activities?: AWActivity[];
    };
    const activeActivity =
      config.activities?.find((a) => a.id === config.activeActivityId) ?? null;
    const isActive = Boolean(config.activeActivityId);

    const [submissions, setSubmissions] = useState<RemoteSubmission[]>([]);
    const [showQr, setShowQr] = useState(false);

    const sessionId =
      user && activeActivity ? `${user.uid}_${activeActivity.id}` : null;

    useEffect(() => {
      if (!sessionId) {
        setSubmissions([]);
        return;
      }
      const ref = collection(
        db,
        'activity_wall_sessions',
        sessionId,
        'submissions'
      );
      const unsub = onSnapshot(ref, (snap) => {
        setSubmissions(
          (
            snap as { docs: Array<{ data: () => Record<string, unknown> }> }
          ).docs.map((d) => {
            const data = d.data();
            return {
              id: data.id as string,
              content: (data.content as string) ?? '',
              submittedAt: (data.submittedAt as number) ?? 0,
              status: (data.status as 'approved' | 'pending') ?? 'approved',
            };
          })
        );
      });
      return () => unsub();
    }, [sessionId]);

    const pending = useMemo(
      () => submissions.filter((s) => s.status === 'pending'),
      [submissions]
    );

    const approve = (s: RemoteSubmission) => {
      if (!sessionId) return;
      void updateDoc(
        doc(db, 'activity_wall_sessions', sessionId, 'submissions', s.id),
        { status: 'approved' }
      );
    };

    const remove = (s: RemoteSubmission) => {
      if (!sessionId) return;
      void deleteDoc(
        doc(db, 'activity_wall_sessions', sessionId, 'submissions', s.id)
      );
    };

    const toggleActive = () => {
      updateWidget(widget.id, {
        config: {
          ...config,
          activeActivityId: isActive ? undefined : config.activities?.[0]?.id,
        },
      });
    };

    return (
      <div className="flex flex-col gap-4 p-6 h-full">
        <div className="text-white/60 text-xs uppercase tracking-widest font-bold">
          Activity Wall
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleActive}
            className={`touch-manipulation flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-base transition-all active:scale-95 ${
              isActive ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
            }`}
            aria-label={
              isActive ? 'Pause activity wall' : 'Start activity wall'
            }
            aria-pressed={isActive}
          >
            {isActive ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
            {isActive ? 'Pause' : 'Start'}
          </button>

          {canOfferAnonymousJoin && (
            <button
              onClick={() => setShowQr((v) => !v)}
              className={`touch-manipulation flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-base border transition-all active:scale-95 ${
                showQr
                  ? 'bg-blue-500/20 border-blue-400/60 text-blue-300'
                  : 'bg-white/10 border-white/20 text-white/60'
              }`}
              aria-label={showQr ? 'Hide join QR' : 'Show join QR'}
              aria-pressed={showQr}
            >
              <QrCode className="w-5 h-5" />
              {showQr ? 'Hide QR' : 'Join QR'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-white/50 text-xs uppercase tracking-wide font-bold">
            Pending
          </span>
          <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-amber-400/20 border border-amber-400/50 text-amber-300 text-xs font-black">
            {pending.length} pending
          </span>
        </div>

        <div className="flex-1 overflow-auto flex flex-col gap-2">
          {pending.length === 0 ? (
            <p className="text-white/30 text-sm">No pending submissions.</p>
          ) : (
            pending.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2"
              >
                <p className="flex-1 truncate text-white/80 text-sm">
                  {s.content}
                </p>
                <button
                  onClick={() => approve(s)}
                  className="touch-manipulation w-10 h-10 rounded-full bg-green-500/20 border border-green-400/50 text-green-300 flex items-center justify-center active:scale-95"
                  aria-label={`Approve ${s.content}`}
                >
                  <Check className="w-5 h-5" />
                </button>
                <button
                  onClick={() => remove(s)}
                  className="touch-manipulation w-10 h-10 rounded-full bg-rose-500/20 border border-rose-400/50 text-rose-300 flex items-center justify-center active:scale-95"
                  aria-label={`Remove ${s.content}`}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };
  ```

  > Note: `toggleActive` mirrors the widget's `activeActivityId`-driven active/pause model (`Widget.tsx` L336/L849); approve/remove write directly to the same submissions subcollection (`Widget.tsx` L470–504, L1212) rather than re-deriving the widget's heavier `deleteSubmission` (which also handles Storage cleanup — out of scope for the remote, which only needs the Firestore write). The QR affordance is a local toggle gated by `anonymous-join`; wiring it to the desktop QR popout is a polish follow-up but the gate behavior is tested here.

- [ ] Run it & expect PASS: `pnpm vitest run components/remote/controls/RemoteActivityWallControl.test.tsx` → passes.
- [ ] Register the control in `RemoteWidgetCard.tsx`: add `import { RemoteActivityWallControl } from './controls/RemoteActivityWallControl';` (after L26) and a case in `renderControls` (before `default`, L132):
  ```tsx
      case 'activity-wall':
        return (
          <RemoteActivityWallControl widget={widget} updateWidget={updateWidget} />
        );
  ```
- [ ] Add `'activity-wall'` to `REMOTE_SUPPORTED_TYPES` in `MobileRemoteView.tsx` (after `'webcam'`, L55).
- [ ] Run the remote suite: `pnpm vitest run components/remote/` → passes.
- [ ] Commit: `git add components/remote/controls/RemoteActivityWallControl.tsx components/remote/controls/RemoteActivityWallControl.test.tsx components/remote/RemoteWidgetCard.tsx components/remote/MobileRemoteView.tsx && git commit -m "[AI] Remote v2: RemoteActivityWallControl with live moderation (pending queue, approve, remove, count badge, QR gate)"`

---

### Task 5: RemoteEmbedControl (spotlight/swap always; slide prev/next only if spike PASSED)

Spotlight/swap ships regardless. Slide prev/next is wired **only** if Task 1's verdict was PASS.

**Files:**

- Create: `components/remote/controls/RemoteEmbedControl.tsx`
- Create: `components/remote/controls/RemoteEmbedControl.test.tsx`
- Modify: `components/remote/RemoteWidgetCard.tsx` — import + `renderControls` switch (L73–146)
- Modify: `components/remote/MobileRemoteView.tsx` — add `'embed'` to `REMOTE_SUPPORTED_TYPES` (L40–56)
- Read: `docs/superpowers/spikes/2026-06-13-embed-slide-control.md` (Task 1 verdict)

Steps:

- [ ] Read the spike verdict in `docs/superpowers/spikes/2026-06-13-embed-slide-control.md`. If FAIL (expected), this task ships spotlight/swap only and slide controls are omitted.
- [ ] Write the failing test `components/remote/controls/RemoteEmbedControl.test.tsx`:

  ```tsx
  import { render, screen } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import { describe, it, expect, vi } from 'vitest';
  import { RemoteEmbedControl } from './RemoteEmbedControl';
  import type { WidgetData } from '@/types';

  const widget = {
    id: 'em1',
    type: 'embed',
    z: 1,
    version: 1,
    maximized: false,
    config: {
      mode: 'url',
      url: 'https://docs.google.com/presentation/d/abc/edit',
    },
  } as unknown as WidgetData;

  describe('RemoteEmbedControl', () => {
    it('feature-on-board (swap) maximizes the embed', async () => {
      const user = userEvent.setup();
      const updateWidget = vi.fn();
      render(
        <RemoteEmbedControl widget={widget} updateWidget={updateWidget} />
      );
      await user.click(
        screen.getByRole('button', { name: /feature on board/i })
      );
      expect(updateWidget).toHaveBeenCalledWith('em1', {
        maximized: true,
        flipped: false,
      });
    });
  });
  ```

- [ ] Run it & expect FAIL: `pnpm vitest run components/remote/controls/RemoteEmbedControl.test.tsx` → fails (module missing).
- [ ] Implement `components/remote/controls/RemoteEmbedControl.tsx` (spotlight/swap only; the Spotlight toggle in `RemoteWidgetCard` header already covers spotlight, so this control owns the "feature on board" swap/maximize + an explicit large tap target):

  ```tsx
  import React from 'react';
  import { Maximize, Minimize2 } from 'lucide-react';
  import { WidgetData } from '@/types';

  interface RemoteEmbedControlProps {
    widget: WidgetData;
    updateWidget: (id: string, updates: Partial<WidgetData>) => void;
  }

  export const RemoteEmbedControl: React.FC<RemoteEmbedControlProps> = ({
    widget,
    updateWidget,
  }) => {
    const isMaximized = widget.maximized ?? false;
    const toggleFeature = () => {
      updateWidget(widget.id, { maximized: !isMaximized, flipped: false });
    };

    return (
      <div className="flex flex-col items-center gap-6 p-6 h-full justify-center">
        <div className="text-white/60 text-xs uppercase tracking-widest font-bold">
          Embed
        </div>
        <p className="text-white/40 text-sm text-center max-w-xs">
          Feature this embed full-screen on the classroom board. Use Spotlight
          in the header to overlay it without maximizing.
        </p>
        <button
          onClick={toggleFeature}
          className={`touch-manipulation flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-lg shadow-lg transition-all active:scale-95 ${
            isMaximized
              ? 'bg-blue-500/20 border border-blue-400/60 text-blue-300'
              : 'bg-blue-500 text-white'
          }`}
          aria-label={isMaximized ? 'Exit full screen' : 'Feature on board'}
          aria-pressed={isMaximized}
        >
          {isMaximized ? (
            <>
              <Minimize2 className="w-6 h-6" /> Exit Full Screen
            </>
          ) : (
            <>
              <Maximize className="w-6 h-6" /> Feature on Board
            </>
          )}
        </button>
      </div>
    );
  };
  ```

  > Note: slide prev/next is intentionally omitted — `convertToEmbedUrl` rewrites Google Slides URLs to `/presentation/d/<id>/preview` and clears `search`/`hash` (`utils/urlHelpers.ts` L162–164), so no iframe-src slide-index contract survives. If the spike verdict is PASS, add a prev/next row here that writes a slide param into a new `EmbedConfig.slideIndex` field AND a bypass in the embed URL pipeline that preserves it for `pubembed` URLs — but only under a PASS verdict.

- [ ] Run it & expect PASS: `pnpm vitest run components/remote/controls/RemoteEmbedControl.test.tsx` → passes.
- [ ] Register in `RemoteWidgetCard.tsx`: add `import { RemoteEmbedControl } from './controls/RemoteEmbedControl';` (after L26) and a case before `default` (L132):
  ```tsx
      case 'embed':
        return <RemoteEmbedControl widget={widget} updateWidget={updateWidget} />;
  ```
- [ ] Add `'embed'` to `REMOTE_SUPPORTED_TYPES` in `MobileRemoteView.tsx` (after `'activity-wall'`).
- [ ] Run the remote suite: `pnpm vitest run components/remote/` → passes.
- [ ] Commit: `git add components/remote/controls/RemoteEmbedControl.tsx components/remote/controls/RemoteEmbedControl.test.tsx components/remote/RemoteWidgetCard.tsx components/remote/MobileRemoteView.tsx && git commit -m "[AI] Remote v2: RemoteEmbedControl (spotlight/swap; slide nav gated on spike)"`

---

### Task 6: UI/UX polish pass (demo-path controls only)

Tighten the controls Paul will drive: timer, traffic, poll, noise (sound), schedule, clock, plus the new Activity Wall control. Larger tap targets, clearer active/selected states, projector-dark styling, per-control press-confirm.

**Files:**

- Modify: `components/remote/controls/RemoteTrafficLightControl.tsx`
- Modify: `components/remote/controls/RemotePollControl.tsx`
- Modify: `components/remote/controls/RemoteSoundControl.tsx`
- Modify: `components/remote/controls/RemoteScheduleControl.tsx`
- Modify: `components/remote/controls/RemoteClockControl.tsx`
- Modify: `components/remote/controls/RemoteTimerControl.tsx`
- Test: re-run the full remote suite after each change

Steps:

- [ ] Read each demo-path control file and confirm interactive buttons carry `touch-manipulation`, a minimum tap target (`w`/`h` ≥ `12` / `min-h-12`), `active:scale-95`, and an explicit active state (e.g. `aria-pressed` + a high-contrast `bg-*`/`border-*`). The traffic control (`RemoteTrafficLightControl.tsx`) is the reference for active-state contrast.
- [ ] For `RemoteTrafficLightControl.tsx`: confirm the three light buttons (L57–77) already meet the bar (`w-32 h-32`, `touch-manipulation`, `active:scale-95`, `aria-pressed`). No change required — record as verified.
- [ ] For each of `RemotePollControl.tsx`, `RemoteSoundControl.tsx`, `RemoteScheduleControl.tsx`, `RemoteClockControl.tsx`, `RemoteTimerControl.tsx`: add `touch-manipulation` and `active:scale-95` to any control button missing them, bump any sub-`min-h-12` primary action button to at least `min-h-12`, and add a pressed-confirm ring (`focus-visible:ring-2 focus-visible:ring-blue-400/60`). Do not change control logic or write shapes — visual classes only.
- [ ] Run the full remote suite after the polish edits: `pnpm vitest run components/remote/` → passes (no behavioral assertions break — these are class-only changes).
- [ ] Run lint to catch any class/JSX issues before commit: `pnpm exec eslint components/remote --max-warnings 0` → clean.
- [ ] Commit: `git add components/remote/controls && git commit -m "[AI] Remote v2: demo-path control polish (tap targets, active states, projector styling)"`

---

### Task 7: Manual two-device smoke-test checklist (acceptance gate)

Markdown checklist only — the real acceptance gate before Tuesday. No code.

**Files:**

- Create: `docs/superpowers/checklists/2026-06-13-remote-v2-smoke-test.md`

Steps:

- [ ] Create `docs/superpowers/checklists/2026-06-13-remote-v2-smoke-test.md` with this content:

  ```markdown
  # Remote Control v2 — Two-Device Smoke Test (acceptance gate, pre-Tuesday)

  Setup: projected board open on desktop (logged in), phone open to
  `/remote?boardId=<id>` (same account). Test on the dev preview, then
  re-run once on `main` after deploy.

  ## Latency (priority 1)

  - [ ] Timer start/pause/reset reflects on the board in ~300–500ms (reads as instant).
  - [ ] Traffic light colour change reflects near-instantly.
  - [ ] Poll reveal reflects near-instantly.
  - [ ] Structural change (add/remove a widget on desktop) still debounces normally (no thrash).

  ## Reliability + feedback (priority 2)

  - [ ] Connection chip shows "Connected" on a good network.
  - [ ] Toggle phone airplane mode → chip shows "Reconnecting…"; restore → "Connected".
  - [ ] No command is silently dropped across a brief disconnect/reconnect.
  - [ ] "Updated just now" / last-synced indicator updates when the desktop changes the board.
  - [ ] Each control button shows a brief press-confirm (scale/ring) on tap.
  - [ ] Live sync: change a widget on the desktop → the phone reflects it WITHOUT tapping Sync.
  - [ ] Pending-guard: rapidly drive a widget from the phone → the desktop echo does not revert the phone within 5s.

  ## Demo widgets (priority 3)

  - [ ] Timer / stopwatch: start, pause, reset all drive the board.
  - [ ] Traffic light: red/yellow/green/off all drive the board.
  - [ ] Poll: reveal/hide drives the board.
  - [ ] Noise meter (sound): control drives the board.
  - [ ] Schedule: control drives the board.
  - [ ] Clock: control drives the board.

  ## Activity Wall (new)

  - [ ] Start/pause toggles the wall on the board.
  - [ ] Pending count badge matches the number of unapproved submissions.
  - [ ] Approve from the phone moves a submission onto the board.
  - [ ] Remove from the phone deletes the submission from the board.
  - [ ] Join QR button shows only when `anonymous-join` is permitted; hidden cleanly otherwise.

  ## Embed (new)

  - [ ] "Feature on Board" maximizes the embed full-screen; "Exit Full Screen" restores.
  - [ ] Spotlight (header) overlays the embed without maximizing.
  - [ ] If the spike PASSED: slide prev/next advances the deck smoothly when projected.
        If the spike FAILED: confirm slide nav is absent and spotlight/swap is the documented path.

  ## Sign-off

  - [ ] All priority-1 and priority-2 items pass.
  - [ ] All demo widgets pass.
  - [ ] Ready to PR `dev-paul` → `main` and deploy before Tuesday.
  ```

- [ ] Commit: `git add docs/superpowers/checklists/2026-06-13-remote-v2-smoke-test.md && git commit -m "[AI] Remote v2: two-device smoke-test acceptance checklist"`
