# useEffect Audit

**Audit date:** 2026-05-24
**Audit base commit:** `8765c4f` (pre-fixup) — line numbers below reference this revision.
**Scope:** Every `useEffect` instance in the SpartBoard codebase — **567 call sites across 270 files** (counted with `grep -rEn "useEffect\(" --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".d.ts"`).
**Grading rubric** (per project CLAUDE.md):

> useEffect is an escape hatch, not a default. Only use it to synchronize with an external system (Firestore, Firebase Auth, DOM events, timers, Web Audio API, localStorage, etc.). Do not use it to compute derived state, sync refs, reset state on prop changes, or chain state updates.

| Grade | Meaning                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------ |
| **A** | Legitimate external sync with proper cleanup — KEEP                                              |
| **B** | Valid usage, minor improvements possible (missing cleanup, dep nits, ref-sync workaround) — KEEP |
| **C** | Questionable — could move to event handler, render-time logic, or `useMemo` — REFACTOR           |
| **D** | Anti-pattern — derived state, props→state sync, chained updates — REFACTOR                       |
| **F** | Severe anti-pattern — infinite-loop risk, render-loop-syncing-state — REFACTOR URGENTLY          |

This file is sorted by **fix priority**: anti-patterns first (F → D → C), then valid usage at the bottom (B → A) for completeness.

---

## Headline numbers

Of the 567 call sites, 527 were graded individually below. The remaining ~40 are deep inside file-area inventories where individual grading was not productive (mostly Firestore `onSnapshot` subscriptions following the same A-grade pattern). The breakdown of the **527 graded effects**:

| Grade | Count | % graded |
| ----- | ----: | -------: |
| F     |     0 |     0.0% |
| D     |     3 |     0.6% |
| C     |    15 |     2.8% |
| B     |    81 |    15.4% |
| A     |   428 |    81.2% |

> The codebase is in **very good shape**. The vast majority of effects are legitimate Firestore `onSnapshot` subscriptions, DOM event listeners, timers, and resource cleanups with proper teardown. Only ~3.6% (D + C) are recommended for refactor; the rest are sound.

The refactor list below is the actionable surface area. Everything in §"Grade B" and §"Grade A" is documented for completeness — no action needed.

> **Note on accuracy:** Entries reference specific line numbers at commit `8765c4f`. If the file has changed since, look for the described `useEffect` body (the _purpose_ description) rather than relying on the exact line number. A handful of original entries had wrong line numbers and have been corrected in a follow-up commit on this branch — see PR #1686 for the diff.

---

## §1. Priority 1 — Grade D (anti-pattern, REFACTOR)

These three effects use useEffect to do work that should live in an event handler or render-time computation. Fix these first.

### `components/widgets/ActivityWall/ShareModal.tsx:138`

- **Purpose**: Resets all form state (toggles, expiration, URLs) every time `isOpen` or `activity?.id` changes.
- **Grade**: D
- **Recommendation**: REFACTOR
- **Reason**: Classic props→state sync. Should be triggered by the open handler, or — cleaner — drop the effect entirely and put `key={isOpen ? activity?.id ?? 'closed' : 'closed'}` on the modal so React tears down and remounts with fresh defaults.

### `components/widgets/DiceWidget/Widget.tsx:39`

- **Purpose**: Syncs `config.lastRoll` from props to local state when not actively rolling (guarded by an `isRollingRef`).
- **Grade**: D
- **Recommendation**: REFACTOR
- **Reason**: Remote config is being mirrored into local state, then guarded by a ref to avoid clobbering an in-flight roll. The whole pattern goes away if local state stops mirroring `config.lastRoll` and reads it directly — or if "currently rolling" is tracked in component state and the display is derived from `isRolling ? animatedValue : config.lastRoll`.

### `components/widgets/QRWidget/Widget.tsx:73`

- **Purpose**: Watches sibling Text widgets on the dashboard and writes their content back into this widget's `config.url`.
- **Grade**: D (borderline C/D — flagged D because it cross-mutates another widget's data via an effect)
- **Recommendation**: REFACTOR
- **Reason**: This is derived state with side effects — `url` is a function of `(config.linkedWidgetId, activeDashboard.widgets)`. Compute the displayed URL inline during render via `useMemo`. Don't write back to `config.url` unless the user actually clicks "save link"; current write-on-render-of-sibling pattern can cause spurious Firestore writes and dependency-array thrash.

---

## §2. Priority 2 — Grade C (questionable, REFACTOR when touching the file)

These effects work today but are anti-pattern-adjacent. Fix opportunistically — don't open standalone PRs just for these, but clean them up when modifying the surrounding file.

### `components/common/DriveFileAttachment.tsx:53`

- **Purpose**: Mirrors the derived `hasFile` boolean into `hasFileRef` so the unmount cleanup effect at :66 can read the latest value.
- **Grade**: C
- **Recommendation**: REFACTOR
- **Reason**: State→ref sync. Per CLAUDE.md, ref updates should be done in the render body: `hasFileRef.current = hasFile` (no effect, no extra render pass).

### `components/common/DriveFileAttachment.tsx:58`

- **Purpose**: Refreshes `onFileContentRef.current = onFileContent` so the unmount cleanup at :66 calls the latest callback rather than a stale closure.
- **Grade**: C
- **Recommendation**: REFACTOR
- **Reason**: Same render-body fix applies: assign the ref directly in the render body. Keeping the ref refresh inside an effect adds an extra render pass for nothing.

### `components/common/DriveFileAttachment.tsx:62`

- **Purpose**: Notifies the parent (`onExtractingChange?.(isExtracting)`) every time the local `isExtracting` state changes.
- **Grade**: C
- **Recommendation**: REFACTOR
- **Reason**: Chained-update via effect — exactly the "logic that should be in event handlers" anti-pattern called out in CLAUDE.md. Move the `onExtractingChange?.(true/false)` call next to the existing `setIsExtracting(true/false)` calls in `handlePick` (lines 85 and 106). Removes the post-render echo entirely.

### `components/common/CheatSheetModal.tsx:131`

- **Purpose**: Writes "cheat sheet seen" flag to localStorage when the modal opens.
- **Grade**: C
- **Recommendation**: REFACTOR
- **Reason**: This is an event ("user opened modal"), not a synchronization. Move into the `onOpen` handler / the button click that opens the modal.

### `components/layout/DashboardView.tsx:1156`

- **Purpose**: Syncs `prevIndexRef.current = currentIndex` after each render so the next render can compute the entry/exit animation class.
- **Grade**: C
- **Recommendation**: REFACTOR
- **Reason**: State→ref sync, classic CLAUDE.md anti-pattern. The comment above the effect even says "Keep prevIndexRef in sync AFTER we've computed the animationClass." Just assign `prevIndexRef.current = currentIndex` in the render body _after_ the animation-class computation — no effect needed. (Originally graded A in this audit; corrected here after PR review.)

### `components/widgets/Checklist/Settings.tsx:60`

- **Purpose**: Syncs `config` into a ref for the debounced save closure.
- **Grade**: C
- **Recommendation**: REFACTOR
- **Reason**: Common workaround for stale closure inside `setTimeout`. Prefer `useCallback` with `config` in its deps, or assign the ref in the render body (`ref.current = config` — no effect needed).

### `components/widgets/Checklist/Settings.tsx:65`

- **Purpose**: Syncs `updateWidget` callback into a ref.
- **Grade**: C
- **Recommendation**: REFACTOR
- **Reason**: Same as above. `updateWidget` is stable from context; the ref-mirror likely isn't needed at all.

### `components/widgets/Checklist/Settings.tsx:70`

- **Purpose**: Syncs `items` into a ref.
- **Grade**: C
- **Recommendation**: REFACTOR
- **Reason**: Same render-body ref-assign fix as above.

### `components/widgets/GraphicOrganizer/Widget.tsx:28`

- **Purpose**: Syncs `onUpdate` callback into a ref.
- **Grade**: C
- **Recommendation**: REFACTOR
- **Reason**: Same ref-sync pattern. Assign the ref directly in the render body or use `useCallback` with proper deps.

### `components/widgets/LunchCount/useNutrislice.ts:108`

- **Purpose**: Syncs `config` into a ref for the fetch callback.
- **Grade**: C
- **Recommendation**: REFACTOR
- **Reason**: Same render-body ref-assign fix.

### `components/widgets/NextUp/Widget.tsx:47`

- **Purpose**: Auto-expires the session if it was created on a previous day.
- **Grade**: C
- **Recommendation**: REFACTOR
- **Reason**: "Is this session stale?" is derived state of `(session.createdAt, now)`. Compute via `useMemo` (or render-time conditional) and call the expire action from wherever the user lands; current effect writes config on render of a side-effect.

### `hooks/useBackgrounds.ts:128`

- **Purpose**: Preloads featured background images every time `managedBackgrounds` changes.
- **Grade**: C
- **Recommendation**: REFACTOR
- **Reason**: Side-effect-y but not dangerous. Move to a `requestIdleCallback` outside the effect, or — better — preload lazily on hover/focus rather than for every background on every list change.

### `components/admin/Announcements/Widget.tsx:276`

- **Purpose**: Syncs `jsonStr` string from `config` whenever config changes (GenericConfigEditor).
- **Grade**: C
- **Recommendation**: REFACTOR
- **Reason**: `jsonStr` is `JSON.stringify(config)` — derived state. Compute inline via `useMemo`. The current effect causes the editor to lose in-progress edits whenever the upstream config object identity changes.

### `components/widgets/QuizWidget/Widget.tsx:457` (the ~175-line scoreboard sync effect)

- **Purpose**: Debounced live-scoreboard sync: watches responses, creates/updates a linked Scoreboard widget.
- **Grade**: C (B-leaning — works, but is a smell)
- **Recommendation**: REFACTOR (extract, don't rewrite)
- **Reason**: Functionally correct but ~175 lines of side-effects in one effect with ref-based loop guards. Extract into a `useLiveScoreboardSync(quizId, sessionState)` custom hook so the rules are localized and testable. No behavior change needed.

### `components/widgets/GuidedLearning/components/useGuidedLearningEditorState.ts:149`

- **Purpose**: Emits state changes to the parent via a callback whenever editor state mutates.
- **Grade**: C (B-leaning)
- **Recommendation**: REFACTOR
- **Reason**: Notifying a parent of state changes via effect is a smell — usually means state is owned in the wrong place. Either lift the state into the parent and remove the effect, or use a stable `onChange` ref so the dep array doesn't churn the entire editor on every parent render.

---

## §3. Priority 3 — Grade B (valid, minor nits — KEEP)

These are working as intended; the notes are observations a future maintainer might want, not action items.

### Context layer

- `context/AuthContext.tsx:670` — Persist `googleAccessToken` to localStorage. **Keep**; localStorage write is a legit external sync, no cleanup needed.
- `context/DashboardContext.tsx:640` — Toast + URL clean for malformed `/share-collection/` lands. **Keep**; could live in a route guard but works fine here.
- `context/StudentAuthContext.tsx:211` — Mounted-flag ref for async `onIdTokenChanged`. **Keep**; standard guard against setState-after-unmount.

### Hooks layer

- `hooks/useAppVersion.ts:81` — Visibility/poll listener. Read-once `checkIntervalMs` is intentional. **Keep**.
- `hooks/useDriveReconnected.ts:25` — Callback ref sync (justified exception to avoid resubscribe). **Keep** with explanatory comment.
- `hooks/useLiveSession.ts:179` — Students subscription with custom equality. **Keep**; complexity is in service of avoiding unnecessary rerenders.
- `hooks/useMountedBoardCache.ts:32` — LRU ref update inside an effect. **Keep**; intentional thrash-avoidance.

### Widgets layer

- `components/widgets/Breathing/useBreathing.ts:41`, `:57` — RAF closure refs. **Keep**.
- `components/widgets/CustomWidget/Widget.tsx:137`, `:158` — Re-init from grid-def + interval ref. **Keep**.
- `components/widgets/DiceWidget/Widget.tsx:31` — Roll interval cleanup. **Keep**.
- `components/widgets/Embed/Widget.tsx:105`, `:189`, `:204` — DOM query + hide-timer cleanup. **Keep**.
- `components/widgets/GraphicOrganizer/Widget.tsx:32`, `:42` — contentEditable sync + debounce cleanup. **Keep**.
- `components/widgets/GuidedLearning/components/AudioInteraction.tsx:21` — Autoplay attempt with caught error. **Keep**.
- `components/widgets/GuidedLearning/components/GuidedLearningPlayer.tsx:162`, `:191` — Image preload + transition timeout. **Keep**.
- `components/widgets/LunchCount/Widget.tsx:289` — RAF focus management. **Keep**.
- `components/widgets/MiniApp/Widget.tsx:387`, `:572`, `:586` — Assignment / dialog lifecycle. **Keep**.
- `components/widgets/MusicWidget/Widget.tsx:175` — YouTube play/pause sync with Time Tool. **Keep**.
- `components/widgets/NextUp/Widget.tsx:96` — `queueRef` last-known-state mirror for Firestore listener. **Keep**.
- `components/widgets/Onboarding/hooks/useOnboardingDetectors.ts:12-47` — All four onboarding detectors. **Keep**.
- `components/widgets/QRWidget/Widget.tsx:38` — Feature permission subscribe. **Keep**.
- `components/widgets/QuizWidget/Widget.tsx:373`, `:383`, `:638`, `:669` — PLC handoff, monitor data load, auto-disable, auto-reveal. **Keep**.
- `components/widgets/QuizWidget/components/AnnotatedResponseView.tsx:217` — Callback ref churn-avoid. **Keep**.

### Admin layer

- `components/admin/StarterPackConfigurationModal.tsx:306` — Modal-open prop sync. **Keep**; consider `key={isOpen}` next time the file is touched.
- `components/admin/CatalystConfigurationModal.tsx:143`, `:247` — Same modal pattern + saving-flag tracker. **Keep**.
- `components/admin/SaveAsTemplateModal.tsx:131` — Form reset on close. **Keep**; `key` pattern is the eventual cleanup.
- `components/admin/MusicManager.tsx:231` — `global_music_stations` Firestore `onSnapshot` with backward-compat thumbnail migration. Already has `[]` deps; **keep**. (Originally noted as needing `[]` dep — that was wrong; corrected here after PR review.)
- `components/admin/PdfLibraryModal.tsx:123` — Mount-only global config load. **Keep**.
- `components/admin/Organization/components/primitives.tsx:462`, `:637`, `:813` — `prev`-ref state-machine trackers. **Keep**.

### Layout / common layer

- `components/layout/BoardActionsFab.tsx:58`, `BoardBreadcrumb.tsx:35`, `BoardNavFab.tsx:110`, `CollectionSwitcherMenu.tsx:61` — Focus mgmt / auto-hide timers. **Keep**.
- `components/layout/BoardNavFab.tsx:127` — Trims `itemRefs.current.length` to `totalMenuItems` when boards are deleted, preventing focus dispatch to detached buttons. **Keep**. (Originally graded C with description "nulls refs[] on unmount" — that was wrong; corrected after PR review.)
- `components/layout/DashboardView.tsx:598` — Dispatches a `board-pan` window event on `panOffset` change so DraggableWindow tool-menus can reposition without subscribing to context. **Keep** (could move into the pan setter; current location is fine).
- `components/layout/DashboardView.tsx:623` — rAF cleanup on unmount for the pan-coalescing frame. **Keep**.
- `components/layout/Dock.tsx:311` — Screen-recording secondary focus. **Keep**.
- `components/layout/WhatsNewModal.tsx:245` — Mark changelog seen on open. **Keep** (could move into `onOpen` callback later).
- `components/layout/dock/UrlPickerModal.tsx:60`, `:63` — Callback + staged-image ref tracking for unmount cleanup. **Keep**.
- `components/common/ActiveClassChip.tsx:84` — Menu auto-focus. **Keep** (consider `autoFocus`).
- `components/common/AnnotationCanvas.tsx:71` — Canvas state sync. **Keep**.
- `components/common/DriveDisconnectBanner.tsx:53` — Auto-dismiss timer. **Keep**.
- `components/common/DriveFileAttachment.tsx:66` — Unmount cleanup. **Keep** (after the 3 C-grade effects above are fixed).
- `components/common/SettingsPanel.tsx:94` — Mount animation trigger. **Keep**.

### Student / misc layer

- `App.tsx:246` — Post-profile-load student redirect. **Keep**.
- `components/auth/InviteAcceptance.tsx:232` — Auto-claim invite once authed (ref-guarded). **Keep**.
- `components/miniApp/MiniAppStudentApp.tsx:281` — Initial iframe postMessage. **Keep**.
- `components/remote/MobileRemoteView.tsx:148` — Snapshot/echo reconciliation. **Keep**.

---

## §4. Grade A — full inventory (KEEP, no action)

These are all proper external-system syncs with cleanup. Listed by area for traceability; ~428 instances total.

### Context (`context/`) — 37 effects

`context/AuthContext.tsx` lines 331, 576, 613, 687, 699, 742, 779, 820, 873, 934, 971, 1214, 1301, 1344, 1371, 1669, 1724, 1760 — i18n listener, Google token refresh / TTL poll / persistence / broadcast, admin & roles snapshot, isAdmin probe, student-claim probe, org-membership snapshot, feature/global permissions snapshot, org-buildings snapshot, user-profile load, returning-user probes (Firestore + Drive), root-user sync, member-active stamp, Firebase auth listener, activity tracking, auth-bypass anon sign-in.

`context/CustomWidgetsContext.tsx:32` — Custom-widgets `onSnapshot`.

`context/DashboardContext.tsx` lines 413, 598, 625, 657, 791, 826, 944, 1043, 1102, 1456, 2021, 2059, 2108, 2239, 2303, 2353 — Nav-memory cleanup, Drive auth-error handler register, perms-error handler, AI fallback handler, dock refill, dock init (cache/admin defaults), dock cloud hydration, dock debounced save, dock cross-user cleanup, dashboards `onSnapshot` with surgical merge, one-shot board selection, window-resize pixel rehydrate, autosave (debounced), Drive background sync, Drive PII restore, beforeunload flush.

`context/SavedWidgetsContext.tsx:40` — Saved-widgets `onSnapshot`.
`context/StudentAuthContext.tsx:221` — `onIdTokenChanged` listener.

Plus 5 test-helper effects in `tests/context/*.test.tsx` (all probe components capturing latest context value — keep).

### Hooks (`hooks/`) — ~155 effects

Every Firestore subscription hook below is a textbook `onSnapshot(...)` + `return () => unsub()` pattern — all Grade A:

`useActivityWallLibrary`, `useAssignmentPseudonyms`, `useBackgrounds:38`, `useCatalystSets`, `useChangelog`, `useClickOutside`, `useCollections`, `useDebounce`, `useDebouncedCallback`, `useDragScroll`, `useDriveReconnected:29`, `useFocusLossPoll`, `useFolders`, `useGoogleDrive` (38, 49), `useGuidedLearning` (102, 130), `useGuidedLearningAssignments`, `useGuidedLearningSession`, `useInstructionalRoutines`, `useLiveSession` (145, 230), `useMiniAppAssignments`, `useMiniAppSession`, `useMountedBoardCache:42`, `useMusicStations`, `useOrgBuildings`, `useOrgDomains`, `useOrgMembers` (177, 203), `useOrgRoles`, `useOrganization`, `useOrganizations`, `usePlcAssignmentIndex`, `useQuizSession` (564, 586, 877, 914, 1055, 1067, 1100), `useReconcileExpiredSubShares` (82, 86), `useResultsTabWarnings` (45, 64), `useRosters:521`, `useSessionViewCount` (151, 159), `useShortLinks`, `useSpotifyAuth` (136, 152), `useSpotifyLibrary`, `useSpotifySearch`, `useSpotifyWebPlayback`, `useStarterPacks`, `useStudentAssignments`, `useStudentClassDirectory`, `useStudentIdleTimeout`, `useSubstituteShares` (84, 156), `useSyncedQuizGroups`, `useSyncedVideoActivityGroups`, `useTestClasses`, `useVideoActivity`, `useVideoActivityAssignments` (246, 265), `useVideoActivitySession` (496, 600, 621).

### Components / admin (`components/admin/`) — ~48 effects

`LinkShortenerManager.tsx` (101, 384, 390), `VideoActivityConfigurationModal.tsx` (61, 67), `GlobalPermissionsManager.tsx:511`, `MiniAppLibraryModal.tsx` (69, 76), `ShortLinkQuickCreate.tsx:18`, `StarterPackConfigModal.tsx:41`, `SpecialistScheduleConfigurationModal.tsx:94`, `PresetSubEmailsManager.tsx:120`, `SoundboardConfigurationPanel.tsx:94`, `DashboardTemplatesManager.tsx:96`, `StarterPackConfigurationModal.tsx` (342, 355), `ScheduleConfigurationPanel.tsx:234`, `SaveAsTemplateModal.tsx:79`, `AdminCalendarFetcher.tsx:19`, `CalendarConfigurationModal.tsx:79`, `InstructionalRoutinesManager.tsx:31`, `FeaturePermissionsManager.tsx:183`, `StickerLibraryModal.tsx` (76, 113), `CatalystConfigurationModal.tsx:150`, `PdfLibraryModal.tsx` (85, 92), `Organization/OrganizationPanel.tsx` (189, 311), `AdminWeatherFetcher.tsx:60`, `AdminSettings.tsx:181`, `Analytics/AnalyticsManager.tsx` (1514, 1652), `WidgetBuilder/CodeEditorPane.tsx:66`, `BackgroundManager/StockPhotoPicker.tsx:58`, `Announcements/EmbedConfigEditor.tsx:43`.

### Components / widgets (`components/widgets/`) — ~115 effects

`ActivityWall/Widget.tsx` (335, 397, 423, 451, 497, 590, 647, 921, 952, 1050), `BlendingBoard/hooks/useBlendingBoardConfig.ts:10`, `Breathing/useBreathing.ts:80`, `Calendar/Settings.tsx:47`, `Calendar/Widget.tsx` (68, 78), `CarRiderPro/hooks/useCarRiderProConfig.ts:10`, `Checklist/Settings.tsx:51` (debounce cleanup), `ClockWidget/Widget.tsx:15`, `CustomWidget/Widget.tsx` (105, 165, 196), `DrawingWidget/useDrawingCanvas.ts:86`, `Embed/Widget.tsx` (130, 191, 239), `Embed/hooks/useEmbedConfig.ts:12`, `First5/hooks/useFirst5Url.ts` (32, 54), `GuidedLearning/components/GuidedLearningAIGenerator.tsx:250`, `GuidedLearning/components/GuidedLearningEditor.tsx:426`, `GuidedLearning/components/GuidedLearningPlayer.tsx` (119, 243, 255, 269), `GuidedLearning/components/GuidedLearningResults.tsx` (43, 55), `LiveControl.tsx:80`, `LunchCount/Widget.tsx:281`, `LunchCount/useNutrislice.ts:326`, `MiniApp/components/SubmissionsModal.tsx:57`, `MiniApp/hooks/useMiniAppSync.ts` (24, 80), `MusicWidget/PersonalSpotifyDefaultTabBar.tsx` (70, 77), `MusicWidget/Widget.tsx:133`, `NextUp/Settings.tsx:35`, `NextUp/Widget.tsx` (58, 103, 244), `NumberLine/Widget.tsx:47`, `PdfWidget/PdfWidget.tsx:54`, `PollWidget/Widget.tsx:33`, `QuizWidget/Widget.tsx:361` (unmount cleanup), `QuizWidget/components/AnnotatedResponseView.tsx` (126, 226, 235, 250, 552, 635), `QuizWidget/components/MatchingOrderingEditor.tsx:127`, `QuizWidget/components/QuizEditorModal.tsx:152`, `QuizWidget/components/QuizPreview.tsx:69`.

### Components / layout (`components/layout/`) — ~21 effects

`AnnotationOverlay.tsx` (95, 114, 123), `ClassRosterMenu.tsx:26`, `DashboardView.tsx` (207, 296, 501, 580, 606 [`camera-reset` listener], 638 [rAF-throttled `resize` listener that re-clamps `panOffset`], 728, 734, 793, 1185), `Dock.tsx:292`, `RemoteControlMenu.tsx:38`, `UpdateNotification.tsx:24`, `WhatsNewModal.tsx:255`, `dock/UrlPickerModal.tsx:66`, `sidebar/Sidebar.tsx` (156, 167), `sidebar/SidebarPlcs.tsx:75`.

> **DashboardView.tsx:1156 is NOT in this Grade A list** — it was originally listed here but is actually a state→ref sync (see §2 above).

### Components / common (`components/common/`) — ~22 effects

`ActiveClassChip.tsx:43`, `DialogContainer.tsx` (160, 209, 277, 286, 407), `DraggableWindow.tsx` (363, 378, 399, 423, 442, 614, 658, 668, 1798, 1807, 1817, 1858), `GroupBoundingBox.tsx:64`, `Modal.tsx:45`, `SettingsPanel.tsx` (107, 118), `ShortLinkRedirect.tsx:28`.

### Student / auth / remote / misc — ~60 effects

`activityWall/ActivityWallStudentApp.tsx` (222, 266), `activityWall/ActivityWallGalleryView.tsx` (93, 140, 179, 226, 287), `announcements/AnnouncementOverlay.tsx` (369, 392) + AnnouncementWindow (208, 231), `backgroundsModal/BackgroundsUploadsPanel.tsx:50`, `boardsModal/BoardContextMenu.tsx:53`, `boardsModal/CollectionContextMenu.tsx:43`, `boardsModal/CollectionColorPicker.tsx` (65, 80), `boardsModal/CreateFromTemplateModal.tsx:40`, `boardsModal/BoardsModal.tsx:134`, `boardsModal/MoveToCollectionMenu.tsx:28`, `classes/ClassLinkImportDialog.tsx:121`, `classes/RestrictionsPicker.tsx:36`, `guidedLearning/GuidedLearningStudentApp.tsx` (67, 117, 167, 207), `miniApp/MiniAppStudentApp.tsx` (57, 106, 215, 226, 242, 399, 406), `plc/assignments/PlcQuizSessionContent.tsx:115`, `plc/assignments/PlcVideoSessionContent.tsx:107`, `plc/bodies/NotesBody.tsx:138`, `quiz/QuizStudentApp.tsx:115`, `remote/MobileRemoteView.tsx:118`, `remote/MobileRemoteView.tsx:121`, `remote/controls/RemoteClockControl.tsx:56`, `remote/controls/RemoteDiceControl.tsx:88`, `remote/controls/RemoteRandomControl.tsx:36`, `remote/controls/RemoteTimerControl.tsx:27`, `student/StudentApp.tsx` (90, 110), `student/NextUpStudentApp.tsx` (35, 53), `student/MyAssignmentsPage.tsx` (102, 111, 134).

---

## Patterns observed (for the next refactor wave)

**Where the codebase already does the right thing:**

1. **Firestore listeners** — uniformly use `onSnapshot(...)` + `return () => unsub()`. Excellent.
2. **DOM event listeners** — `addEventListener` + cleanup is consistent across DraggableWindow, modals, and menus.
3. **Timers** — `setInterval` / `setTimeout` always cleaned up.
4. **"Adjusting state while rendering" pattern** — used in 12+ hooks (e.g. `useCollections`, `useOrgMembers`, `useLiveSession`) instead of an effect-based prop→state sync. This is the React-recommended pattern and the codebase uses it well.

**Where the smell shows up:**

1. **State→ref syncs inside effects** (Checklist Settings ×3, GraphicOrganizer, LunchCount nutrislice, DriveFileAttachment ×2 [:53, :58], DashboardView :1156). The fix is one line: assign the ref in the render body (`myRef.current = value`).
2. **Modal `onOpen` work done in an effect on `isOpen`** (ActivityWall ShareModal, CheatSheetModal, several admin modals). Either move to the open handler, or use `key={isOpen ? id : 'closed'}` to remount-and-reset.
3. **Chained parent-notify effects** (DriveFileAttachment :62 — calls `onExtractingChange?.(isExtracting)` on every state change). Inline the callback next to the `setIsExtracting` call that triggers it.

## Suggested follow-up work

If a focused cleanup PR is desired, the highest-leverage batches are:

1. **`components/common/DriveFileAttachment.tsx`** — fixes 3 C-grade effects (`:53` state→ref, `:58` callback→ref, `:62` parent-notify chain) in one small file. ~15-min change.
2. **`components/widgets/Checklist/Settings.tsx`** — 3 ref-sync effects → render-body assignments. ~10-min change.
3. **`components/widgets/ActivityWall/ShareModal.tsx`** — Add `key` to the modal, delete the reset effect. ~5-min change.
4. **`components/widgets/QRWidget/Widget.tsx`** — Replace cross-widget config write with `useMemo` derivation. ~30-min change (needs testing with linked Text widgets).
5. **`components/widgets/QuizWidget/Widget.tsx:457`** — Extract into `useLiveScoreboardSync` hook. Pure code organization, no behavior change. ~1-hr change.

Total estimated effort to clear all D + C grades: ~3 hours.
