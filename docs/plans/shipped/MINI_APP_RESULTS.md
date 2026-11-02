# Mini App results that reliably reach the teacher

Grilled and settled 2026-10-11 against `dev-paul` at `5e029a3`. Behind one preview flag, `mini-app-results`.

## Goal

A teacher makes a mini app, either through the Claude connector or with "make with AI" in the widget. If the app is meant to collect results, students' submissions arrive in SpartBoard reliably. They're tied to the signed-in student and limited to the number of attempts the teacher chose. Wherever possible they're graded on the server, and they show in a real results table, the Gradebook and a Sheet export.

## Current-state facts that drove the decisions

- **A Firestore submission path already exists, and Apps Script is already gone.**
  - `components/miniApp/MiniAppStudentApp.tsx` runs `session.appHtml` in a `srcDoc` iframe with `sandbox="allow-scripts allow-forms allow-modals"`.
  - It posts `SPART_MINIAPP_INIT` (`submissionsEnabled`, `timeMultiplier`) into the frame and listens for `SPART_MINIAPP_RESULT`.
  - It writes `mini_app_sessions/{sessionId}/submissions/{pseudonym|anonUid}` directly from the client (`firestore.rules` ~5485-5590; the comment there says this replaced the legacy Sheets pipeline).
  - An "I'm Done" button merges `payload.completed`.
- **One doc per student, overwritten on each submit.** There's no attempt count or limit, so a student can resubmit without end.
- **The payload is arbitrary JSON.** `SubmissionsModal.tsx` resolves names through pseudonyms, then shows `JSON.stringify(payload)`.
- **The in-widget generator teaches the protocol only in prose.**
  - `functions/src/aiGeneration.ts` (~915-1000, Gemini on Vertex) has a long "Submission protocol (MANDATORY)" block with hand-written listener code.
  - Nothing checks the output, which is the "AI wrote bad submit code" failure Paul saw.
- **The connector never mentions submitting.**
  - `functions/src/mcp/miniAppTools.ts` `create_mini_app` says only "single-file HTML app … sandboxed".
  - The `spartboard` skill's `references/mini-apps.md` (ops-pivers/claude-skills) says "No student data. Don't collect names or answers."
  - So every connector-made app is view-only in practice.
- **The silent failures** came from the old Apps Script `no-cors` POST path and from apps that never posted the message. The overlay in `MiniAppStudentApp.tsx` does show save errors once a write is actually attempted.
- **Quizzes already have the patterns to reuse:** `attemptLimit` at assign, a results summary MCP tool (`functions/src/mcp/resultsTools.ts` `get_quiz_results_summary`), Gradebook kinds and Sheet export.

## Decisions

### D1 Identity: class sign-in

Submissions are keyed by the existing per-assignment pseudonym (studentRole) or anon uid (shared link), the same as today and the same as quizzes. Apps never ask for a name.

### D2 Injected helper, not hand-written protocol

- The runner prepends a SpartBoard helper script to `appHtml` before setting `srcDoc`. It exposes `window.SpartBoard`:
  - `SpartBoard.submit(result) → Promise<ServerResult>`
  - `SpartBoard.onInit(cb)`, which receives `timeMultiplier` and `submissionsEnabled`
- The helper also:
  - Shows and hides `[data-spart-submit]` controls.
  - Validates the result shape before it is sent.
  - Resolves only after the host confirms the save.
  - Disables Submit while a submission is in flight.
- The host keeps accepting the legacy `SPART_MINIAPP_RESULT` message, so old apps work unchanged (D16).
- The helper is versioned (`SpartBoard.version`), and its source lives in one module that the student runner, teacher preview and "Try as student" all share.

### D3 Standard result shape

```ts
{
  items?: { id: string; answer: unknown; correct?: boolean; points?: number }[];
  score?: number;      // app-computed, used only when the server can't grade
  maxScore?: number;
  data?: Record<string, unknown>; // free-form extras, capped
}
```

Item `id`s must match the manifest (D4). Sizes are capped: about 200 items and 20 KB total.

### D4 Apps declare whether they collect results

- `MiniAppItem` gains `collectsResults: boolean` and `manifest?: { questions: { id; type; prompt; points? }[] }`.
- Question types: `mc`, `multi`, `tf`, `numeric`, `short`, `order`, `other`.
- Both creation paths set the flag. Timers and randomizers set it to false.

### D5 Answer keys are teacher-only

- The key is stored at `users/{uid}/mini_app_keys/{appId}`: per question, the correct value, a tolerance for numeric, and accepted answers for short text.
- It is readable only by the owner and functions, and never sits in the HTML.
- On assign, the key is copied into a server-only doc beside the session, e.g. `mini_app_sessions/{id}/private/key` (no client read).
- **Shared apps (Q26):** publishing to `global_mini_apps` or sharing with a PLC copies the key into the receiving teacher's own key doc on import. Students never see it on any path.

### D6 One write path: `submitMiniAppResultV1`

- **Every submission goes through this callable,** graded or not. It:
  - Checks that the session is active and in its open/close/period window.
  - Enforces the attempt limit (D8).
  - Validates the shape and size.
  - Strips name- and email-like fields (D11).
  - Grades (D7) and writes the attempt.
  - Returns `{ attempt, attemptsLeft, score?, maxScore?, items?: {id, correct}[] }`, filtered by the correctness setting (D9).
- **The rules change:** students lose direct `create`/`update` on `submissions/**`; they keep read of their own summary for the `/my-assignments` completed badge.
- **"I'm Done"** (completion with no result) calls the same function with no items.
- **Release compatibility:** the old-client direct write must keep working until the flag is public and a `main` release has carried the new client. Keep the old rule branch for sessions created without the flag, keyed on a session field such as `resultsVersion: 2`, and drop it at retirement.

### D7 Server grading of exact-match types

- **What the server grades:**
  - `mc`, `tf`: exact match.
  - `multi`: set equality, all-or-nothing in phase 1.
  - `numeric`: within the tolerance.
  - `short`: case- and whitespace-insensitive match against accepted answers.
  - `order`: exact sequence.
- **Fallback:** a question of type `other`, or one without a key, uses the app's `correct`/`points`, labeled "from app". An attempt with no gradable items uses the app's `score`/`maxScore`, also labeled "from app".
- No AI grading of open text in this plan.

### D8 Attempts: limit set at assign, best counts

- The assign stepper gets an Attempts control: 1 / 2 / 3 / Unlimited, default 1. It is stored as `attemptLimit` on the session, as quizzes do.
- **Storage:**
  - Each attempt goes to `submissions/{studentKey}/attempts/{n}`.
  - The parent doc holds the summary: `attemptCount`, `best` (score, maxScore, attemptNo, gradedBy `server|app`), `lastSubmittedAt`.
  - The function increments the count in a transaction.
- After the last attempt, the helper's promise rejects with `attempts-exhausted` and the runner shows a "Turned in" screen.

### D9 What the student sees

`submit()` resolves with the server result, and the app may show the official score and per-item correctness. The teacher can hide correctness per assignment: a "Show correct answers" toggle in the assign stepper, default on, mirroring quizzes. When it's off, the function returns only `attempt`/`attemptsLeft`.

### D10 Teacher results view and export

- `SubmissionsModal` becomes a results table:
  - One row per student, with the best score, attempts and last submitted time, and a column per manifest question showing correct or incorrect from the best attempt.
  - A row expands to show every attempt.
  - Legacy free-form payloads still render as a raw list.
- Export makes a Google Sheet with the same columns, one row per student, using the existing quiz export utilities. CSV is the fallback when Drive isn't available.

### D11 Privacy: answers yes, names no

Apps may send answers, choices and scores. The function drops keys matching name or email patterns and any string that looks like an email address. The skill and the prompt say: "Never ask for a student's name or email; SpartBoard knows who submitted."

### D12 Checking apps before they reach students

- **Save-time check (static, client and server),** for `collectsResults: true`:
  - The HTML references `SpartBoard.submit`.
  - It has a `[data-spart-submit]` control.
  - The manifest is valid, with unique ids.
  - Answer-key ids are a subset of the manifest ids.
  - The HTML doesn't contain answer-key values next to question ids, a best-effort leak check.
- **Enforcement:**
  - `create_mini_app`/`update_mini_app` refuse the save with a specific `ToolError`, which Claude reads and fixes.
  - The widget generator retries once, passing the error back, then shows it to the teacher.
- **"Try as student"** in the editor runs the app with the real helper wired to a local panel. The panel shows the exact payload, the grade the server would give against the key (run client-side from the same grading module, shared with functions), and any shape errors. Nothing is saved.

### D13 Gradebook

A session with a score (server or app) feeds the Gradebook through the existing mini-app kind (`gradebookCore.ts`, `gradeIndexTriggers.ts`) using `best`. App-graded scores show a "from app" marker. A session with no scores shows Completed.

### D14 One shared spec for both creation paths

- `shared/miniAppSpec.ts` (or the repo's equivalent shared location) holds the helper API, result shape, manifest and key schema, classroom rules and the worked example.
- Generated from it:
  - The widget system prompt.
  - The connector tool descriptions and input schema (`collects_results`, `manifest`, `answer_key`).
  - A markdown block that is copied into the skill's `references/mini-apps.md`, with a test that fails on drift where practical.
- Generation uses a tool call with a fixed schema `{ title, html, collectsResults, manifest, answerKey }`.

### D15 The connector can read class results

Add `get_mini_app_results_summary`, mirroring `get_quiz_results_summary`. It returns the submitted count, average best score and per-question correct rate. It's hidden below 5 students and has no student rows.

### D16 Existing apps

Old apps run unchanged. The legacy message is accepted and still goes through the function on flagged sessions. Their results show as a raw list. The editor gets a "Collect results" action that asks the AI to rewrite the app against the spec, producing the manifest and key for the teacher to review.

### D17 Apps Script is retired for mini apps

No teacher-deployed script path.

### D18 Flag

- `GlobalFeature` `mini-app-results`: `defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`, `stage: 'preview'`, `afterLaunch: 'retire'`, `widget: 'miniApp'`.
- Add it to `functions/src/featureMissingDoc.ts`.
- Gate:
  - The assign stepper's Attempts and correctness controls.
  - New session creation with `resultsVersion: 2`.
  - The results table.
  - "Try as student".
  - The editor's "Collect results" action.
- The connector's new fields are accepted for everyone (they're inert data), but the save-time check only blocks when the flag is on for that teacher.

## Phases

1. **Runtime and grading.** Helper (D2), shape (D3), manifest and flag (D4), keys (D5), `submitMiniAppResultV1` with grading and attempts (D6-D9), rules, results table and export (D10), privacy filter (D11), save check and "Try as student" (D12), legacy handling (D16), flag (D18). Rules tests for the new submission paths.
2. **Connector.** Shared spec (D14) wired into the `create_mini_app`/`update_mini_app` schema and descriptions, refusal on a failed check, `get_mini_app_results_summary` (D15). Rewrite of the skill's `references/mini-apps.md` in ops-pivers/claude-skills.
3. **Gradebook** (D13).
4. **In-widget AI on the Claude API.** Swap the `mini-app` branch of `aiGeneration.ts` to Claude with the shared spec, tool-call output and one repair retry. Model choice and secrets get decided at that time, and the new secret goes in both Firebase projects.

## Assumptions (not separately grilled)

- A failed submission keeps the existing retry overlay; the helper's promise rejects so the app can react.
- No partial-progress autosave; only Submit saves.
- Answer keys copy with the app on "duplicate" in the teacher's own library.

## Release

The flag starts at admin. To open it: Admin Settings > Access > Previews > "Mini App results" > Public. The changelog entry is written when it opens to everyone, not when the code merges.
