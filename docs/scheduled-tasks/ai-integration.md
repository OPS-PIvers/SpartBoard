# AI Integration Health — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Friday_
_Last audited: 2026-06-08_
_Last action: never_

---

## AI Generation Type Map (as of 2026-04-24)

| Generation Type            | Cloud Function              | Client Caller                                       | Rate Limit                         | Loading State      | Error State        | Feature Gate                              |
| -------------------------- | --------------------------- | --------------------------------------------------- | ---------------------------------- | ------------------ | ------------------ | ----------------------------------------- |
| `mini-app`                 | `generateWithAI`            | utils/ai.ts `generateMiniAppCode`                   | `embed-mini-app` specific + global | ✓                  | ✓                  | `canAccessFeature('embed-mini-app')`      |
| `poll`                     | `generateWithAI`            | utils/ai.ts `generatePoll`                          | `smart-poll` specific + global     | ✓                  | ✓                  | `canAccessFeature('smart-poll')`          |
| `dashboard-layout`         | `generateWithAI`            | utils/ai.ts `generateDashboardLayout`               | global only                        | ✓ (`isGenerating`) | ✓ (toast)          | `canAccessFeature('magic-layout')` ✓      |
| `instructional-routine`    | `generateWithAI`            | InstructionalRoutines/LibraryManager.tsx            | global only                        | ✓ (`isGenerating`) | ✓ (`errorMessage`) | ✗ **missing client gate**                 |
| `ocr`                      | `generateWithAI`            | utils/ai.ts `extractTextWithGemini`                 | `ocr` specific + global            | ✓ (`isBusy`)       | ✓                  | `canAccessFeature('gemini-functions')` ✓  |
| `quiz`                     | `generateWithAI`            | utils/ai.ts `generateQuiz`                          | `quiz` specific + global           | ✓                  | ✓                  | widget-level quiz access                  |
| `widget-builder`           | `generateWithAI`            | admin/WidgetBuilder/GeminiPanel.tsx                 | global only                        | ✓ (`loading`)      | ✓ (`error`)        | admin-only panel                          |
| `widget-explainer`         | `generateWithAI`            | admin/WidgetBuilder/GeminiPanel.tsx                 | global only                        | ✓ (`loading`)      | ✓ (`error`)        | admin-only panel                          |
| `blooms-ai`                | `generateWithAI`            | utils/ai.ts `generateBloomsContent`                 | `blooms-ai` specific + global      | ✓ (`aiLoading`)    | ✓ (toast)          | `aiEnabled` flag in admin building config |
| `video-activity`           | `generateVideoActivity`     | utils/ai.ts `generateVideoActivity`                 | per-function rate limit            | ✓                  | ✓                  | feature perm checked                      |
| `transcription`            | `transcribeVideoWithGemini` | utils/ai.ts `transcribeVideoWithGemini`             | per-function rate limit            | ✓                  | ✓                  | feature perm checked                      |
| `guided-learning`          | `generateGuidedLearning`    | GuidedLearning/components/GuidedLearningAIGenerator | None (admin-only server check)     | ✓                  | ✓                  | `isAdmin` check in Widget.tsx (not perm)  |
| `video-activity-recommend` | `generateWithAI`            | utils/ai.ts `recommendVideoForActivity`             | global only                        | ✓                  | ✓                  | ✗ **AIData interface gap (see LOW item)** |

---

## In Progress

_Nothing currently in progress._

---

## Open

### LOW `instructional-routine` AI has no client-side feature permission gate (server-side now fixed)

- **Detected:** 2026-04-17 (originally MEDIUM — downgraded 2026-06-08 after server-side partial fix)
- **File:** components/widgets/InstructionalRoutines/LibraryManager.tsx:71–97
- **Detail:** The "Magic Design" AI button in the InstructionalRoutines library manager calls `generateWithAI` with `type: 'instructional-routine'` without any `canAccessFeature()` or admin check. Server-side `specificFeatureId = 'instructional-routine'` was added in PR #1873, so quota tracking and per-feature rate limiting now apply server-side. However, no client-side gate exists in `LibraryManager.tsx` — any user with widget access can trigger the AI. An admin cannot disable the button independently of the widget without removing widget access entirely.
- **Fix:** In `LibraryManager.tsx`, wrap the Magic Design button with `canAccessFeature('instructional-routine')` from `useAuth()`. To make this work, also add `'instructional-routine'` to the `GlobalFeature` union in types.ts and expose it in `GlobalPermissionsManager.tsx`. This gives admins a toggle independent of widget access.

### MEDIUM `guided-learning` AI entry stale after #1368 rebuild

- **Detected:** 2026-04-24
- **File:** functions/src/index.ts:1823, components/widgets/GuidedLearning/Widget.tsx:591, components/widgets/GuidedLearning/components/GuidedLearningAIGenerator.tsx
- **Detail:** PR #1368 (merged April 21, 2026) rebuilt `generateGuidedLearning` from a single-image function with rate limiting into a multi-image function (up to 10 images, 20 MB cap) gated admin-only server-side. Two regressions relative to the April 17 audit: (1) the cloud function no longer performs any `ai_usage` rate-limit check — any admin can call it unlimited times per day; (2) the client-side gate changed from a feature permission check to a direct `isAdmin` check in `GuidedLearning/Widget.tsx`, meaning no admin can selectively disable this AI feature for certain buildings without removing the widget entirely. The journal table has been updated to reflect current state (see above).
- **Fix:** (a) Restore per-user rate limiting in `generateGuidedLearning` by adding an `ai_usage` check against the global `gemini-functions` daily limit (consistent with other `generateWithAI` functions that are not admin-only). (b) Either keep admin-only behavior (acceptable since GL AI is an admin authoring tool) and document the design intent explicitly in the function's docblock, OR add a `canAccessFeature('guided-learning-ai')` check in `GuidedLearning/Widget.tsx` for finer-grained access control. At minimum, add a JSDoc comment explaining why rate limiting is omitted.

### LOW Hardcoded model string at functions/src/index.ts:2513 (was :2525, :1980, :1714, :1616)

- **Detected:** 2026-04-17
- **File:** functions/src/index.ts:2513 (line number shifts with function additions — confirmed at 2513 as of 2026-06-03)
- **Detail:** The `transcribeVideoWithGemini` function selects a model with `perm.config?.model ?? 'gemini-3.1-flash-lite-preview'`. This duplicates the literal string defined by the `DEFAULT_STANDARD_MODEL` constant at line 124. If the default model is updated, this line will not automatically follow.
- **Fix:** Replace the hardcoded string with `DEFAULT_STANDARD_MODEL`: `perm.config?.model ?? DEFAULT_STANDARD_MODEL`.

### LOW RevealGrid "Sparkles" button uses AI icon for a paste-import feature

- **Detected:** 2026-04-17
- **File:** components/widgets/RevealGrid/Settings.tsx:457, :477
- **Detail:** The "Reveal Grid Set Generator" button displays the `Sparkles` icon (from lucide-react) which visually signals AI assistance, but clicking it only toggles `isPasting` — a text-area paste-import UI for pasting two-column term/definition data. No AI call is made. The icon creates a false expectation and may confuse users or future developers who see `Sparkles` and assume an AI endpoint is being used.
- **Fix:** Option A (correct the icon): Replace `Sparkles` with `ClipboardPaste` or `TableProperties` to accurately represent the paste-import function. Option B (add real AI): Implement an AI generation path using `generateWithAI` with a new `reveal-grid` type that accepts a topic and returns `RevealCard[]`. Option B is preferred as it adds genuine value; in that case the Sparkles icon is correct.

---

## AI Assistance Opportunities (Enhancement — not bugs)

The following widgets have structured config schemas well-suited for AI content population but currently lack any AI generation features:

- **ConceptWeb** (`ConceptWebConfig.nodes: ConceptNode[], edges: ConceptEdge[]`): Trigger = "Generate web" button; prompt = topic string; output = nodes array with labels + edge connections. Model: `generateWithAI` with a new `concept-web` type.
- **SyntaxFramer** (`SyntaxFramerConfig.tokens: SyntaxToken[]`): Trigger = "Generate frame" button; prompt = learning objective or example sentence; output = tokenized sentence with selected tokens pre-masked as vocabulary blanks. Model: standard text generation.
- **GraphicOrganizer** (`GraphicOrganizerConfig.nodes: Record<string, OrganizerNode>`): Trigger = "Fill organizer" button; prompt = topic + selected template type; output = pre-populated node text matching the chosen layout (T-chart, Venn, KWL, Frayer, etc.). Model: standard JSON generation.
- **Checklist** (`ChecklistConfig.items: ChecklistItem[]`): Trigger = "Generate items" button; prompt = task or routine description; output = ordered list of `ChecklistItem` objects. Model: standard JSON generation.

---

## Completed

_2026-06-08: AI integration audit after merging dev-paul. TWO ITEMS MOVED TO COMPLETED: (1) LOW `dashboard-layout no server-side specific permission` — PR #1873 (`fix(functions): register dashboard-layout and instructional-routine in per-feature AI tracking`) added `if (genType === 'dashboard-layout') specificFeatureId = 'dashboard-layout'` and `if (genType === 'instructional-routine') specificFeatureId = 'instructional-routine'` to functions/src/index.ts before this merge. Dashboard-layout LOW item closed. (2) LOW `video-activity-recommend missing from AIData interface` — interface already includes `'video-activity-recommend'` at line 99 (added in a prior merge). Closed. `instructional-routine` MEDIUM item updated: server-side `specificFeatureId` now set (partial fix) but `LibraryManager.tsx` still lacks `canAccessFeature()` client-side gate — severity downgraded from MEDIUM to LOW per partial fix. TODAY's merge (PR #1891: `fix(functions): register widget-builder and widget-explainer in per-feature AI tracking`) adds `specificFeatureId` assignments for `widget-builder` and `widget-explainer` — both are now rate-limited per feature and tracked in adminAnalyticsCompute.ts. These were previously admin-only by UI but had no server-side per-feature quota. Now they are fully tracked. No new generation types added. Hardcoded model string at line 2513 unchanged. RevealGrid, ConceptWeb, GraphicOrganizer, SyntaxFramer, Checklist still without AI generation features. All other items unchanged._

_2026-06-03: AI integration audit. Dev-paul merge brought new files: classroomAddonAuth.ts (no AI calls), classlinkShared.ts (no AI calls), quizCode.ts (no AI calls), studentJoinRouting.ts (no AI calls), runClassroomGradePush.ts (no AI calls). ONE NEW generation type detected: `video-activity-recommend` — implemented in promptMap at functions/src/index.ts:1054 but NOT declared in the `AIData` interface (lines 88-99). Client-side utils/ai.ts correctly lists it at line 88. This is a type consistency gap — added as new LOW item below. Hardcoded model string shifted to line 2513 (was 2525 — same violation, line number update only). instructional-routine gate still missing — MEDIUM item unchanged. guided-learning rate limit — MEDIUM item unchanged. RevealGrid, ConceptWeb, Checklist still without AI features. Table below updated to add video-activity-recommend row._

_2026-05-27: AI integration audit. New commits since 2026-05-18: fix(parseGeminiJson) use depth counter instead of lastIndexOf (safer JSON extraction — no new gen type), feat(spotify) Spotify OAuth Cloud Function added (`spotifyOAuth.ts` — not an AI generation type), feat(smart-notebook) multiple sub-components + page hyperlinks + rotation handle (not AI-related), feat(drawing-widget) toolbar redesign (not AI-related). No new AI generation types added. All 12 generation types from the table remain current. Hardcoded model string confirmed at line 2525 (updated from 1980 above). Verified `transcribeVideoWithGemini` is the function containing the duplicate string at line 2525 (not `generateVideoActivity` as previously noted — `generateVideoActivity` uses `geminiConfig.standardModel` correctly). All other existing open items unchanged._

_2026-05-18: AI integration audit. New commits since 2026-05-13 checked: `fix(ai-draft) 7125a4c6` (per-type question mix fix + drop hallucinated timestamps) — addressed a bug in `generateQuiz` where the AI always produced MC questions despite the quiz type setting; fixed on the functions side, no new integration type added, no new permission gap introduced. No new AI generation types added in collection-level sharing (Plans 1–4), what's-new, or quiz-results-protection PRs. The 12-type table remains current. All existing open items unchanged._

_2026-05-13: Full AI integration audit. All 12 generation types from the table verified: `generateWithAI` and `generateVideoActivity` both perform admin status check + per-user ai_usage rate limiting. `generateGuidedLearning` still has no rate limit (existing MEDIUM item). Model constants: `DEFAULT_ADVANCED_MODEL = 'gemini-3-flash-preview'` and `DEFAULT_STANDARD_MODEL = 'gemini-3.1-flash-lite-preview'` defined as constants; one inline string at line 1980 (`perm.config?.model ?? 'gemini-3.1-flash-lite-preview'`) duplicates the constant. `RevealGrid` Sparkles AI button confirmed stub — no onClick, no AI call. `ConceptWeb`, `SyntaxFramer`, `GraphicOrganizer`, `Checklist` confirmed no AI integration. `pinLoginV1` and `commitRosterPinIndexV1` added since last audit (not AI-related). No `as unknown` JSON parsing found in Settings.tsx AI handlers — not applicable since no Settings panels have AI buttons beyond RevealGrid stub._

### LOW `dashboard-layout` had no server-side per-feature rate limit or specific permission ID

- **Detected:** 2026-05-01
- **Completed:** 2026-06-08
- **File:** functions/src/index.ts (generateWithAI)
- **Resolution:** PR #1873 (`fix(functions): register dashboard-layout and instructional-routine in per-feature AI tracking`) added `if (genType === 'dashboard-layout') specificFeatureId = 'dashboard-layout'` to `functions/src/index.ts`. The function now applies per-feature rate limiting via the `global_permissions/dashboard-layout` doc and tracks usage in `ai_usage` with the `dashboard-layout` suffix.

### LOW `video-activity-recommend` generation type was missing from `AIData` interface

- **Detected:** 2026-06-03
- **Completed:** 2026-06-08
- **File:** functions/src/index.ts (AIData interface)
- **Resolution:** The `AIData` interface now includes `'video-activity-recommend'` at line 99 (added in a prior dev-paul merge before the 2026-06-08 rebase). Also includes `specificFeatureId = 'video-activity-recommend'` (PR #1857). Confirmed at line 643-644 of functions/src/index.ts.
