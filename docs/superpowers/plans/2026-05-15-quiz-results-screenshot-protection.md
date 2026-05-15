# Quiz Results Screenshot Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a teacher publishes quiz results, let them opt-in to two anti-screenshot measures — a personalized watermark overlay and a configurable tab-switch warning/lockout system — both controlled per-assignment at publish time with remember-last-used defaults.

**Architecture:** A new `ResultsProtection` settings object is mirrored from the teacher's `QuizAssignment` doc onto the student-readable `QuizSession` doc when results are published. The student-side results view conditionally mounts (1) a watermark overlay component rendering the student's name + timestamp as a repeating low-opacity SVG pattern, and (2) a `useResultsTabWarnings` hook that listens to `visibilitychange`/`blur`, increments a per-response counter, and flips a `resultsLockedOut` flag when the configured threshold is reached. The lockout flag is observed by the student app (which redirects them to the Completed assignments page with a locked-card indicator) and by the teacher's monitor view (which shows a lock badge + unlock affordance that decrements the count by 1 so unlocked students have zero grace warnings). Last-used protection settings are persisted to `AppSettings` per teacher.

**Tech Stack:** React 19, TypeScript, Firestore real-time listeners, existing AuthContext `appSettings` pattern, existing `QuizLiveMonitor` infrastructure, Tailwind CSS, Vitest, Playwright.

**Reference exploration:** Subsystems mapped at `hooks/useQuizAssignments.ts:338-374,1849-2020`, `components/widgets/QuizWidget/components/QuizResults.tsx`, `components/quiz/QuizStudentApp.tsx:826-907`, `hooks/useQuizSession.ts:965,1000-1014,1872-1910`, `components/widgets/QuizWidget/components/QuizLiveMonitor.tsx:79-113,515-542,2555-2765`, `components/student/MyAssignmentsPage.tsx`, `components/student/AssignmentListItem.tsx`, `types.ts:2553-2684,2733-2830,3071-3229,5166-5169`, `context/AuthContextValue.ts:18-114`.

---

## File Structure

### New files

| File                                              | Responsibility                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `components/quiz/ResultsWatermark.tsx`            | Repeating diagonal SVG watermark with student name + timestamp                                    |
| `components/quiz/ResultsTabWarningModal.tsx`      | "Warning N of M" modal when student returns from a tab switch                                     |
| `hooks/useResultsTabWarnings.ts`                  | Listens to visibility/focus, increments warnings on student's response doc, derives lockout state |
| `tests/components/quiz/ResultsWatermark.test.tsx` | Watermark renders text + repeats                                                                  |
| `tests/hooks/useResultsTabWarnings.test.ts`       | Hook increments + lockout transitions                                                             |
| `tests/e2e/quiz-results-protection.spec.ts`       | Full publish → view → warn → lockout → unlock loop                                                |

### Modified files

| File                                                           | What changes                                                                                                                           |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                                                     | Add `ResultsProtection` interface; extend `QuizAssignment`, `QuizSession`, `QuizResponse`, `AppSettings`                               |
| `hooks/useQuizAssignments.ts`                                  | `publishAssignmentScores` accepts + mirrors `protection` settings                                                                      |
| `components/widgets/QuizWidget/components/QuizResults.tsx`     | Two new toggles + threshold input in publish dialog                                                                                    |
| `context/AuthContext.tsx`                                      | Persist `lastResultsProtection` via existing `updateAppSettings`                                                                       |
| `components/widgets/QuizWidget/Widget.tsx`                     | Mount watermark + tab-warning hook when `view === 'results'` and protection enabled                                                    |
| `components/student/MyAssignmentsPage.tsx`                     | Listen for lockout flag, redirect locked students from results view back to list                                                       |
| `components/student/AssignmentListItem.tsx`                    | Render lock icon + tap-to-show-message when student is locked out                                                                      |
| `components/widgets/QuizWidget/components/QuizLiveMonitor.tsx` | Lock icon on row, unlock-results affordance, notification badge for locked count                                                       |
| `firestore.rules`                                              | Allow student to increment `resultsTabWarnings` only (never decrement); allow teacher to write `resultsLockedOut` / decrement warnings |

---

## Naming Conventions Used in This Plan

To avoid confusion with the **pre-existing** quiz-taking tab-warning system (`tabWarningsEnabled` on session, `tabSwitchWarnings` on response, `unlocked` for finalize-on-tab-switch), all new fields use a `results*` prefix:

- `ResultsProtection` — the settings object
- `resultsTabWarnings` — per-response counter (distinct from `tabSwitchWarnings` which is for quiz-taking)
- `resultsLockedOut`, `resultsLockedOutAt` — per-response lockout state
- `unlockResultsForStudent()` — teacher action (distinct from existing `unlocked` semantics)

---

## Phase 1 — Data Model + Publish Flow

### Task 1: Define `ResultsProtection` and extend quiz types

**Files:**

- Modify: `types.ts` (add interface near other quiz types; extend `QuizAssignment`, `QuizSession`, `QuizResponse`, `AppSettings`)

- [ ] **Step 1: Add the `ResultsProtection` interface and `ResultsProtectionDefaults` constant**

Insert immediately after the `QuizScoreVisibility` type at `types.ts:3071-3074`:

```typescript
/**
 * Anti-screenshot protections applied to a student's view of published quiz
 * results. Mirrored from QuizAssignment → QuizSession at publish time so the
 * student app (which only reads sessions) can render protection without
 * needing access to the teacher's assignment doc.
 */
export interface ResultsProtection {
  /** Show a repeating low-opacity overlay with student name + publish timestamp. */
  watermarkEnabled: boolean;
  /** Detect visibility/focus changes and warn → lock student when threshold hit. */
  tabWarningEnabled: boolean;
  /**
   * Number of warnings before lockout. 1–10 inclusive. Only meaningful when
   * `tabWarningEnabled` is true. Defaults to 3 in the UI but persisted
   * explicitly so historical assignments stay accurate after the default changes.
   */
  tabWarningThreshold: number;
}

export const RESULTS_PROTECTION_DEFAULTS: ResultsProtection = {
  watermarkEnabled: true,
  tabWarningEnabled: false,
  tabWarningThreshold: 3,
};

export const RESULTS_TAB_WARNING_THRESHOLD_MIN = 1;
export const RESULTS_TAB_WARNING_THRESHOLD_MAX = 10;
```

- [ ] **Step 2: Extend `QuizAssignment` with `protection` field**

Inside the `QuizAssignment` interface (around `types.ts:3155-3229`), add immediately after the existing `scoreVisibility?` field at line 3222:

```typescript
  /**
   * Anti-screenshot protections applied when results are visible to students.
   * `undefined` = no protection (legacy assignments pre-feature). Mirrored to
   * the session doc by `publishAssignmentScores`.
   */
  protection?: ResultsProtection;
```

- [ ] **Step 3: Extend `QuizSession` with `protection` field (mirrored)**

Inside `QuizSession` (around `types.ts:2553-2684`), add immediately after `scoreVisibility?` at line 2683:

```typescript
  /**
   * Mirror of QuizAssignment.protection so the student app — which only reads
   * /quiz_sessions — can decide whether to mount watermark + tab-warning UI.
   * Cleared by `unpublishAssignmentScores`.
   */
  protection?: ResultsProtection;
```

- [ ] **Step 4: Extend `QuizResponse` with results-view warning + lockout state**

Inside `QuizResponse` (around `types.ts:2733-2830`), add immediately after `tabSwitchWarnings?: number` at line 2773:

```typescript
  /**
   * Number of tab-switch / focus-loss events the student has accumulated while
   * viewing **published results**. Distinct from `tabSwitchWarnings`, which
   * tracks tab switches during the active quiz-taking attempt. Server-rule
   * enforced to only ever increase from a student write — teacher writes (via
   * `unlockResultsForStudent`) can decrement.
   */
  resultsTabWarnings?: number;
  /**
   * True once `resultsTabWarnings` reaches `session.protection.tabWarningThreshold`.
   * Read by the student app to redirect to My Assignments, and by the teacher's
   * monitor to surface the lock badge + unlock affordance.
   */
  resultsLockedOut?: boolean;
  /** Wall-clock ms when `resultsLockedOut` last flipped from false → true. */
  resultsLockedOutAt?: number;
```

- [ ] **Step 5: Extend `AppSettings` with last-used protection**

Replace the `AppSettings` interface at `types.ts:5166-5169`:

```typescript
export interface AppSettings {
  geminiDailyLimit: number;
  logoUrl?: string;
  /**
   * The protection settings the teacher last published with. Used as the
   * pre-fill for the next "Publish Results" dialog so teachers don't have to
   * re-pick on every publish. Initialised from `RESULTS_PROTECTION_DEFAULTS`
   * if unset.
   */
  lastResultsProtection?: ResultsProtection;
}
```

- [ ] **Step 6: Run type-check to verify everything compiles**

Run: `pnpm run type-check`
Expected: PASS (no errors). If there are import-cycle complaints, ensure `ResultsProtection` is declared before any interface that uses it.

- [ ] **Step 7: Commit**

```bash
git add types.ts
git commit -m "feat(quiz): add ResultsProtection type and per-response lockout fields"
```

---

### Task 2: Thread `protection` through `publishAssignmentScores`

**Files:**

- Modify: `hooks/useQuizAssignments.ts:338-374,1849-2020`

- [ ] **Step 1: Write failing test for the new signature**

Create `tests/hooks/useQuizAssignments.publishProtection.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import type { ResultsProtection, QuizData } from '@/types';

vi.mock('firebase/firestore');

describe('publishAssignmentScores — protection mirroring', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes protection to both assignment and session docs', async () => {
    const protection: ResultsProtection = {
      watermarkEnabled: true,
      tabWarningEnabled: true,
      tabWarningThreshold: 2,
    };
    const quizData = {
      /* minimal fixture */
    } as unknown as QuizData;

    const { result } = renderHook(() => useQuizAssignments(/* fixtures */));
    await act(async () => {
      await result.current.publishAssignmentScores(
        'asn-1',
        quizData,
        'score-and-responses',
        protection
      );
    });

    // Assert: assignment doc write includes `protection: {...}`
    // Assert: session doc write includes `protection: {...}`
    // (use mock spies on doc/batch writes — match existing tests in this file)
  });

  it('passes protection: undefined when caller omits it (back-compat)', async () => {
    // Verify older callers that don't supply protection don't crash and the
    // doc write either omits the field or uses deleteField()
  });
});
```

Run: `pnpm vitest run tests/hooks/useQuizAssignments.publishProtection.test.ts`
Expected: FAIL — function does not yet accept the `protection` arg.

- [ ] **Step 2: Update the type signature**

In `hooks/useQuizAssignments.ts:359-362`, replace:

```typescript
publishAssignmentScores: (
  assignmentId: string,
  quizData: QuizData,
  visibility: Exclude<QuizScoreVisibility, 'none'>
) => Promise<void>;
```

with:

```typescript
publishAssignmentScores: (
  assignmentId: string,
  quizData: QuizData,
  visibility: Exclude<QuizScoreVisibility, 'none'>,
  protection?: ResultsProtection
) => Promise<void>;
```

Add `ResultsProtection` to the existing `import type { ... } from '../types'` block at the top of the file.

- [ ] **Step 3: Wire the parameter into the write batch**

In the `publishAssignmentScores` implementation (around `useQuizAssignments.ts:1849-2020`), add a fifth callback parameter and include it in **both** the assignment doc update and the session doc update. After the existing fields that write `scoreVisibility` / `scorePublishedAt`, add:

```typescript
// Mirror protection settings; pass deleteField() when caller cleared them
// so re-publishing without protection actually removes stale settings.
const protectionWrite = protection ?? deleteField();
// Append to the assignment-doc update payload:
//   protection: protectionWrite,
// And to the session-doc update payload (same value).
```

Note: search for the existing `scoreVisibility` write in this function and add `protection` adjacent to it in both the assignment-doc and session-doc payloads.

- [ ] **Step 4: Update `unpublishAssignmentScores` to clear protection too**

In `useQuizAssignments.ts:1808-1820`, the existing `unpublishAssignmentScores` uses `deleteField()` for `scoreVisibility` and `scorePublishedAt`. Add `protection: deleteField()` to both doc updates inside that function so unpublishing fully clears protection.

- [ ] **Step 5: Run the test — expect pass**

Run: `pnpm vitest run tests/hooks/useQuizAssignments.publishProtection.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify the existing test suite for this file still passes**

Run: `pnpm vitest run tests/hooks/useQuizAssignments`
Expected: All existing tests PASS (no regressions).

- [ ] **Step 7: Commit**

```bash
git add hooks/useQuizAssignments.ts tests/hooks/useQuizAssignments.publishProtection.test.ts
git commit -m "feat(quiz): mirror ResultsProtection to session doc on publish"
```

---

### Task 3: Persist `lastResultsProtection` via AppSettings

**Files:**

- Modify: `context/AuthContext.tsx` (no shape change to public API — `updateAppSettings` already accepts `Partial<AppSettings>`)
- Modify: `tests/components/AuthContext.test.tsx` (or equivalent — verify it already covers `updateAppSettings`; add one case)

- [ ] **Step 1: Write failing test**

Append to the existing AuthContext test file (find with `Grep "updateAppSettings" tests/`):

```typescript
it('persists lastResultsProtection through updateAppSettings', async () => {
  const { result } = renderAuthHookWithUser('uid-1');
  await act(async () => {
    await result.current.updateAppSettings({
      lastResultsProtection: {
        watermarkEnabled: true,
        tabWarningEnabled: true,
        tabWarningThreshold: 5,
      },
    });
  });
  expect(result.current.appSettings?.lastResultsProtection).toEqual({
    watermarkEnabled: true,
    tabWarningEnabled: true,
    tabWarningThreshold: 5,
  });
});
```

Run the test: expected FAIL only if `updateAppSettings` does shape validation that rejects unknown keys. If it's a flexible `Partial<AppSettings>` merge (likely — see `AuthContextValue.ts:27`), this should PASS immediately because Task 1 already extended the type.

- [ ] **Step 2: If the test passed without code changes, no implementation needed**

If `updateAppSettings` is already a generic partial merge, the type extension from Task 1 is the only code change needed. Skip to Step 3.

If the test failed, locate the merge logic in `context/AuthContext.tsx` (search for `updateAppSettings`) and ensure it forwards arbitrary keys to the Firestore write. No filtering / allowlist should be added.

- [ ] **Step 3: Commit**

```bash
git add context/AuthContext.tsx tests/components/AuthContext.test.tsx
git commit -m "feat(auth): persist lastResultsProtection in AppSettings"
```

---

### Task 4: Add protection toggles to the Publish Results dialog

**Files:**

- Modify: `components/widgets/QuizWidget/components/QuizResults.tsx` (publish dialog)

- [ ] **Step 1: Write failing test**

Create `tests/components/quiz/QuizResults.protection.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuizResults } from '@/components/widgets/QuizWidget/components/QuizResults';
import { RESULTS_PROTECTION_DEFAULTS } from '@/types';

const publishSpy = vi.fn();
const updateSettingsSpy = vi.fn();

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    appSettings: { geminiDailyLimit: 1000 },
    updateAppSettings: updateSettingsSpy,
  }),
}));

vi.mock('@/hooks/useQuizAssignments', () => ({
  useQuizAssignments: () => ({ publishAssignmentScores: publishSpy }),
}));

describe('QuizResults — protection toggles', () => {
  it('renders both toggles defaulting from RESULTS_PROTECTION_DEFAULTS', () => {
    render(<QuizResults /* required props */ />);
    fireEvent.click(screen.getByRole('button', { name: /publish results/i }));
    expect(screen.getByLabelText(/watermark/i)).toBeChecked();
    expect(screen.getByLabelText(/tab.switch warnings/i)).not.toBeChecked();
  });

  it('hides the threshold input when tab-warning toggle is off', () => {
    render(<QuizResults /* required props */ />);
    fireEvent.click(screen.getByRole('button', { name: /publish results/i }));
    expect(screen.queryByLabelText(/warnings before lockout/i)).not.toBeInTheDocument();
  });

  it('shows threshold input bounded [1, 10] when tab-warning enabled', () => {
    render(<QuizResults /* required props */ />);
    fireEvent.click(screen.getByRole('button', { name: /publish results/i }));
    fireEvent.click(screen.getByLabelText(/tab.switch warnings/i));
    const input = screen.getByLabelText(/warnings before lockout/i) as HTMLInputElement;
    expect(input.min).toBe('1');
    expect(input.max).toBe('10');
    expect(input.value).toBe('3');
  });

  it('passes protection to publishAssignmentScores and persists via updateAppSettings', async () => {
    render(<QuizResults /* required props */ />);
    fireEvent.click(screen.getByRole('button', { name: /publish results/i }));
    fireEvent.click(screen.getByLabelText(/tab.switch warnings/i));
    fireEvent.change(screen.getByLabelText(/warnings before lockout/i), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));
    expect(publishSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(String),
      { watermarkEnabled: true, tabWarningEnabled: true, tabWarningThreshold: 5 },
    );
    expect(updateSettingsSpy).toHaveBeenCalledWith({
      lastResultsProtection: {
        watermarkEnabled: true,
        tabWarningEnabled: true,
        tabWarningThreshold: 5,
      },
    });
  });

  it('pre-fills from appSettings.lastResultsProtection when present', () => {
    /* re-mock useAuth with appSettings.lastResultsProtection: {...} and assert
       the toggles + threshold reflect those values */
  });
});
```

Run: `pnpm vitest run tests/components/quiz/QuizResults.protection.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Locate the publish dialog markup in `QuizResults.tsx`**

Search for the existing visibility option group (`scoreVisibility` selection — radio buttons or similar) inside `QuizResults.tsx`. Identify the form's `onSubmit` handler and the current call to `publishAssignmentScores`.

- [ ] **Step 3: Add protection state to the dialog**

Near the top of the publish-dialog component (just inside the component body, after existing `useState` calls), add:

```typescript
import {
  RESULTS_PROTECTION_DEFAULTS,
  RESULTS_TAB_WARNING_THRESHOLD_MAX,
  RESULTS_TAB_WARNING_THRESHOLD_MIN,
  type ResultsProtection,
} from '@/types';
import { useAuth } from '@/context/useAuth';

const { appSettings, updateAppSettings } = useAuth();
const [protection, setProtection] = useState<ResultsProtection>(
  () => appSettings?.lastResultsProtection ?? RESULTS_PROTECTION_DEFAULTS
);
```

- [ ] **Step 4: Render the two toggles + conditional threshold input**

Below the existing visibility options inside the dialog form (use existing form-section styling — `bg-white/10 backdrop-blur-sm rounded-lg border border-white/20` pattern from CLAUDE.md), add:

```tsx
<fieldset className="mt-4 rounded-lg border border-white/20 bg-white/5 p-4">
  <legend className="px-2 text-sm font-medium text-white/90">Protection</legend>

  <label className="flex items-start gap-3 py-2">
    <input
      type="checkbox"
      className="mt-1"
      checked={protection.watermarkEnabled}
      onChange={(e) =>
        setProtection((p) => ({ ...p, watermarkEnabled: e.target.checked }))
      }
      aria-label="Watermark student name on results"
    />
    <span className="text-sm text-white/90">
      <span className="font-medium">Watermark</span>
      <span className="block text-xs text-white/60">
        Overlay each student&apos;s name and the publish time across their
        results.
      </span>
    </span>
  </label>

  <label className="flex items-start gap-3 py-2">
    <input
      type="checkbox"
      className="mt-1"
      checked={protection.tabWarningEnabled}
      onChange={(e) =>
        setProtection((p) => ({ ...p, tabWarningEnabled: e.target.checked }))
      }
      aria-label="Enable tab-switch warnings"
    />
    <span className="text-sm text-white/90">
      <span className="font-medium">Tab-switch warnings</span>
      <span className="block text-xs text-white/60">
        Warn students if they leave the results tab. Locks them out after the
        chosen number of warnings; teachers can unlock from the monitor.
      </span>
    </span>
  </label>

  {protection.tabWarningEnabled && (
    <label className="ml-7 flex items-center gap-2 pt-1 pb-2">
      <span className="text-xs text-white/80">Warnings before lockout</span>
      <input
        type="number"
        min={RESULTS_TAB_WARNING_THRESHOLD_MIN}
        max={RESULTS_TAB_WARNING_THRESHOLD_MAX}
        value={protection.tabWarningThreshold}
        onChange={(e) => {
          const raw = Number.parseInt(e.target.value, 10);
          const clamped = Number.isFinite(raw)
            ? Math.min(
                RESULTS_TAB_WARNING_THRESHOLD_MAX,
                Math.max(RESULTS_TAB_WARNING_THRESHOLD_MIN, raw)
              )
            : RESULTS_PROTECTION_DEFAULTS.tabWarningThreshold;
          setProtection((p) => ({ ...p, tabWarningThreshold: clamped }));
        }}
        aria-label="Warnings before lockout"
        className="w-16 rounded border border-white/30 bg-slate-800 px-2 py-1 text-sm text-white"
      />
    </label>
  )}
</fieldset>
```

- [ ] **Step 5: Update the submit handler to pass `protection` and persist last-used**

Locate the existing `await publishAssignmentScores(assignmentId, quizData, visibility)` call inside the dialog's submit handler. Replace it with:

```typescript
await publishAssignmentScores(assignmentId, quizData, visibility, protection);
await updateAppSettings({ lastResultsProtection: protection });
```

The two awaits are sequential intentionally: persist-last-used only fires on a successful publish, so a failed publish doesn't pollute the teacher's defaults.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run tests/components/quiz/QuizResults.protection.test.tsx`
Expected: PASS.

- [ ] **Step 7: Run lint + type-check**

Run: `pnpm run lint && pnpm run type-check`
Expected: zero errors and zero warnings.

- [ ] **Step 8: Commit**

```bash
git add components/widgets/QuizWidget/components/QuizResults.tsx tests/components/quiz/QuizResults.protection.test.tsx
git commit -m "feat(quiz): add protection toggles to publish-results dialog"
```

---

## Phase 2 — Watermark

### Task 5: Build the `ResultsWatermark` component

**Files:**

- Create: `components/quiz/ResultsWatermark.tsx`
- Create: `tests/components/quiz/ResultsWatermark.test.tsx`

- [ ] **Step 1: Write failing test**

Create `tests/components/quiz/ResultsWatermark.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultsWatermark } from '@/components/quiz/ResultsWatermark';

describe('ResultsWatermark', () => {
  it('renders the student name and a formatted timestamp inside an SVG pattern', () => {
    render(
      <ResultsWatermark studentName="Ada Lovelace" publishedAt={1715731200000} />,
    );
    const svg = screen.getByRole('presentation', { hidden: true });
    expect(svg).toBeInTheDocument();
    // The text node lives inside <pattern><text>...</text></pattern>
    const text = svg.querySelector('text');
    expect(text?.textContent).toContain('Ada Lovelace');
    expect(text?.textContent).toMatch(/\d{4}|2024|2025|2026/); // date present
  });

  it('does not capture pointer events', () => {
    render(<ResultsWatermark studentName="Ada" publishedAt={0} />);
    const svg = screen.getByRole('presentation', { hidden: true });
    expect(svg).toHaveClass('pointer-events-none');
  });

  it('escapes special characters in the student name (no SVG injection)', () => {
    render(
      <ResultsWatermark
        studentName={'<script>alert(1)</script>'}
        publishedAt={0}
      />,
    );
    const svg = screen.getByRole('presentation', { hidden: true });
    expect(svg.innerHTML).not.toContain('<script>');
  });
});
```

Run: expected FAIL (component does not exist).

- [ ] **Step 2: Implement the component**

Create `components/quiz/ResultsWatermark.tsx`:

```typescript
import React from 'react';

interface ResultsWatermarkProps {
  /** Display name shown in the watermark. Sanitized via React text node interpolation. */
  studentName: string;
  /** ms timestamp of when the teacher published — formatted to locale string. */
  publishedAt: number;
}

/**
 * Repeating diagonal low-opacity SVG watermark overlaid on the published-quiz
 * results view. Rotates the pattern at -30deg and tiles it across the entire
 * viewport. Strictly decorative — `pointer-events-none` + `aria-hidden` so it
 * does not interfere with focus, screen readers, or interaction.
 *
 * Why SVG <pattern> over CSS-grid tiles: pattern with `patternTransform` rotates
 * the tile (not just each label), so the diagonal repeat is seamless across the
 * full page regardless of viewport size. CSS-grid would clip the rotation at
 * the container edges.
 */
export const ResultsWatermark: React.FC<ResultsWatermarkProps> = ({
  studentName,
  publishedAt,
}) => {
  const patternId = React.useId();
  const label = `${studentName} • ${new Date(publishedAt).toLocaleString()}`;
  return (
    <svg
      role="presentation"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 h-full w-full select-none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id={patternId}
          x="0"
          y="0"
          width="360"
          height="120"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-30)"
        >
          <text
            x="0"
            y="60"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="14"
            fill="currentColor"
            opacity="0.12"
          >
            {label}
          </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
};
```

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run tests/components/quiz/ResultsWatermark.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/quiz/ResultsWatermark.tsx tests/components/quiz/ResultsWatermark.test.tsx
git commit -m "feat(quiz): add ResultsWatermark SVG-pattern overlay"
```

---

### Task 6: Mount watermark on the results view + hide print/export

**Files:**

- Modify: `components/widgets/QuizWidget/Widget.tsx:796-810` (the `view === 'results'` branch)

- [ ] **Step 1: Identify the student-name source and publish timestamp source**

In the `view === 'results'` branch, the session doc is already in scope. From the exploration: `session.scorePublishedAt` is the publish timestamp; the student's display name comes from the student's own response doc (`response.studentName` or equivalent — verify by reading `Widget.tsx:796-810` and any sibling component it renders).

- [ ] **Step 2: Conditionally render the watermark**

At the top of the `view === 'results'` render block (before the existing results JSX), add:

```typescript
import { ResultsWatermark } from '@/components/quiz/ResultsWatermark';

// inside the results-view render branch:
const watermarkEnabled = session.protection?.watermarkEnabled === true;
const publishedAt = session.scorePublishedAt ?? Date.now();
```

And inside the JSX, immediately after the outer wrapper opens:

```tsx
{
  watermarkEnabled && (
    <ResultsWatermark
      studentName={response.studentName ?? 'Student'}
      publishedAt={publishedAt}
    />
  );
}
```

- [ ] **Step 3: Hide print / export when either protection is enabled**

Locate any existing "Print", "Save as PDF", or "Download" / "Export" buttons in the results view (grep the file for `print`, `Print`, `download`, `pdf`). Gate each behind:

```typescript
const anyProtectionEnabled =
  session.protection?.watermarkEnabled === true ||
  session.protection?.tabWarningEnabled === true;

// in JSX:
{!anyProtectionEnabled && <PrintButton ... />}
```

If no such buttons exist today, document that in the commit message and skip this step. (The exploration agent did not surface any, so this may be a no-op.)

- [ ] **Step 4: Manually verify in the dev server**

Run: `pnpm run dev`

1. Sign in as a teacher
2. Create / open a quiz assignment with completed student responses
3. Publish results with the Watermark toggle ON
4. Open the student-view link / impersonation
5. Verify the watermark renders as a diagonal repeating pattern with the student's name + timestamp
6. Verify text + scrolling underneath the watermark works normally

If something looks wrong (e.g., the SVG is opaque, doesn't tile, blocks clicks), debug before continuing — DO NOT proceed assuming the visual works.

- [ ] **Step 5: Commit**

```bash
git add components/widgets/QuizWidget/Widget.tsx
git commit -m "feat(quiz): mount ResultsWatermark on published-results view"
```

---

## Phase 3 — Tab-Warning Detection + Lockout

### Task 7: Build `useResultsTabWarnings` hook

**Files:**

- Create: `hooks/useResultsTabWarnings.ts`
- Create: `tests/hooks/useResultsTabWarnings.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResultsTabWarnings } from '@/hooks/useResultsTabWarnings';

const updateDoc = vi.fn();
vi.mock('firebase/firestore', async (orig) => {
  const actual = await (
    orig as () => Promise<typeof import('firebase/firestore')>
  )();
  return { ...actual, updateDoc: (...args: unknown[]) => updateDoc(...args) };
});

describe('useResultsTabWarnings', () => {
  beforeEach(() => {
    updateDoc.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when enabled=false', () => {
    renderHook(() =>
      useResultsTabWarnings({
        enabled: false,
        threshold: 3,
        currentWarnings: 0,
        responseDocPath: '/quiz_sessions/x/responses/y',
      })
    );
    document.dispatchEvent(new Event('visibilitychange'));
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('increments warnings on visibility hide → show transition', async () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    renderHook(() =>
      useResultsTabWarnings({
        enabled: true,
        threshold: 3,
        currentWarnings: 0,
        responseDocPath: '/quiz_sessions/x/responses/y',
      })
    );
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc.mock.calls[0][1]).toMatchObject({
      resultsTabWarnings: 1,
    });
  });

  it('flips resultsLockedOut=true when warnings reach threshold', async () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    renderHook(() =>
      useResultsTabWarnings({
        enabled: true,
        threshold: 3,
        currentWarnings: 2,
        responseDocPath: '/quiz_sessions/x/responses/y',
      })
    );
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(updateDoc.mock.calls[0][1]).toMatchObject({
      resultsTabWarnings: 3,
      resultsLockedOut: true,
      resultsLockedOutAt: expect.any(Number),
    });
  });

  it('does not increment further once already locked out', async () => {
    renderHook(() =>
      useResultsTabWarnings({
        enabled: true,
        threshold: 3,
        currentWarnings: 3,
        lockedOut: true,
        responseDocPath: '/quiz_sessions/x/responses/y',
      })
    );
    document.dispatchEvent(new Event('visibilitychange'));
    expect(updateDoc).not.toHaveBeenCalled();
  });
});
```

Run: expected FAIL (hook does not exist).

- [ ] **Step 2: Implement the hook**

Create `hooks/useResultsTabWarnings.ts`:

```typescript
import { useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

interface UseResultsTabWarningsArgs {
  /** True only when the session has tab-warning protection enabled AND student isn't already locked. */
  enabled: boolean;
  /** session.protection.tabWarningThreshold */
  threshold: number;
  /** response.resultsTabWarnings (current count) */
  currentWarnings: number;
  /** response.resultsLockedOut */
  lockedOut?: boolean;
  /** Firestore path: `quiz_sessions/{sessionId}/responses/{responseKey}` */
  responseDocPath: string;
}

/**
 * Listens to visibility/focus loss on the published-results view and increments
 * the student's `resultsTabWarnings` counter on each return. Flips
 * `resultsLockedOut` true when the threshold is reached. No-op once locked out
 * (further events are suppressed; the redirect-to-list logic owns the UX from
 * here).
 *
 * Note: warnings persist server-side per response doc, so closing/reopening
 * the tab does NOT reset the count within the same assignment (resets only
 * happen when teacher unlocks, decrementing by 1).
 */
export function useResultsTabWarnings({
  enabled,
  threshold,
  currentWarnings,
  lockedOut,
  responseDocPath,
}: UseResultsTabWarningsArgs): void {
  // Track whether we just transitioned hidden → visible (vs visible → hidden,
  // which we don't act on — the warning fires when the student returns).
  const wasHiddenRef = useRef(document.visibilityState === 'hidden');

  useEffect(() => {
    if (!enabled || lockedOut) return undefined;

    const incrementOnce = async () => {
      const next = currentWarnings + 1;
      const update: Record<string, unknown> = { resultsTabWarnings: next };
      if (next >= threshold) {
        update.resultsLockedOut = true;
        update.resultsLockedOutAt = Date.now();
      }
      try {
        await updateDoc(doc(db, responseDocPath), update);
      } catch (e) {
        // Surface to console — failing to write doesn't change UX, and the
        // student shouldn't see a toast about it (would just confuse them).
        console.error('[useResultsTabWarnings] update failed', e);
      }
    };

    const handleVisibility = () => {
      const hidden = document.visibilityState === 'hidden';
      if (hidden) {
        wasHiddenRef.current = true;
        return;
      }
      if (wasHiddenRef.current) {
        wasHiddenRef.current = false;
        void incrementOnce();
      }
    };

    const handleBlur = () => {
      wasHiddenRef.current = true;
    };
    const handleFocus = () => {
      if (wasHiddenRef.current) {
        wasHiddenRef.current = false;
        void incrementOnce();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [enabled, lockedOut, threshold, currentWarnings, responseDocPath]);
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run tests/hooks/useResultsTabWarnings.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add hooks/useResultsTabWarnings.ts tests/hooks/useResultsTabWarnings.test.ts
git commit -m "feat(quiz): add useResultsTabWarnings hook for results-view detection"
```

---

### Task 8: Build the warning modal

**Files:**

- Create: `components/quiz/ResultsTabWarningModal.tsx`

- [ ] **Step 1: Create the component**

```typescript
import React from 'react';

interface ResultsTabWarningModalProps {
  /** Visible only when the student just returned from a tab switch. */
  open: boolean;
  warningCount: number;
  threshold: number;
  onDismiss: () => void;
}

/**
 * Shown after the student returns to the results tab. Modal copy reveals the
 * current count and threshold ("Warning 2 of 3") so the student can self-correct
 * rather than treating lockout as a black-box gotcha.
 */
export const ResultsTabWarningModal: React.FC<ResultsTabWarningModalProps> = ({
  open,
  warningCount,
  threshold,
  onDismiss,
}) => {
  if (!open) return null;
  const remaining = Math.max(0, threshold - warningCount);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="results-tab-warning-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="mx-4 max-w-md rounded-xl border border-white/20 bg-slate-900 p-6 shadow-2xl">
        <h2
          id="results-tab-warning-title"
          className="text-lg font-semibold text-white"
        >
          Stay on this tab
        </h2>
        <p className="mt-3 text-sm text-white/80">
          You left the results page. Your teacher is tracking this.
        </p>
        <p className="mt-2 text-sm font-medium text-amber-300">
          Warning {warningCount} of {threshold}
          {remaining > 0
            ? ` — ${remaining} more will lock you out.`
            : ' — next time you leave, you will be locked out.'}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-5 w-full rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-blue-light"
        >
          I understand
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add components/quiz/ResultsTabWarningModal.tsx
git commit -m "feat(quiz): add ResultsTabWarningModal"
```

---

### Task 9: Wire the hook + modal into the results view, with lockout redirect

**Files:**

- Modify: `components/widgets/QuizWidget/Widget.tsx:796-810` (the `view === 'results'` branch)

- [ ] **Step 1: Wire the hook and modal**

Inside the `view === 'results'` render branch (the same branch modified in Task 6), add:

```typescript
import { useResultsTabWarnings } from '@/hooks/useResultsTabWarnings';
import { ResultsTabWarningModal } from '@/components/quiz/ResultsTabWarningModal';
import { useNavigate } from 'react-router-dom';

const navigate = useNavigate();
const tabWarningEnabled = session.protection?.tabWarningEnabled === true;
const threshold = session.protection?.tabWarningThreshold ?? 3;
const currentWarnings = response.resultsTabWarnings ?? 0;
const lockedOut = response.resultsLockedOut === true;

// Drive the warning modal off the most recent count change while the page is
// foregrounded; track the last count we showed the modal for so we don't loop.
const [shownForCount, setShownForCount] = useState(0);
const modalOpen =
  tabWarningEnabled && currentWarnings > shownForCount && !lockedOut;

useResultsTabWarnings({
  enabled: tabWarningEnabled,
  threshold,
  currentWarnings,
  lockedOut,
  responseDocPath: `quiz_sessions/${session.id}/responses/${response.responseKey}`,
});

// Lockout → redirect. The MyAssignments page will show the locked card.
useEffect(() => {
  if (lockedOut) navigate('/my-assignments?tab=completed');
}, [lockedOut, navigate]);
```

In the JSX block, after the watermark from Task 6:

```tsx
<ResultsTabWarningModal
  open={modalOpen}
  warningCount={currentWarnings}
  threshold={threshold}
  onDismiss={() => setShownForCount(currentWarnings)}
/>
```

- [ ] **Step 2: Verify imports**

Ensure these imports are present at the top of the file:

```typescript
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResultsTabWarnings } from '@/hooks/useResultsTabWarnings';
import { ResultsTabWarningModal } from '@/components/quiz/ResultsTabWarningModal';
```

- [ ] **Step 3: Manually verify in dev server**

Run: `pnpm run dev`

1. Publish a quiz with tab-warning ON, threshold=2
2. Sign in as a student and open results
3. Switch to another tab, return — modal should appear "Warning 1 of 2"
4. Dismiss, switch tabs again, return — modal should appear "Warning 2 of 2 — next time you leave, you will be locked out"
5. Dismiss, switch tabs again, return — should be redirected to My Assignments (no modal)
6. Verify the response doc in Firestore now has `resultsTabWarnings: 3` and `resultsLockedOut: true`

(Note: in step 5 the student returns to a locked state, then the redirect fires. There's no flash because the redirect runs synchronously on the next render.)

- [ ] **Step 4: Commit**

```bash
git add components/widgets/QuizWidget/Widget.tsx
git commit -m "feat(quiz): wire tab-warning hook + modal + lockout redirect"
```

---

### Task 10: Locked-card indicator on `AssignmentListItem`

**Files:**

- Modify: `components/student/AssignmentListItem.tsx`

- [ ] **Step 1: Locate the response-doc subscription**

`AssignmentListItem` already probes `quiz_sessions/{sessionId}/responses/{responseKey}` for completion state. Find the existing read (likely a `useEffect` + `getDoc` or `onSnapshot` for the response).

- [ ] **Step 2: Surface `resultsLockedOut` from the response read**

Extend the existing state to capture `resultsLockedOut`:

```typescript
const [lockedOut, setLockedOut] = useState(false);
// in the existing response-doc handler:
//   setLockedOut(snapshot.data()?.resultsLockedOut === true);
```

- [ ] **Step 3: Render the lock indicator + tap message**

Add to the rendered card (inside the existing card layout, alongside other status badges):

```tsx
import { Lock } from 'lucide-react';
// ...
{
  lockedOut && (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        // Use existing toast / dialog primitive — `useToast()` or `useDialog()`.
        // Grep the file for an existing toast call; reuse that import.
        showLockedToast();
      }}
      aria-label="Results locked"
      className="ml-2 inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-200"
    >
      <Lock className="h-3 w-3" />
      Locked
    </button>
  );
}
```

Implement `showLockedToast` using the existing toast mechanism in the file. Message: `"Locked by your teacher. Ask them to unlock your results."`

Also gate the card's primary tap action when locked:

```typescript
const handlePrimaryTap = () => {
  if (lockedOut) {
    showLockedToast();
    return;
  }
  // existing navigation to results view
};
```

- [ ] **Step 4: Manually verify**

Run dev server, lock a student out via the steps in Task 9, then verify:

- Their Completed list shows the assignment card with a "Locked" pill
- Tapping the card OR the pill shows the toast, does NOT navigate to results

- [ ] **Step 5: Commit**

```bash
git add components/student/AssignmentListItem.tsx
git commit -m "feat(quiz): show locked badge + toast on results-locked assignment card"
```

---

### Task 11: Update Firestore security rules

**Files:**

- Modify: `firestore.rules`

- [ ] **Step 1: Find the existing rule for `/quiz_sessions/{sessionId}/responses/{responseKey}`**

`firestore.rules` already has a block for response writes. Locate it (search for `quiz_sessions`).

- [ ] **Step 2: Add the new fields to the allowed-update logic**

Inside the existing `allow update:` clause for response docs, ensure:

1. **Students** (writing their own response) can write `resultsTabWarnings` and `resultsLockedOut` and `resultsLockedOutAt`, but `resultsTabWarnings` must be `>=` the current value (no decrementing) AND `resultsLockedOut` must be either unchanged or transitioning `false → true` (never `true → false`).
2. **Teachers** (verified via existing teacher-of-session helper) can decrement `resultsTabWarnings` and flip `resultsLockedOut` from `true → false`.

Concrete rule snippet to merge with the existing block — adapt to the file's existing helper functions:

```javascript
// inside match /quiz_sessions/{sessionId}/responses/{responseKey} { ... }

function isResultsFieldsOnly(after, before) {
  // Returns true if only results-* fields changed (used to scope student writes
  // narrowly when their session is in published-results state).
  return after.diff(before).affectedKeys()
    .hasOnly(['resultsTabWarnings', 'resultsLockedOut', 'resultsLockedOutAt']);
}

function studentResultsWriteValid(after, before) {
  let nextWarnings = after.get('resultsTabWarnings', 0);
  let prevWarnings = before.get('resultsTabWarnings', 0);
  let nextLocked = after.get('resultsLockedOut', false);
  let prevLocked = before.get('resultsLockedOut', false);
  return nextWarnings >= prevWarnings
      && (nextLocked == prevLocked || (prevLocked == false && nextLocked == true));
}

allow update: if
  // Existing teacher rule (full write access in their own session) — unchanged
  isTeacherOfSession(sessionId)
  // OR existing student rule (writes to own response) — unchanged
  || (isOwnerOfResponse(responseKey) && /* existing constraints */)
  // PLUS new narrow rule: students can write results-* fields only when monotonic
  || (isOwnerOfResponse(responseKey)
      && isResultsFieldsOnly(request.resource.data, resource.data)
      && studentResultsWriteValid(request.resource.data, resource.data));
```

- [ ] **Step 3: Write rules test**

Create `tests/firestore-rules/results-protection.rules.test.ts` (mirror the pattern of any existing rules test in `tests/`):

```typescript
import { describe, it, expect } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';

describe('results-protection response writes', () => {
  it('student can increment resultsTabWarnings', async () => {
    // setup: response doc with resultsTabWarnings: 1
    // act: student updates to 2
    // assert: succeeds
  });
  it('student cannot decrement resultsTabWarnings', async () => {
    // setup: 2
    // act: student tries to set to 1
    // assert: fails
  });
  it('student cannot unlock themselves', async () => {
    // setup: resultsLockedOut: true
    // act: student tries to set resultsLockedOut: false
    // assert: fails
  });
  it('teacher can decrement warnings AND clear lockout', async () => {
    // setup: warnings: 3, locked: true
    // act: teacher updates warnings: 2, locked: false
    // assert: succeeds
  });
});
```

Run: `pnpm vitest run tests/firestore-rules/results-protection.rules.test.ts`
Expected: PASS after the rule edits.

- [ ] **Step 4: Deploy rules locally (Firebase emulator) and verify**

If the project uses the Firebase emulator for tests, ensure the emulator is running:

```bash
firebase emulators:start --only firestore
```

Re-run the rules tests against the emulator.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/firestore-rules/results-protection.rules.test.ts
git commit -m "feat(quiz): firestore rules for results-protection student/teacher writes"
```

---

## Phase 4 — Monitor View

### Task 12: Lock icon on monitor row + unlock affordance

**Files:**

- Modify: `components/widgets/QuizWidget/components/QuizLiveMonitor.tsx:2555-2765`

- [ ] **Step 1: Surface `resultsLockedOut` per row**

In the row-render function (around `QuizLiveMonitor.tsx:2555-2765`), the response doc is already in scope. Compute:

```typescript
const resultsLocked = response.resultsLockedOut === true;
const resultsWarnings = response.resultsTabWarnings ?? 0;
const resultsThreshold = session.protection?.tabWarningThreshold ?? 3;
```

- [ ] **Step 2: Render lock badge with warning count**

Inside the row JSX, alongside existing status badges (auto-submit, attempt-limit lock, etc.):

```tsx
import { Lock } from 'lucide-react';

{
  resultsLocked && (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-200">
      <Lock className="h-3 w-3" />
      Results locked ({resultsWarnings}/{resultsThreshold})
    </span>
  );
}
```

- [ ] **Step 3: Add the unlock action**

Locate the existing unlock affordance (`onUnlockStudent` for quiz-taking unlock — used at `QuizLiveMonitor.tsx:515-542` per the exploration). Add a sibling `onUnlockResultsForStudent` callback.

Below the row's other action buttons, add a row-level action (only when `resultsLocked === true`):

```tsx
{
  resultsLocked && (
    <button
      type="button"
      onClick={() => onUnlockResultsForStudent(response.responseKey)}
      className="ml-2 rounded-md bg-amber-500 px-3 py-1 text-xs font-medium text-slate-900 hover:bg-amber-400"
    >
      Unlock results
    </button>
  );
}
```

- [ ] **Step 4: Implement `unlockResultsForStudent`**

In whichever component owns the monitor's prop callbacks (`QuizLiveMonitor` itself or the wrapping container — search for `onUnlockStudent` definition), add:

```typescript
const unlockResultsForStudent = useCallback(
  async (responseKey: string) => {
    const ref = doc(db, `quiz_sessions/${sessionId}/responses/${responseKey}`);
    const snap = await getDoc(ref);
    const data = snap.data();
    const prev = data?.resultsTabWarnings ?? 0;
    // Decrement by 1, floored at 0. Clear lockout.
    await updateDoc(ref, {
      resultsTabWarnings: Math.max(0, prev - 1),
      resultsLockedOut: false,
      resultsLockedOutAt: deleteField(),
    });
  },
  [sessionId]
);
```

The decrement-by-1 is intentional: one more tab-switch will re-lock them (zero grace warnings post-unlock).

Pass `unlockResultsForStudent` into `QuizLiveMonitor` via props (alongside the existing `onUnlockStudent` prop).

- [ ] **Step 5: Manually verify**

1. Lock a student out via the steps in Task 9
2. Open the teacher's monitor view
3. Verify the row shows "Results locked (3/3)" pill + "Unlock results" button
4. Click unlock — verify Firestore shows `resultsTabWarnings: 2`, `resultsLockedOut: false`
5. Student returns to results — verify they can view results again
6. Student tab-switches once — verify they're locked again immediately

- [ ] **Step 6: Commit**

```bash
git add components/widgets/QuizWidget/components/QuizLiveMonitor.tsx
git commit -m "feat(quiz): monitor lock badge + unlock-results affordance"
```

---

### Task 13: Notification badge on monitor button

**Files:**

- Modify: `components/widgets/QuizWidget/components/QuizLiveMonitor.tsx` (or the parent component that renders the monitor's launch button)

- [ ] **Step 1: Find the "Monitor" launcher button**

Grep `components/widgets/QuizWidget/` for the existing button that opens the monitor view (its label probably contains "Monitor" or "Live"). Identify the parent component that owns it.

- [ ] **Step 2: Compute the locked-student count**

That parent already subscribes to the responses collection (or can reuse the subscription that `QuizLiveMonitor` does). Compute:

```typescript
const lockedCount = useMemo(
  () => responses.filter((r) => r.resultsLockedOut === true).length,
  [responses]
);
```

- [ ] **Step 3: Render the badge**

On the monitor button:

```tsx
<button onClick={openMonitor} className="relative ...">
  Monitor
  {lockedCount > 0 && (
    <span
      aria-label={`${lockedCount} student${lockedCount === 1 ? '' : 's'} locked`}
      className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-semibold text-white"
    >
      {lockedCount}
    </span>
  )}
</button>
```

- [ ] **Step 4: Manually verify**

1. Publish results to multiple students with tab-warning ON
2. Lock two of them out (impersonate / multi-tab)
3. Verify monitor button shows red `2` badge
4. Unlock one — verify badge updates to `1` in real time
5. Unlock the other — verify badge disappears

- [ ] **Step 5: Commit**

```bash
git add components/widgets/QuizWidget/components/QuizLiveMonitor.tsx
git commit -m "feat(quiz): monitor button badge counts results-locked students"
```

---

## Phase 5 — End-to-End Test

### Task 14: Playwright E2E covering the full loop

**Files:**

- Create: `tests/e2e/quiz-results-protection.spec.ts`

- [ ] **Step 1: Write the E2E test**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Quiz results screenshot protection', () => {
  test('publish with both options → student warns → locks → teacher unlocks → re-locks', async ({
    browser,
  }) => {
    // 1) Teacher: publish with watermark + tab-warning (threshold=2)
    const teacherContext = await browser.newContext({
      storageState: 'tests/e2e/fixtures/teacher.json',
    });
    const teacherPage = await teacherContext.newPage();
    await teacherPage.goto('/');
    // Navigate to quiz, open results, click "Publish results"
    // Check watermark + tab-warning toggles; set threshold to 2
    // Click confirm publish

    // 2) Student: open results, verify watermark renders
    const studentContext = await browser.newContext({
      storageState: 'tests/e2e/fixtures/student.json',
    });
    const studentPage = await studentContext.newPage();
    await studentPage.goto('/my-assignments?tab=completed');
    await studentPage.getByRole('link', { name: /quiz title/i }).click();
    await expect(studentPage.locator('svg[role="presentation"]')).toBeVisible();

    // 3) Trigger tab switch → return → expect "Warning 1 of 2" modal
    await studentPage.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(studentPage.getByText(/Warning 1 of 2/i)).toBeVisible();
    await studentPage.getByRole('button', { name: /I understand/i }).click();

    // 4) Second tab switch → expect redirect to My Assignments with locked card
    await studentPage.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(studentPage).toHaveURL(/my-assignments/);
    await expect(studentPage.getByText('Locked')).toBeVisible();

    // 5) Teacher: monitor shows locked badge, click unlock
    await teacherPage.goto('/'); // back to quiz widget
    await teacherPage.getByRole('button', { name: /Monitor/i }).click();
    await expect(
      teacherPage.getByText(/Results locked \(2\/2\)/)
    ).toBeVisible();
    await teacherPage.getByRole('button', { name: /Unlock results/i }).click();

    // 6) Student returns — opens results again successfully
    await studentPage.getByRole('link', { name: /quiz title/i }).click();
    await expect(studentPage.locator('svg[role="presentation"]')).toBeVisible();

    // 7) Tab switch once → immediately locked (zero grace warnings post-unlock)
    await studentPage.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(studentPage).toHaveURL(/my-assignments/);
    await expect(studentPage.getByText('Locked')).toBeVisible();
  });

  test('publish with neither option → no watermark, no tab tracking', async ({
    browser,
  }) => {
    // Teacher publishes with both toggles OFF
    // Student opens results: no <svg role="presentation">, tab-switches don't lock
  });

  test('remember-last-used pre-fills next publish', async ({ browser }) => {
    // Teacher publishes with watermark ON, tab-warning OFF, threshold=5
    // Teacher publishes a different assignment
    // Open the publish dialog: assert watermark checked, tab-warning unchecked, threshold=5
  });
});
```

- [ ] **Step 2: Run the E2E suite**

Run: `pnpm run test:e2e -- quiz-results-protection`
Expected: All three tests PASS.

- [ ] **Step 3: Run full validation**

Run: `pnpm run validate`
Expected: Type-check, lint, format-check, and unit tests all PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/quiz-results-protection.spec.ts
git commit -m "test(quiz): e2e for results screenshot protection flow"
```

---

## Phase 6 — Wrap-Up

### Task 15: Final manual verification + push

- [ ] **Step 1: Manual smoke test**

Run `pnpm run dev` and walk through the full feature once more end-to-end:

1. Sign in as teacher, open a quiz with several completed responses
2. Publish with both protections on, threshold=3
3. Verify "Publish Results" dialog remembers last-used on next publish
4. Sign in as student, verify watermark + tab-warning behavior
5. Lock a student out, verify monitor badge shows `1`
6. Unlock, verify badge clears, student returns, single tab switch re-locks
7. Confirm Completed assignment card shows lock pill and tap shows toast

- [ ] **Step 2: Run full validate one more time**

Run: `pnpm run validate`
Expected: PASS.

- [ ] **Step 3: Push to dev branch**

```bash
git push origin dev-paul
```

(Per memory note: dev-paul → main must use a regular merge commit, not squash. PRs from feature branches into dev-paul can squash.)

- [ ] **Step 4: Open PR**

```bash
gh pr create --title "Quiz results screenshot protection" --body "$(cat <<'EOF'
## Summary
- Watermark overlay (student name + publish timestamp) on published quiz results
- Tab-switch warning system with teacher-configurable threshold (1-10, default 3)
- Per-student warning count persists server-side; resets only on teacher unlock
- Lockout redirects student to My Assignments → Completed with a locked-card indicator
- Monitor view shows lock badge + unlock affordance (decrements warning count by 1)
- Both toggles at publish time, remembered per teacher via AppSettings

## Test plan
- [x] Unit: ResultsWatermark renders SVG pattern with name + timestamp
- [x] Unit: useResultsTabWarnings increments + flips lockout at threshold
- [x] Unit: publishAssignmentScores mirrors protection to session doc
- [x] Unit: Publish dialog reads/writes appSettings.lastResultsProtection
- [x] Rules: student can only monotonically increment, teacher can decrement
- [x] E2E: full publish → warn → lock → unlock → re-lock loop
- [x] Manual: watermark legibility doesn't block underlying content
- [x] Manual: monitor badge updates in real time as students lock/unlock
EOF
)"
```

---

## Out of Scope (Deferred)

The following were discussed but explicitly deferred per the design conversation:

- **Chrome-only browser enforcement (app-wide)** — a separate ticket. Touches login, every student/teacher route, has its own browser-detection edge cases (Chromium-based vs Chrome, iOS Safari masquerading as Chrome, ClassLink/Classroom embedded contexts, UA-string vs feature-detection). Should be scoped as its own plan.
- **Server-side screenshot detection (Screen Capture API)** — only works for `getDisplayMedia` invocations, not OS-level screenshots. Not worth the implementation cost for the deterrent it adds.
- **Teacher-gated review window** (results only viewable while teacher's monitor session is active) — strongest defense but adds workflow friction. Reconsider if watermark + tab-warning proves insufficient in practice.

---

## Self-Review Checklist (run after writing)

**Spec coverage:**

- ✅ Two toggles at publish time → Task 4
- ✅ Remember last-used per teacher → Tasks 1 (AppSettings), 3, 4
- ✅ Configurable threshold 1-10 default 3 → Task 4
- ✅ Warning count visible to student ("N of M") → Task 8
- ✅ Warnings persist per assignment (no reset on close/reopen) → Task 1 (server-side field), Task 11 (rule enforces monotonic)
- ✅ Warnings reset per-assignment (quiz 1 → quiz 2 fresh) → Naturally satisfied — counter is on the per-assignment response doc
- ✅ Lockout redirects to My Assignments Completed → Task 9
- ✅ Locked card indicator + tap message → Task 10
- ✅ Teacher monitor lock badge → Task 12
- ✅ Teacher monitor notification badge → Task 13
- ✅ Unlock decrements by 1 (zero grace) → Task 12
- ✅ Hide print/export when either toggle on → Task 6
- ✅ Watermark = student name + timestamp → Task 5
- ✅ Watermark + tab-warning are independent toggles → Task 1 (separate fields), Task 4 (separate UI)

**Type consistency:**

- `ResultsProtection` interface used consistently across all tasks
- `publishAssignmentScores` signature matches Task 2 wherever it's called
- `unlockResultsForStudent` defined in Task 12 and consumed by the monitor row in the same task

**No placeholders:** All code blocks contain real code. Where the plan says "search for X" or "verify Y", it's because the exact line varies by the engineer's read of the file at implementation time — those are not TODOs, they're verification steps.
