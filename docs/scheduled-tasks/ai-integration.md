# AI Integration Health — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Friday_
_Last audited: 2026-04-24_
_Last action: never_

---

## AI Generation Type Map (as of 2026-04-24)

| Generation Type         | Cloud Function              | Client Caller                                       | Rate Limit                         | Loading State      | Error State        | Feature Gate                              |
| ----------------------- | --------------------------- | --------------------------------------------------- | ---------------------------------- | ------------------ | ------------------ | ----------------------------------------- |
| `mini-app`              | `generateWithAI`            | utils/ai.ts `generateMiniAppCode`                   | `embed-mini-app` specific + global | ✓                  | ✓                  | `canAccessFeature('embed-mini-app')`      |
| `poll`                  | `generateWithAI`            | utils/ai.ts `generatePoll`                          | `smart-poll` specific + global     | ✓                  | ✓                  | `canAccessFeature('smart-poll')`          |
| `dashboard-layout`      | `generateWithAI`            | utils/ai.ts `generateDashboardLayout`               | global only                        | ✓ (`isGenerating`) | ✓ (toast)          | `canAccessFeature('magic-layout')` ✓      |
| `instructional-routine` | `generateWithAI`            | InstructionalRoutines/LibraryManager.tsx            | global only                        | ✓ (`isGenerating`) | ✓ (`errorMessage`) | ✗ **missing client gate**                 |
| `ocr`                   | `generateWithAI`            | utils/ai.ts `extractTextWithGemini`                 | `ocr` specific + global            | ✓ (`isBusy`)       | ✓                  | `canAccessFeature('gemini-functions')` ✓  |
| `quiz`                  | `generateWithAI`            | utils/ai.ts `generateQuiz`                          | `quiz` specific + global           | ✓                  | ✓                  | widget-level quiz access                  |
| `widget-builder`        | `generateWithAI`            | admin/WidgetBuilder/GeminiPanel.tsx                 | global only                        | ✓ (`loading`)      | ✓ (`error`)        | admin-only panel                          |
| `widget-explainer`      | `generateWithAI`            | admin/WidgetBuilder/GeminiPanel.tsx                 | global only                        | ✓ (`loading`)      | ✓ (`error`)        | admin-only panel                          |
| `blooms-ai`             | `generateWithAI`            | utils/ai.ts `generateBloomsContent`                 | `blooms-ai` specific + global      | ✓ (`aiLoading`)    | ✓ (toast)          | `aiEnabled` flag in admin building config |
| `video-activity`        | `generateVideoActivity`     | utils/ai.ts `generateVideoActivity`                 | per-function rate limit            | ✓                  | ✓                  | feature perm checked                      |
| `transcription`         | `transcribeVideoWithGemini` | utils/ai.ts `transcribeVideoWithGemini`             | per-function rate limit            | ✓                  | ✓                  | feature perm checked                      |
| `guided-learning`       | `generateGuidedLearning`    | GuidedLearning/components/GuidedLearningAIGenerator | None (admin-only server check)     | ✓                  | ✓                  | `isAdmin` check in Widget.tsx (not perm)  |

---

## In Progress

_Nothing currently in progress._

---

## Open

### MEDIUM `instructional-routine` AI has no client-side feature permission gate

- **Detected:** 2026-04-17
- **File:** components/widgets/InstructionalRoutines/LibraryManager.tsx:71–97
- **Detail:** The "Magic Design" AI button in the InstructionalRoutines library manager calls `generateWithAI` with `type: 'instructional-routine'` without any `canAccessFeature()` or admin check. Any user with access to the `instructionalRoutines` widget can call the AI. Server-side rate limiting still applies via the global `gemini-functions` daily limit (no specific per-feature limit exists for this type), so quota exhaustion is the only protection. There is no way for an admin to disable the AI button for this widget without removing widget access entirely.
- **Fix:** (a) Add a specific `instructional-routine` entry to `GlobalFeature` in types.ts and `GlobalPermissionsManager.tsx`, set `specificFeatureId = 'instructional-routine'` in the cloud function's rate-limit logic. (b) In `LibraryManager.tsx`, wrap the Magic Design button with `canAccessFeature('instructional-routine')` from `useAuth()`, so admins can toggle it independently of the widget.

### MEDIUM `guided-learning` AI entry stale after #1368 rebuild

- **Detected:** 2026-04-24
- **File:** functions/src/index.ts:1823, components/widgets/GuidedLearning/Widget.tsx:591, components/widgets/GuidedLearning/components/GuidedLearningAIGenerator.tsx
- **Detail:** PR #1368 (merged April 21, 2026) rebuilt `generateGuidedLearning` from a single-image function with rate limiting into a multi-image function (up to 10 images, 20 MB cap) gated admin-only server-side. Two regressions relative to the April 17 audit: (1) the cloud function no longer performs any `ai_usage` rate-limit check — any admin can call it unlimited times per day; (2) the client-side gate changed from a feature permission check to a direct `isAdmin` check in `GuidedLearning/Widget.tsx`, meaning no admin can selectively disable this AI feature for certain buildings without removing the widget entirely. The journal table has been updated to reflect current state (see above).
- **Fix:** (a) Restore per-user rate limiting in `generateGuidedLearning` by adding an `ai_usage` check against the global `gemini-functions` daily limit (consistent with other `generateWithAI` functions that are not admin-only). (b) Either keep admin-only behavior (acceptable since GL AI is an admin authoring tool) and document the design intent explicitly in the function's docblock, OR add a `canAccessFeature('guided-learning-ai')` check in `GuidedLearning/Widget.tsx` for finer-grained access control. At minimum, add a JSDoc comment explaining why rate limiting is omitted.

### LOW Hardcoded model string at functions/src/index.ts:1714 (was :1616)

- **Detected:** 2026-04-17
- **File:** functions/src/index.ts:1714 (line number shifts with function additions)
- **Detail:** The `generateVideoActivity` function selects a model with `perm.config?.model ?? 'gemini-3.1-flash-lite-preview'`. This duplicates the literal string defined by the `DEFAULT_STANDARD_MODEL` constant at line 97. If the default model is updated, this line will not automatically follow.
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

_No completed items yet._
