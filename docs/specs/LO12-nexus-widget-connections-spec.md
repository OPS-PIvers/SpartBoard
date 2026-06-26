# LO12 — Widget Connection Candidates (Nexus)

## 1. Code State vs. Backlog Claim

The nexus.md source doc marks all 9 candidates as `Status: proposed`. The code confirms this exactly: a targeted grep across all component files for every candidate-specific function name, button label, config field, and AI type returns zero matches in production code (the only hits are `docs/nexus.md` itself and one `utils/guidedLearningDriveService.ts` match that is unrelated). All 9 candidates are genuine build-from-zero work.

The 36 implemented connections listed in nexus.md as "Implemented" are also confirmed present in code and are not re-specified here.

---

## 2. Existing Architecture Audit

### 2.1 Current Connection Patterns (Code-Confirmed)

The existing Nexus connections use **four exclusively in-process, config-driven patterns** — there is no event bus, no publish/subscribe channel, and no explicit wiring registry:

**Pattern A — Auto-Trigger** (`expirySignal` → `updateWidget`): Source widget holds a config boolean (`timerEndTriggerRandom: boolean`). When an internal event fires (e.g., the timer's `expirySignal` state), a dedicated `useEffect` scans `activeDashboard.widgets` by type and calls `updateWidget(targetId, { config: { externalTrigger: Date.now() } })`. The target widget's own render effect reacts when the `externalTrigger` numeric field increases. Implemented in `/components/widgets/TimeTool/useTimeTool.ts:194-293`, `/components/widgets/random/RandomWidget.tsx`, `/components/widgets/NextUp/Widget.tsx`.

**Pattern B — Live Sync** (`useEffect`/read on every render): Source widget config is read from `activeDashboard.widgets.find(w => w.type === 'x')` inside the target widget's render or a `useMemo`. No wiring config on either widget — purely type-based lookup of the first matching widget. Implemented in `/components/widgets/QRWidget/Widget.tsx:74-93`, `/components/widgets/SoundWidget/Widget.tsx:46-82`, `/components/widgets/MusicWidget/Widget.tsx:92-158`.

**Pattern C — Spawn**: Source widget calls `addWidget(targetType, { config: {...} })` directly from an event handler. No linking — the spawned widget is standalone. Implemented widely across Webcam, Drawing, Embed, URL, Scoreboard (via quiz), Calendar, Schedule, ActivityWall, BloomsTaxonomy, InstructionalRoutines, Expectations.

**Pattern D — Import**: Target widget's settings panel reads `activeDashboard.widgets` or context rosters and pulls data into its own config on button click. Implemented in Checklist, NextUp, Random, SeatingChart, LunchCount, Poll settings.

### 2.2 Architecture Key Observations

**Type-based singletons, not explicit wiring**: Every existing connection targets the first widget of a given type found in `activeDashboard.widgets`. This is zero-config from the teacher's perspective but limits dashboards to one widget per connection-target type. The live connections (`syncWithTextWidget`, `linkedWeatherWidgetId`) are the only exceptions — they store either a boolean (sync to first text widget) or an explicit widget id (`linkedWeatherWidgetId` on RecessGear Settings) as the wiring reference.

**No event bus**: The dashboard has no message-passing mechanism between widgets. `DashboardCanvasStore` (`/context/dashboardCanvasStore.ts`) is a read-only mirror of DashboardProvider state for performance; it does not support widget-to-widget events. `DashboardContext` (`/context/DashboardContextValue.ts`) exposes `updateWidget`, `addWidget`, and `activeDashboard` — the complete toolset used by all existing connections.

**No `nexusConnections` field on `WidgetData`**: The `WidgetData` interface (`/types.ts:5875`) has no connection registry. Every connection is encoded as a typed boolean or id field inside the source or target widget's specific config interface.

**AI spawn path**: Spawn connections that require AI (`Drawing → Text OCR`, `Embed → MiniApp`, `Webcam → Text`) call `extractTextWithGemini()` or `generateMiniAppCode()` from `utils/ai.ts`, which delegates to `httpsCallable(functions, 'generateWithAI')`. The Cloud Function's `promptMap` in `/functions/src/aiGeneration.ts:577` is the extension point for new AI generation types. `generateGuidedLearning` and `generateVideoActivity` have separate Cloud Functions with their own signatures.

---

## 3. Architecture Decision: The Nexus Model

### Headline Open Decision

**DECISION A (core): Should Nexus connections be encoded as typed config fields on individual widgets (status quo) or as a first-class `nexusConnections` wiring table on `Dashboard`?**

The answer determines whether the 9 candidates extend the existing ad-hoc model or introduce a new layer. This decision gates every implementation detail below.

**Option 1 — Extend the per-widget config model (recommended)**

Continue the existing pattern: each new connection adds a typed config field to the source or target widget's config interface, with behavior driven by that widget's own hooks/effects.

- Pros: zero new infrastructure; new connections are fully self-contained; no migration needed; each candidate can ship independently with no cross-widget coordination code; consistent with all 36 existing connections.
- Cons: cannot generically wire "Widget A → Widget B by id" without knowing widget types; type-based singleton lookup (first matching widget) is sufficient for all 9 candidates; no connection discovery/visualization.
- Recommendation: **Use this for all 9 candidates.** None of the 9 proposed connections needs explicit wiring — they all operate on the first available target widget by type or spawn a new one. The scheduler-based connections (Schedule → Catalyst) are the most complex but still reduceable to a Live Sync config field read in the Catalyst widget.

**Option 2 — Introduce a `nexusConnections` wiring table on `Dashboard`**

Add `nexusConnections: NexusConnection[]` to the `Dashboard` interface. Each entry is `{ id, sourceWidgetId, targetWidgetId, connectionType, config }`. A central `useNexus` hook reads this table and dispatches cross-widget updates.

- Pros: generic; supports multiple instances of the same widget type; enables future Nexus visualization UI.
- Cons: significant new infrastructure (type definition, migration, DashboardContext surface, Firestore rules, provider logic); none of the 9 candidates actually require multi-instance targeting; every existing connection would be grandfathered and inconsistent; high build cost for speculative value.
- Recommendation: **Reject for this build.** Revisit if a future candidate genuinely requires multi-instance explicit wiring.

**Option 3 — Zustand or Jotai event atoms**

A client-side pub/sub store outside React context.

- Pros: decoupled.
- Cons: adds a dependency; every widget must subscribe; ephemeral events won't survive dashboard reload; overkill for what amounts to `updateWidget` calls.
- Recommendation: **Reject.**

**Recommended architecture**: Extend the existing per-widget config model for all 9 candidates. The three non-AI candidates (Checklist → Timer, Webcam/Drawing → Guided Learning, Scoreboard → Stickers) are pure config additions. The six AI-spawn candidates add a prompt type to `AIGenerationType` in `utils/ai.ts` and a corresponding entry in the Cloud Function's `promptMap`.

---

## 4. Candidate Evaluation

All 9 candidates are status: proposed with zero code. Evaluation against the recommended architecture:

| #   | Candidate                        | Pattern           | Effort      | Value     | Feasibility | Architecture Risk | Tracer Candidate |
| --- | -------------------------------- | ----------------- | ----------- | --------- | ----------- | ----------------- | ---------------- |
| 1   | Webcam/Drawing → Guided Learning | Spawn (AI)        | Low         | High      | Very High   | None              | **Yes**          |
| 2   | Checklist → Timer                | Auto-Trigger      | Very Low    | High      | Very High   | None              | **Yes**          |
| 3   | Quiz → Graphic Organizer         | Spawn (AI)        | Medium      | Very High | High        | Low               | No               |
| 4   | Text Widget → Concept Web        | Import (AI)       | Medium      | Very High | High        | Low               | No               |
| 5   | Guided Learning → Quiz           | Spawn (AI)        | Medium      | High      | Medium      | Low               | No               |
| 6   | Video Activity → Guided Learning | Spawn (AI)        | Medium-High | High      | Medium      | Medium            | No               |
| 7   | Quiz → Concept Web               | Spawn (AI)        | Medium      | High      | Medium      | Low               | No               |
| 8   | Scoreboard → Stickers            | Spawn (Threshold) | Low         | Medium    | High        | None              | No               |
| 9   | Schedule → Catalyst              | Live Sync (AI)    | High        | Medium    | Low         | High              | No               |
| 10  | Poll → Graphic Organizer         | Spawn (AI)        | Medium      | Low       | Medium      | Low               | No               |
| 11  | Activity Wall → Hotspot Image    | Spawn (AI)        | High        | Low       | Low         | High              | No               |

### Tracer Recommendation: Candidates 1 + 2

**Build Candidate 2 (Checklist → Timer) first** as the non-AI tracer. It touches exactly one config field, one existing types.ts interface, and two component files. It proves the Auto-Trigger extension pattern is clean and ships in <1 day.

**Build Candidate 1 (Webcam/Drawing → Guided Learning) second** as the AI-spawn tracer. It reuses `generateGuidedLearning()` which already accepts `GuidedLearningImageInput[]` and returns a `GeneratedGuidedLearning` struct, then saves via `useGuidedLearning.saveSet()` and spawns a widget. It touches the existing webcam and drawing capture flows without any Cloud Function changes. Ships in 1-2 days. Together these two tracers validate the full architecture before tackling the six AI-generation candidates that need Cloud Function additions.

**Build order after tracers**: 3 (Quiz → Graphic Organizer), 4 (Text Widget → Concept Web), 7 (Quiz → Concept Web), 5 (Guided Learning → Quiz), 8 (Scoreboard → Stickers), 6 (Video Activity → Guided Learning), 9 (Schedule → Catalyst — lowest priority, highest coupling risk), 10, 11 (low value, may reject).

---

## 5. Data Model

### Open Decision B

**Should new Spawn connections that require saving to Firestore (Guided Learning, Quiz) spawn the widget immediately (with a temporary config) or only after the save succeeds?**

- Option 1 — Save-first, then spawn: Waits for `saveSet()` / quiz save to complete, then calls `addWidget()` with the real id. User sees a loading spinner. Widget id is stable. **Recommended** — consistent with the existing `Calendar → Timer` Spawn which calculates everything synchronously before calling `addWidget`.
- Option 2 — Optimistic spawn: Creates a placeholder widget immediately. Fills in real ids after save. Requires a rollback path on failure.

**Recommendation: Save-first.**

### Open Decision C

**For Checklist → Timer, should duration be per-item (optional `duration` field on `ChecklistItem`) or a single shared per-item duration configured on the Checklist widget?**

- Option 1 — Per-item `duration?: number` on `ChecklistItem` (nexus.md's stated approach): Maximum flexibility. Teaches add duration per item in the Settings panel. Requires a UI change to ChecklistItem edit in Settings.
- Option 2 — Single global duration on `ChecklistConfig` (`checklistAutoTimerDuration?: number`): Simpler, consistent timer; less useful for heterogeneous tasks.

**Recommendation: Per-item `duration?: number`. Consistent with the nexus.md spec and mirrors `ScheduleItem.durationSeconds`.** Only items with a non-zero duration trigger the auto-start. Checklist items without duration skip auto-start silently.

### TypeScript Type Changes

#### `/types.ts`

```typescript
// ChecklistItem — add optional duration
export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  duration?: number; // seconds; when set, auto-starts the active Timer on check-off
}

// TimeToolConfig — add checklist trigger (mirrors timerEndTriggerRandom pattern)
// No change needed: timer is the TARGET, not the source, for Checklist → Timer.

// AIGenerationType — extend with new Cloud Function types (2 new types)
// In utils/ai.ts (not types.ts):
export type AIGenerationType =
  | 'mini-app'
  | 'poll'
  | 'dashboard-layout'
  | 'instructional-routine'
  | 'ocr'
  | 'quiz'
  | 'video-activity'
  | 'video-activity-recommend'
  | 'guided-learning'
  | 'blooms-ai'
  | 'concept-extraction' // NEW: Text → ConceptWeb
  | 'quiz-analysis'; // NEW: Quiz → GraphicOrganizer / ConceptWeb

// CatalystConfig — extend for Schedule sync (Candidate 9 only)
export type CatalystConfig = {
  initialSetId?: string;
  syncWithSchedule?: boolean; // NEW: opt-in to schedule sync
  syncedScheduleSubject?: string; // NEW: last-synced block subject label
  generatedPrompts?: string[]; // NEW: AI-generated prompts from schedule
  generatedPromptsSubject?: string; // NEW: which subject these prompts were made for
};
```

No other type changes are required for the tracer candidates. The six AI-spawn candidates (Candidates 3–7, 10–11) do NOT require new fields on any widget config — they all call `addWidget(targetType, { config: {...} })` with a fully-formed config constructed from AI output.

### Connection Data Model Summary

None of the 9 candidates requires a wiring record on `WidgetData` or `Dashboard`. Each connection is encoded entirely in the source or target widget's existing config or as a new field within that config. The complete data model per candidate:

| Candidate                        | Config Change                                                                                                                              | Location                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Checklist → Timer                | `ChecklistItem.duration?: number`                                                                                                          | `types.ts` `ChecklistItem`                      |
| Webcam/Drawing → Guided Learning | none (pure spawn, no persistent wiring)                                                                                                    | —                                               |
| Quiz → Graphic Organizer         | none (pure spawn)                                                                                                                          | —                                               |
| Text → Concept Web               | none (Import: ConceptWeb's Settings reads Text widgets from `activeDashboard`)                                                             | —                                               |
| Guided Learning → Quiz           | none (pure spawn; Quiz widget loads by its own id)                                                                                         | —                                               |
| Video Activity → Guided Learning | none (pure spawn)                                                                                                                          | —                                               |
| Quiz → Concept Web               | none (pure spawn)                                                                                                                          | —                                               |
| Scoreboard → Stickers            | `ScoreboardTeam.milestoneScore?: number; ScoreboardConfig.milestoneEnabled?: boolean`                                                      | `types.ts` `ScoreboardTeam`, `ScoreboardConfig` |
| Schedule → Catalyst              | `CatalystConfig.syncWithSchedule?: boolean; syncedScheduleSubject?: string; generatedPrompts?: string[]; generatedPromptsSubject?: string` | `types.ts` `CatalystConfig`                     |
| Poll → Graphic Organizer         | none (pure spawn)                                                                                                                          | —                                               |
| Activity Wall → Hotspot Image    | none (pure spawn — blocked on base image UX)                                                                                               | —                                               |

---

## 6. Candidate Specs

### Candidate 2 — Checklist → Timer (Task Timer) [TRACER 1]

**Pattern**: Auto-Trigger

**User Story**: When a checklist item with a duration is checked off, the active Timer widget starts with that item's duration.

**Exact behavior**: On item check-off in `ChecklistWidget`, if the checked item has `duration > 0` and the connection feature is enabled, find the first `time-tool` widget in `activeDashboard.widgets` and call `updateWidget(timerWidgetId, { config: { duration: itemDuration, elapsedTime: itemDuration, isRunning: true, startTime: Date.now(), mode: 'timer' } })`. This mirrors exactly what `Random → Timer` (`autoStartTimer`) does in `/components/widgets/random/RandomWidget.tsx`.

**UI changes**:

- Checklist Settings: add a duration picker per item (text input, seconds, optional). Show only when a "Task Timer" feature toggle is on per widget.
- Checklist Settings: add a `checklistAutoTimer: boolean` toggle to enable the connection. Default: `false` (opt-in, not default behavior).
- Checklist Widget front-face: show a small clock badge on items that have a duration when `checklistAutoTimer` is enabled.

**Files to Create**: None.

**Files to Modify**:

- `/types.ts` — Add `duration?: number` to `ChecklistItem` interface; add `checklistAutoTimer?: boolean` to `ChecklistConfig`.
- `/components/widgets/Checklist/Settings.tsx` — Add "Task Timer" connection section below existing settings. Toggle for `checklistAutoTimer`. Per-item duration input (minutes:seconds or raw seconds). Mirror the `autoStartTimer` UI pattern from `/components/widgets/random/RandomSettings.tsx`.
- `/components/widgets/Checklist/Widget.tsx` (or the check handler in that file) — In the item `handleToggle` callback, after calling `updateWidget` to mark the item done, if `config.checklistAutoTimer` is true and the checked item has `duration > 0`, scan `activeDashboard.widgets` for the first `time-tool` widget and call `updateWidget` with the timer start config. Gate the `activeDashboard` dependency carefully — use the existing pattern from `useTimeTool.ts` where `activeDashboard` is in the effect deps, NOT read from a stale closure.
- `/config/widgetDefaults.ts` — No default change needed; `checklistAutoTimer` defaults to absent (falsy).
- Localization: Add keys to `/locales/en/translation.json` under a `checklist.taskTimer` namespace for the Settings labels.

**Testing**:

- Unit: `tests/components/widgets/Checklist/` — test that checking an item with a duration and `checklistAutoTimer: true` calls `updateWidget` on the timer widget with correct config. Mock `activeDashboard`.
- Unit: test that items without duration, or with `checklistAutoTimer: false`, do NOT call `updateWidget` on any timer.
- E2E: consider a Playwright test analogous to `tests/e2e/nexus_qr_text.spec.ts` — add a checklist with a timed item, check it, verify the timer widget starts.

---

### Candidate 1 — Webcam/Drawing → Guided Learning (AI Image-to-Lesson) [TRACER 2]

**Pattern**: Spawn (AI-generated)

**User Story**: From a captured webcam image or drawing export, the teacher clicks "Send to Guided Learning" and a new Guided Learning set is generated via Gemini and saved, then a Guided Learning widget is spawned pre-loaded on that set.

**Exact behavior**:

1. User clicks the new "Send to Guided Learning" button in the Webcam or Drawing widget action bar.
2. A loading toast appears.
3. The component captures the image as base64 (webcam: existing capture flow at `Widget.tsx:170-179`; drawing: existing canvas export at `/components/widgets/DrawingWidget/Widget.tsx:282-341` which already calls `canvas.toDataURL('image/png')`).
4. Calls `generateGuidedLearning([{ base64, mimeType: 'image/png' }])` from `utils/ai.ts`. This delegates to `httpsCallable(functions, 'generateGuidedLearning')` — **no Cloud Function changes needed**.
5. Constructs a `GuidedLearningSet` from the `GeneratedGuidedLearning` result (mirrors what `GuidedLearningAIGenerator.tsx` does at `/components/widgets/GuidedLearning/components/GuidedLearningAIGenerator.tsx:154-300`).
6. Calls `saveSet(set)` from `useGuidedLearning(user?.uid)` to persist to Firestore + Drive.
7. Calls `addWidget('guided-learning', { config: { view: 'player', playerSetId: savedMetadata.id } })`.
8. Shows a success toast: "Created Guided Learning set: [title]".

**Key dependency**: `useGuidedLearning` must be accessible from the Webcam and Drawing widget contexts. These widgets live inside `DashboardProvider` which sits inside `AuthProvider`. `useGuidedLearning(user?.uid)` can be called locally inside the widget component — confirm that adding a local hook call per widget is acceptable (it creates a Firestore listener per widget instance with this feature). **Alternative**: expose `saveGuidedLearningSet` through `DashboardContext`, similar to how `addWidget` is exposed. The latter is cleaner for multi-instance correctness. **Recommend the DashboardContext path** — a centralized `useGuidedLearning` call already exists in the teacher app via the GuidedLearning widget's own internals; the Webcam/Drawing widgets should share the hook only if they are already calling it, which they are not. The cleanest solution is to add a single `guidedLearningApi` surface to `DashboardContext` (or use a new `useGuidedLearningSpawn` hook that is a thin wrapper over `useGuidedLearning` called once at a shared level). Alternatively, the widgets can call `useGuidedLearning(user?.uid)` directly — each call creates its own Firestore subscription (`onSnapshot` on the collection), which is acceptable for a rarely-used feature.

**Files to Create**: None.

**Files to Modify**:

- `/components/widgets/Webcam/Widget.tsx` — Add "Send to Guided Learning" button in the action bar (alongside existing "Send to Notes" button at line 566). Implement `handleSendToGuidedLearning` callback following the `performSendToNotes` pattern. Add `useGuidedLearning(user?.uid)` hook call. Gate behind `canAccessFeature('gemini-functions')`.
- `/components/widgets/DrawingWidget/Widget.tsx` — Add "Send to Guided Learning" button in the OCR/export action area (alongside `handleSendToText` at line 282). Implement `handleSendToGuidedLearning`. Gate behind `canAccessFeature('gemini-functions')`.
- `/utils/ai.ts` — No changes needed; `generateGuidedLearning` already exists with the correct signature.
- `/locales/en/translation.json` — Add keys for the button label and toast messages.

**Files NOT to Modify**: `/functions/src/aiGeneration.ts` — the `generateGuidedLearning` Cloud Function is complete.

**Testing**:

- Unit mock `generateGuidedLearning` and `useGuidedLearning.saveSet`, verify `addWidget('guided-learning', ...)` is called with `view: 'player'` and the correct `playerSetId`.
- Unit: verify the button is hidden when `canAccessFeature('gemini-functions')` is false.
- No E2E needed in the tracer — the existing GL generator has E2E coverage.

**FERPA note**: Images captured by the webcam must not contain student PII. This connection is teacher-initiated (button click), not automatic. The webcam widget already handles non-PII images (physical documents, whiteboards). No additional FERPA gate needed. The generated Guided Learning set is stored in `/users/{uid}/guided_learning/{id}` (teacher-only read/write) — same as existing sets.

---

### Candidate 3 — Quiz → Graphic Organizer (AI Misconception Map)

**Pattern**: Spawn (AI-generated)

**User Story**: After a quiz, "Analyze Misconceptions" button generates a cause-effect graphic organizer from wrong answers.

**Input data available in `QuizResults`**: `questions: QuizQuestion[]` (text + correctAnswer), `responses: QuizResponse[]` (wrong answers per question). Per-question accuracy is computed inline from these two.

**Exact behavior**: Button click in `QuizResults` view → construct a prompt containing question text, correct answers, and class accuracy percentages → call `callAI({ type: 'quiz-analysis', prompt })` → Cloud Function returns `GraphicOrganizerConfig` JSON → `addWidget('graphic-organizer', { config: result })`.

**Cloud Function changes required**: Add `'quiz-analysis'` to `AIData.type` union in `/functions/src/aiGeneration.ts:17-28` and add entry to `promptMap`. The prompt must instruct Gemini to return `{ templateType: 'cause-effect', nodes: Record<string, OrganizerNode> }` conforming to `GraphicOrganizerConfig`. The existing `OrganizerNode` shape in `types.ts` must be documented in the Cloud Function prompt. Add `'quiz-analysis'` to the `specificFeatureId` mapping.

**Client changes required**: Add `'quiz-analysis'` to `AIGenerationType` in `utils/ai.ts`. Add `generateQuizAnalysis(prompt: string): Promise<GraphicOrganizerConfig>` function to `utils/ai.ts`. Add "Analyze Misconceptions" button to `QuizResults.tsx` (the OverviewTab is the right placement, after the per-question accuracy chart). Gate behind `canAccessFeature('gemini-functions')` and require at least 1 completed response.

**Risk**: Gemini's JSON output for graph data is less deterministic than quiz generation. The Cloud Function must validate node keys and OrganizerNode shape. Fall back to a pre-seeded `frayer` template (empty) if AI output is malformed.

**Files to Modify**: `/functions/src/aiGeneration.ts`, `/utils/ai.ts`, `/components/widgets/QuizWidget/components/QuizResults.tsx`, `/locales/en/translation.json`.

---

### Candidate 4 — Text Widget → Concept Web (AI Concept Extraction) [Import pattern]

**Pattern**: Import (AI-enhanced) from within ConceptWeb Settings

**User Story**: In the Concept Web settings back-face, click "Import from Notes" to extract concepts and edges from any Text widget on the dashboard.

**Exact behavior**: Button in `ConceptWebSettings` → scan `activeDashboard.widgets` for Text widgets (same pattern as `importFromTextWidget` in `/components/widgets/Checklist/Settings.tsx:146-202`) → strip HTML to plain text from the longest or user-selected text widget → call `callAI({ type: 'concept-extraction', prompt: text })` → Cloud Function returns `{ nodes: ConceptNode[], edges: ConceptEdge[] }` → `updateWidget(widget.id, { config: { ...config, nodes: result.nodes, edges: result.edges } })`.

**Cloud Function changes required**: Add `'concept-extraction'` to `AIData.type` union and add to `promptMap`. Prompt instructs Gemini to extract key concepts and labeled relationships. Output must conform to `ConceptNode[]` + `ConceptEdge[]` from `types.ts`. Add to `specificFeatureId` mapping.

**Client changes required**: Add `'concept-extraction'` to `AIGenerationType`. Add `generateConceptExtraction(text: string): Promise<{ nodes: ConceptNode[]; edges: ConceptEdge[] }>` to `utils/ai.ts`. Modify `ConceptWebSettings` to add "Import from Notes" section.

**Files to Modify**: `/functions/src/aiGeneration.ts`, `/utils/ai.ts`, `/components/widgets/ConceptWeb/Settings.tsx`, `/locales/en/translation.json`.

---

### Candidate 7 — Quiz → Concept Web (AI Knowledge Map)

**Pattern**: Spawn (AI-generated)

Nearly identical to Candidate 3. Button in `QuizResults` → call the `'quiz-analysis'` type (same Cloud Function as Candidate 3, different output shape — instead of `GraphicOrganizerConfig`, request `{ nodes: ConceptNode[], edges: ConceptEdge[] }`).

**Decision**: Share the `'quiz-analysis'` Cloud Function prompt type with Candidate 3, but with a different output schema. Or add a distinct `'quiz-concept-map'` type. **Recommend separate types** (`'quiz-analysis'` for Graphic Organizer, `'quiz-concept-map'` for Concept Web) for prompt clarity and independent schema validation. Both can be added in the same Cloud Function PR.

**Files to Modify**: Same as Candidate 3 plus `/components/widgets/ConceptWeb/` if adding a separate spawn path from QuizResults. The button lives in `QuizResults.tsx` alongside the "Analyze Misconceptions" button (Candidate 3) — consider grouping them under an "AI Analysis" section.

---

### Candidate 5 — Guided Learning → Quiz (AI Assessment Generation)

**Pattern**: Spawn (AI-generated)

**Complexity driver**: The Quiz widget loads by quiz id from `/users/{uid}/quizzes/{quizId}`. The generated quiz must be saved to Firestore before spawning the widget. Requires `useQuiz(user?.uid)` and its `createQuiz` / `saveQuiz` methods — analogous to the Guided Learning → Spawn flow in Candidate 1.

**Exact behavior**: "Generate Quiz" button in the GuidedLearning widget's results or editor view → extract lesson step text from the active `GuidedLearningSet` → call `generateQuiz(concatenatedStepText, { MC: 5, FIB: 2 })` → construct `QuizData` → save via `useQuiz.createQuiz()` → `addWidget('quiz', { config: { selectedQuizId: quiz.id, selectedQuizTitle: quiz.title, view: 'editor' } })`.

**No Cloud Function changes needed**: `generateQuiz()` already exists.

**Files to Modify**: `/components/widgets/GuidedLearning/Widget.tsx` (or a dedicated component), `/locales/en/translation.json`.

---

### Candidate 6 — Video Activity → Guided Learning (AI Scene Hotspots)

**Pattern**: Spawn (AI-generated, chained)

**Complexity driver**: This chains `generateVideoActivity` output (which includes timestamps) with `generateGuidedLearning` input (which expects `GuidedLearningImageInput[]` with base64 images). Video frames must be captured as thumbnails. YouTube's thumbnail API provides static images at `https://img.youtube.com/vi/{videoId}/{timestamp}.jpg` but this is not a reliable frame-capture API. **Real screenshot capture requires either a hidden YouTube IFrame or a backend step.**

**Feasibility issue**: The nexus.md score of 3/5 feasibility is optimistic. Capturing frames at specific timestamps client-side requires a YouTube player instance, `seekTo(timestamp)`, and screenshot-on-seek — which is blocked by YouTube's iframe cross-origin policy for `canvas.drawImage`. A workaround is using YouTube's `maxresdefault.jpg` thumbnail (not timestamp-specific) or fetching the video's chapter thumbnail via YouTube Data API. Neither matches "key frame at question timestamp."

**Recommendation**: Defer Candidate 6 until a backend video-thumbnail service is available. The current infrastructure cannot reliably deliver the value proposition (spatially-anchored hotspots at video timestamps). If fast-shipping is required, implement a degenerate version that uses the video's poster thumbnail as a single image and generates GL steps from question text only (no spatial anchoring) — but this loses the "key frame" value.

**Files to Modify if proceeding with degenerate version**: `/components/widgets/VideoActivity/Widget.tsx`, `/utils/ai.ts` (no Cloud Function changes), `/locales/en/translation.json`.

---

### Candidate 8 — Scoreboard → Stickers (Achievement Rewards)

**Pattern**: Spawn (threshold-triggered)

**Exact behavior**: Teacher configures a milestone score per team (or globally) in Scoreboard settings. When `ScoreboardWidget` detects a team's score crosses the threshold on a score increment, call `addWidget('sticker', { config: { icon: 'celebration', label: team.name }, x: scoreboardWidget.x + 20, y: scoreboardWidget.y + 20 })`. Gate on a `milestoneEnabled` boolean (default: false, opt-in).

**Risk**: Repeated score increments (teacher repeatedly clicking the "+" button) may trigger duplicate stickers. Guard with a `lastMilestoneAt: Record<string, number>` field on `ScoreboardConfig` that tracks the last epoch each team's milestone fired. Re-trigger only if the current time is > 30 seconds since `lastMilestoneAt[teamId]`.

**Files to Modify**: `/types.ts` (`ScoreboardTeam` add `milestoneScore?: number`; `ScoreboardConfig` add `milestoneEnabled?: boolean; lastMilestoneAt?: Record<string, number>`), `/components/widgets/Scoreboard/Widget.tsx`, `/components/widgets/Scoreboard/Settings.tsx`, `/locales/en/translation.json`.

---

### Candidate 9 — Schedule → Catalyst (AI Lesson Prompt) [Lowest Priority]

**Pattern**: Live Sync (AI-enhanced)

**Complexity driver**: This is the only candidate that requires a reactive AI call triggered by passive state change (schedule block advancing), not a teacher button click. The Catalyst widget would need a `useEffect` watching the current schedule block subject, debounced, calling Gemini when the subject changes. This creates a "spontaneous AI call" pattern that no other widget uses. Cost: an AI call fires every time the schedule block changes, even without teacher intent. The call could happen mid-lesson when the teacher is already occupied.

**Feasibility issues**:

1. `CatalystConfig` currently only has `initialSetId?: string`. The existing Catalyst widget (`catalyst`, `catalyst-instruction`, `catalyst-visual`) is a set-based display widget — it is not designed to show arbitrary text prompts.
2. The Catalyst widget would need a new display mode for generated prompts (not tied to a set).
3. The Schedule widget exposes block subject via its own config (`ScheduleConfig.schedules[].items[].task`) — the Catalyst widget must scan `activeDashboard.widgets` for a `schedule` widget and read the current block, which requires real-time derived state.
4. AI cost for passive triggers is non-trivial — a teacher with a 6-block schedule would trigger 6+ AI calls per day per Catalyst widget with `syncWithSchedule: true`.

**Recommendation**: Defer Candidate 9. Reopen only if the Catalyst widget architecture is redesigned to support free-form prompt display, and an explicit teacher "Sync now" button (not passive auto-sync) is the trigger model instead of an automatic effect.

---

### Candidate 10 — Poll → Graphic Organizer (AI Results Summary)

**Pattern**: Spawn (AI-generated)

Lower value than Candidates 3 and 7 (poll results are simpler than quiz misconceptions; the organizer adds less insight). Implement after Candidates 3 and 7 are live — the Cloud Function work for `'quiz-analysis'` can be reused for `'poll-analysis'` with a simpler schema. Low priority.

---

### Candidate 11 — Activity Wall → Hotspot Image (AI-Placed Responses)

**Pattern**: Spawn (AI-generated)

Blocked on base image UX: `HotspotImageConfig.baseImageUrl` is required and there is no reasonable default. Teacher would need to pick or paste an image URL before or during AI processing. This adds a blocking interaction step that breaks the "one-click spawn" pattern. Additionally, spatial placement of text responses on an image is a weak use case for the Hotspot Image widget, which is designed for interactive exploration of a specific diagram. **Reject** this candidate as specified. If revisited, the mechanism would need a fundamentally different approach (e.g., a spatial clustering visualization that is not the Hotspot Image widget).

---

## 7. Implementation Map

### Files to Create

None. All 9 candidates are additive changes to existing files.

### Files to Modify (Tracer Phase, Candidates 1 + 2)

**Candidate 2 — Checklist → Timer**

| File                                         | Change                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/types.ts`                                  | Add `duration?: number` to `ChecklistItem`; add `checklistAutoTimer?: boolean` to `ChecklistConfig` |
| `/components/widgets/Checklist/Settings.tsx` | Add "Task Timer" section: toggle + per-item duration inputs                                         |
| `/components/widgets/Checklist/Widget.tsx`   | In item toggle handler, auto-start timer if `checklistAutoTimer && item.duration > 0`               |
| `/locales/en/translation.json`               | `checklist.settings.taskTimer.*` keys                                                               |

**Candidate 1 — Webcam/Drawing → Guided Learning**

| File                                           | Change                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `/components/widgets/Webcam/Widget.tsx`        | Add `handleSendToGuidedLearning` callback and button in action bar            |
| `/components/widgets/DrawingWidget/Widget.tsx` | Add `handleSendToGuidedLearning` callback and button                          |
| `/locales/en/translation.json`                 | `webcam.sendToGuidedLearning`, `drawing.sendToGuidedLearning`, toast messages |

### Files to Modify (Cloud Function Candidates 3, 4, 7)

| File                                                        | Change                                                                                                                                                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/functions/src/aiGeneration.ts`                            | Add `'quiz-analysis'`, `'quiz-concept-map'`, `'concept-extraction'` to `AIData.type` union + `promptMap` entries + `specificFeatureId` mappings                                              |
| `/utils/ai.ts`                                              | Add `'quiz-analysis'`, `'quiz-concept-map'`, `'concept-extraction'` to `AIGenerationType`; add `generateQuizAnalysis()`, `generateQuizConceptMap()`, `generateConceptExtraction()` functions |
| `/components/widgets/QuizWidget/components/QuizResults.tsx` | Add "Analyze Misconceptions" (→ GraphicOrganizer) and "Generate Concept Map" (→ ConceptWeb) buttons in OverviewTab                                                                           |
| `/components/widgets/ConceptWeb/Settings.tsx`               | Add "Import from Notes" section with AI extraction                                                                                                                                           |
| `/locales/en/translation.json`                              | New keys for all buttons and toasts                                                                                                                                                          |

### Files to Modify (Candidates 5, 8)

| File                                            | Change                                                                                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/components/widgets/GuidedLearning/Widget.tsx` | Add "Generate Quiz" button in results/library view                                                                                                       |
| `/types.ts`                                     | Add `ScoreboardTeam.milestoneScore?: number`, `ScoreboardConfig.milestoneEnabled?: boolean`, `ScoreboardConfig.lastMilestoneAt?: Record<string, number>` |
| `/components/widgets/Scoreboard/Widget.tsx`     | Detect milestone cross and call `addWidget('sticker', ...)`                                                                                              |
| `/components/widgets/Scoreboard/Settings.tsx`   | Add milestone configuration UI                                                                                                                           |
| `/locales/en/translation.json`                  | Scoreboard milestone keys                                                                                                                                |

---

## 8. Data Flow

### Checklist → Timer (Candidate 2)

```
ChecklistWidget.handleToggle(itemId)
  → updateWidget(widget.id, { config: { items: [...] } })  // mark item done (Firestore)
  → if (config.checklistAutoTimer && item.duration > 0)
      timerWidget = activeDashboard.widgets.find(w => w.type === 'time-tool')
      if (timerWidget)
        updateWidget(timerWidget.id, {
          config: { mode: 'timer', duration: item.duration, elapsedTime: item.duration,
                    isRunning: true, startTime: Date.now() }
        })  // Firestore write → TimeTool RAF loop picks up isRunning
```

### Webcam/Drawing → Guided Learning (Candidate 1)

```
Webcam/DrawingWidget.handleSendToGuidedLearning()
  → setLoading(true)
  → image = captureCurrentFrame()   // existing canvas.toDataURL() path
  → set = await generateGuidedLearning([{ base64: image, mimeType: 'image/png' }])
      // httpsCallable(functions, 'generateGuidedLearning') — no CF changes
  → glSet = buildGuidedLearningSet(set)   // normalize to GuidedLearningSet shape
  → metadata = await saveSet(glSet)        // Drive + Firestore write
  → addWidget('guided-learning', {
      config: { view: 'player', playerSetId: metadata.id }
    })
  → addToast(`Created "${glSet.title}"`, 'success')
  → setLoading(false)
```

### Quiz → Graphic Organizer (Candidate 3)

```
QuizResults.handleAnalyzeMisconceptions()
  → setLoading(true)
  → prompt = buildMisconceptionPrompt(questions, responses)
      // includes: question text, correct answer, class accuracy %, common wrong answers
  → config = await generateQuizAnalysis(prompt)
      // callAI({ type: 'quiz-analysis', prompt })
      // CF promptMap['quiz-analysis'] → Gemini → GraphicOrganizerConfig JSON
      // CF validates: templateType, nodes shape
  → addWidget('graphic-organizer', { config })
  → setLoading(false)
```

### Text Widget → Concept Web (Candidate 4)

```
ConceptWebSettings.handleImportFromNotes()
  → textWidgets = activeDashboard.widgets.filter(w => w.type === 'text')
  → if (textWidgets.length === 0) → addToast('Add a Text widget first', 'info'); return
  → rawText = stripHtml((textConfig.content))  // pick longest text widget
  → { nodes, edges } = await generateConceptExtraction(rawText)
      // callAI({ type: 'concept-extraction', prompt: rawText })
      // CF promptMap['concept-extraction'] → Gemini → { nodes: ConceptNode[], edges: ConceptEdge[] }
  → updateWidget(widget.id, { config: { ...config, nodes, edges } })
```

---

## 9. Build Sequence

### Phase 1 — Tracer: Checklist → Timer (Candidate 2)

- [ ] Add `duration?: number` to `ChecklistItem` in `/types.ts`
- [ ] Add `checklistAutoTimer?: boolean` to `ChecklistConfig` in `/types.ts`
- [ ] Update Checklist Settings: per-item duration UI + `checklistAutoTimer` toggle
- [ ] Update Checklist Widget: auto-start timer on item check-off
- [ ] Add i18n keys
- [ ] Write unit tests (2 cases: triggers timer / does not trigger)
- [ ] Run `pnpm run validate`

### Phase 2 — Tracer: Webcam/Drawing → Guided Learning (Candidate 1)

- [ ] Add `handleSendToGuidedLearning` to Webcam Widget (with `canAccessFeature` gate)
- [ ] Add `handleSendToGuidedLearning` to Drawing Widget (with `canAccessFeature` gate)
- [ ] Implement loading + error state per widget (reuse existing `isExtracting` pattern in Webcam)
- [ ] Add i18n keys
- [ ] Write unit tests (mock `generateGuidedLearning`, `saveSet`, verify `addWidget` called)
- [ ] Run `pnpm run validate`

### Phase 3 — Cloud Function + Quiz AI Candidates (Candidates 3, 4, 7)

- [ ] Add `'quiz-analysis'`, `'quiz-concept-map'`, `'concept-extraction'` to `AIData.type` in Cloud Function
- [ ] Write `promptMap` entries for all three types (include schema docs in prompts)
- [ ] Add `specificFeatureId` mappings for all three
- [ ] Add Cloud Function unit tests in `functions/src/aiGeneration.ts` area (validate output shapes)
- [ ] Add three new functions to `utils/ai.ts`
- [ ] Add `AIGenerationType` union members
- [ ] Add "Analyze Misconceptions" button to `QuizResults.tsx` (OverviewTab)
- [ ] Add "Generate Concept Map" button to `QuizResults.tsx` (alongside Candidate 3 button)
- [ ] Add "Import from Notes" section to `ConceptWebSettings.tsx`
- [ ] Add i18n keys for all three
- [ ] Run `pnpm run validate` + `pnpm run build:all` (Cloud Functions must type-check)

### Phase 4 — Guided Learning → Quiz (Candidate 5)

- [ ] Add "Generate Quiz" button to GuidedLearning Widget results/library view
- [ ] Implement quiz save + spawn logic (reuse `generateQuiz()` + `useQuiz`)
- [ ] Gate behind `canAccessFeature('gemini-functions')`
- [ ] Add i18n keys
- [ ] Write unit tests
- [ ] Run `pnpm run validate`

### Phase 5 — Scoreboard → Stickers (Candidate 8)

- [ ] Add `milestoneScore?: number` to `ScoreboardTeam` in `/types.ts`
- [ ] Add `milestoneEnabled?: boolean` and `lastMilestoneAt?: Record<string, number>` to `ScoreboardConfig`
- [ ] Add milestone detection in Scoreboard Widget's score-increment handler
- [ ] Add milestone configuration to Scoreboard Settings
- [ ] Add i18n keys
- [ ] Write unit tests (threshold crossing triggers/does not trigger sticker spawn)
- [ ] Run `pnpm run validate`

### Phase 6 — Deferred / Rejected

- [ ] Candidate 6 (Video Activity → Guided Learning): Defer — blocked on video frame capture infrastructure
- [ ] Candidate 9 (Schedule → Catalyst): Defer — Catalyst widget architecture redesign required
- [ ] Candidate 10 (Poll → Graphic Organizer): Implement after Phase 3 using same CF infrastructure
- [ ] Candidate 11 (Activity Wall → Hotspot Image): Reject as specified

---

## 10. Testing Strategy

### Unit Tests

All new Nexus connections must have unit tests in the pattern established by `tests/components/widgets/Stations/nexus.test.ts` and `tests/components/widgets/TimeTool/TimeToolConnection.test.tsx`. Each connection test file tests:

1. The "connection fires" case — correct target widget is updated/spawned with correct config.
2. The "connection does not fire" case — when the feature flag is off or the target widget is absent.
3. The "connection guards duplicates" case (Scoreboard → Stickers only: milestone cooldown).

**New test files**:

- `tests/components/widgets/Checklist/nexus.test.tsx` — Checklist → Timer
- `tests/components/widgets/Webcam/nexus.test.tsx` — Webcam → Guided Learning
- `tests/components/widgets/DrawingWidget/nexus.test.tsx` — Drawing → Guided Learning
- `tests/components/widgets/QuizWidget/nexus.test.tsx` — Quiz → GraphicOrganizer, Quiz → ConceptWeb
- `tests/components/widgets/ConceptWeb/nexus.test.tsx` — Text → ConceptWeb (import)
- `tests/components/widgets/Scoreboard/nexus.test.tsx` — Scoreboard → Stickers

For all AI-spawn candidates: mock `utils/ai.ts` generative functions; assert `addWidget` is called with the correct type and config shape. Do not test Gemini output directly in unit tests.

### Cloud Function Tests

- Add test cases to `functions/src/aiGeneration.ts` test area for the three new prompt types, validating output shape (not AI content).

### E2E Tests (Playwright)

Add one E2E test per tracer:

- `tests/e2e/nexus_checklist_timer.spec.ts` — Checklist → Timer: add checklist widget with a 30-second timed item, check it, verify timer widget shows 30s and is running.
- `tests/e2e/nexus_webcam_guided_learning.spec.ts` — Webcam → Guided Learning: mock `generateGuidedLearning` at the network level using Playwright route intercept; verify GL widget is spawned with `view: 'player'`.

### Firestore Rules Tests

No new Firestore collections or documents are created by any of these candidates. All writes go to existing paths:

- `updateWidget` → `/users/{uid}/dashboards/{dashboardId}` (existing rule: owner read/write)
- `addWidget` → same
- `saveSet` (Candidate 1) → `/users/{uid}/guided_learning/{id}` + Google Drive (existing rule)
- `createQuiz` (Candidate 5) → `/users/{uid}/quizzes/{id}` (existing rule)

**No Firestore rules changes required** for any candidate.

---

## 11. AI Cost and FERPA Implications

### AI Cost

**Candidates 1 (Webcam/Drawing → GL)**: Teacher-initiated button click. One `generateGuidedLearning` call per click (same cost as the existing GL AI Generator). Already tracked via the GL function's own usage counter. No additional cost infrastructure needed.

**Candidates 3, 4, 7 (Quiz → GO, Text → ConceptWeb, Quiz → ConceptWeb)**: Each uses `callAI()` via `generateWithAI` Cloud Function. These consume from the existing per-user daily AI quota tracked in `/ai_usage/{uid}_{today}`. Add `specificFeatureId` mappings so per-feature quotas can be independently throttled by admins. No new Firestore collections needed.

**Candidate 5 (GL → Quiz)**: Uses existing `generateQuiz()` which already tracks against the `quiz` specificFeatureId quota. No changes.

**Candidate 9 (Schedule → Catalyst, deferred)**: IF built, passive auto-trigger AI calls must be heavily rate-limited (at minimum: once per unique subject per teacher per day, enforced client-side with a `lastSyncedSubject` + `lastSyncedAt` guard in the Catalyst config). The cost model for passive AI triggers is fundamentally different from button-click triggers and must be designed separately.

### FERPA

**Quiz analysis (Candidates 3, 7)**: The prompt sent to Gemini includes question text and accuracy statistics. It must NOT include student names, PINs, or individual student responses. The `buildMisconceptionPrompt` helper must aggregate to class-level counts only (e.g., "42% of students chose 'mitosis' instead of 'meiosis'") — never include any student-identifiable data. This mirrors the existing PLC export pattern which similarly aggregates before Cloud calls.

**Text → Concept Web (Candidate 4)**: Text widget content is teacher-authored. No FERPA gate needed.

**Webcam/Drawing → Guided Learning (Candidate 1)**: Webcam captures are teacher-facing (documents, whiteboards). The button must not be accessible during student-facing session modes. Gate with the existing `isLive` widget check if applicable.

---

## 12. Critical Details and Risks

### Risk 1: `activeDashboard` read in widget effects

The existing Auto-Trigger pattern (Timer → RandomWidget) reads `activeDashboard` inside a `useEffect` dep array (see `useTimeTool.ts:282`). This is safe because `activeDashboard` is a new object reference on every widget mutation, so the effect re-runs frequently. For Checklist → Timer, **do not read `activeDashboard` from a stale closure in the toggle handler**. Use the pattern established in `useTimeTool.ts`: pass `activeDashboard` from `useDashboard()` into the component that fires the trigger, and include it in the dependency array of the relevant `useCallback` or `useEffect`. The Checklist item toggle is an event handler (not an effect), so read `activeDashboard` from a ref **assigned directly in the render body** (`dashboardRef.current = activeDashboard;` — no `useEffect`, which would commit a render late and reintroduce the stale-closure bug), mirroring the `runningDisplayTimeRef` pattern, or read the `useDashboard()` value at call time so it isn't captured at component mount.

### Risk 2: Multiple timer widgets on the dashboard

All existing timer triggers target `activeDashboard.widgets.find(w => w.type === 'time-tool')` — the first timer. Candidate 2 (Checklist → Timer) must use the same "first timer" convention for consistency. If a teacher has two timers, behavior is predictable (first timer always wins). Do not introduce per-widget id wiring in Phase 1 — that is a Phase 2+ concern if teachers request it.

### Risk 3: AI output conformance for graph-type candidates (3, 4, 7)

`GraphicOrganizerConfig.nodes` is `Record<string, OrganizerNode>` where keys are semantic role strings (`root`, `cause`, `effect`, etc. — check the actual constants in `GraphicOrganizerConfig` usage). `ConceptNode` and `ConceptEdge` are simpler flat arrays. The Cloud Function must validate output strictly and return an empty/seed config on Gemini parse failure rather than throwing an unhandled error. The `parseGeminiJson` helper in `/functions/src/parseGeminiJson.ts` handles malformed JSON; add a post-parse shape validator.

### Risk 4: `useGuidedLearning` Drive dependency in Webcam/Drawing (Candidate 1)

`useGuidedLearning.saveSet()` calls `getDriveService()` which requires `googleAccessToken` and `isConnected` from `useGoogleDrive`. If the teacher has not connected Drive, `saveSet` throws. Handle this gracefully: catch the Drive error, show a toast "Connect Google Drive to save Guided Learning sets", and do NOT call `addWidget`. Alternatively, check `isConnected` before even triggering the AI call.

### Risk 5: Scoreboard milestone sticker spam (Candidate 8)

A teacher incrementing a team's score repeatedly (fast clicks) could trigger multiple sticker spawns at the same threshold. The `lastMilestoneAt[teamId]` cooldown (30 seconds) guards this. Additionally, milestone should fire only when the score CROSSES the threshold from below, not when it is EQUAL. Use `previousScore < milestone && newScore >= milestone` logic, not `newScore === milestone`.

### Risk 6: Checklist duration UI complexity

Adding per-item duration inputs to the Checklist Settings panel increases settings panel density. Design the duration field as a compact inline input (e.g., `[  ] 2 min` label-inline) that only appears when `checklistAutoTimer` is enabled (progressive disclosure). Do not render duration inputs when the feature is off.

---

## 13. Open Decisions (Need Paul)

### Decision A — Core Architecture (above, Section 3)

Should Nexus connections be encoded as per-widget config fields (recommended — extend status quo) or as a first-class `nexusConnections` table on `Dashboard` (new infrastructure)?

**Recommendation**: Per-widget config fields. All 9 candidates fit. Defer the wiring table until a multi-instance targeting use case actually emerges.

### Decision B — Spawn-then-save vs. Save-then-spawn (Candidates 1, 5)

AI-spawn candidates that require persisting a new resource (Guided Learning set, Quiz) before spawning the widget: should they save first (blocking, shows spinner) or spawn optimistically with a placeholder?

**Recommendation**: Save-first. Simpler rollback logic; widget always opens with a valid resource id.

### Decision C — Checklist item duration: per-item vs. shared

Per-item `duration?: number` on `ChecklistItem` (more flexible, requires Settings UI changes per item) vs. a single `checklistAutoTimerDuration?: number` on `ChecklistConfig` (simpler but less useful)?

**Recommendation**: Per-item, matching the nexus.md spec and the pattern of `ScheduleItem.durationSeconds`. Default to not showing duration inputs until `checklistAutoTimer` toggle is on.
