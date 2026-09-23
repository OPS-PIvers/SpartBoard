# Tab-Away Timer — Implementation Plan

**Date**: 2026-09-23 · **Branch**: `dev-paul` · **Status**: Draft. The decisions in §2 were settled in a design interview on 2026-09-23, and no code has been written yet. File paths and line numbers were checked against `dev-paul` at `658d140a4` on 2026-09-23, so re-verify them before relying on them.

Add a visible clock to the "TAB SWITCH DETECTED" overlay that students see when
they leave a quiz or video activity. Teachers can make the quiz auto-submit when
a student stays away too long. Clicking a student's warning count opens a
popover that lists every exit and how long it lasted.

---

## 1. How it works today

- **Student side (Quiz)**: `QuizStudentApp.tsx` listens for `visibilitychange`
  and `window.blur` (`QuizStudentApp.tsx:1703`). Each exit calls
  `reportTabSwitch` (`hooks/useQuizSession.ts:3303`), which runs
  `increment(1)` on `tabSwitchWarnings` and shows the red overlay
  (`QuizStudentApp.tsx:3061`) with an "I Understand" button. When the count
  reaches the effective threshold, the quiz auto-submits.
- **Threshold**: the value is 1–10 or `'off'`, and the default is 3
  (`utils/tabWarningThreshold.ts`). A per-student `StudentOverride`
  (`types.ts:5400`) wins over the session setting, which wins over the default.
- **Unlocked attempts**: after a teacher unlocks an attempt, the next exit
  submits immediately and no warning is shown.
- **Data**: the only record is a single counter, `tabSwitchWarnings`, with no
  timestamps and no durations. `firestore.rules` only lets the counter go up
  (`firestore.rules:3843`, `:4409`).
- **Video Activity**: `VideoActivityStudentApp.tsx` has its own copy of the
  tracker, and its threshold is **hardcoded to 3**
  (`VideoActivityStudentApp.tsx:851`).
- **Teacher side**: the count appears in the Monitor roster (`RosterList.tsx`,
  behind the `monitorShowTabWarnings` toggle, which is off by default), in
  Results (`QuizResults.tsx:3305`), in the Video Activity monitor and results,
  and in exports (`utils/assignmentExportShared.ts`).

## 2. Decisions

### 2.1 Timer model: return deadline

The clock starts when the student leaves, not when they come back. The
student sees it live if the page is still on screen (a window blur or split
screen) and sees the elapsed or remaining time when they return.

### 2.2 The existing warning count still applies

Every exit still counts as a warning, and reaching the threshold still
auto-submits. The timer is a second rule that works independently of the count.

### 2.3 The auto-submit setting sets the clock's direction

| Auto-submit if away too long | What the student sees    | Consequence                                      |
| ---------------------------- | ------------------------ | ------------------------------------------------ |
| Off (default)                | Counts up: "Away 0:12"   | None beyond the warning. The duration is logged. |
| On                           | Counts down: "0:18 left" | The quiz submits at 0.                           |

Durations are **always** recorded while tab warnings are on, whatever the
timer is set to, because the teacher popover depends on them.

### 2.4 Settings

- Add **Auto-submit if away too long** to the Quiz and Video Activity behavior
  panels (`QuizBehaviorSettingsPanel.tsx`, `VideoActivityBehaviorSettingsPanel.tsx`),
  directly below the threshold row. It is available only when tab warnings are on.
- **Seconds**: the default is 30s and the allowed range is 5s–5min. Offer
  presets (10s / 30s / 1m / 2m / 5m) plus a stepper. Capping at 5 minutes keeps
  the deadline under Chrome's heavier throttling of hidden tabs, which starts at 5 minutes.
- **Per-student override**: add it to `StudentOverride`, edited through
  `OverrideEditorRow`. The value is a number of seconds or "no auto-submit",
  for example to give extra time under an IEP/504 plan. The student's own
  override wins over the session setting, which wins over the default. Deliver
  it through the pointer doc the same way as `tabWarningThreshold`.
- **Video Activity** also gets the configurable warning threshold in place of
  the hardcoded 3.

### 2.5 Enforcement: client-side plus a check on reopen

- The exit (`leftAt`) is written to Firestore at the moment the student leaves.
- Hidden tabs still run timers (at about 1s precision for deadlines under 5
  minutes) and can still write to Firestore, so the hidden tab submits the quiz
  itself when the deadline passes.
- If the device was asleep or the tab was closed, then when the quiz next loads
  it finds the unfinished exit and submits right away if the deadline has passed.
- If the student never returns, the response stays in progress. The teacher
  sees "Away 14:02" live, and ending the session closes the exit out.
- **No new Cloud Function.** A scheduled sweep was considered and rejected.

### 2.6 Teacher popover

Clicking the warning count in the Monitor roster or in Results (Quiz and
Video Activity) opens:

```
#   Left at      On    Away   Outcome
1   10:32:14 AM  Q2    0:04   Returned
2   10:41:50 AM  Q7    0:37   Over limit
3   10:48:02 AM  Q7    1:12   Auto-submitted
Total away: 1:53
```

- **On**: the question index for a Quiz, or the video playback timestamp for
  a Video Activity.
- **Outcome**: `Returned` · `Over limit` (the exit passed the deadline while
  auto-submit was off) · `Auto-submitted` (by the threshold or the timer)
  · `Session ended` · `Away now` (an open exit that ticks live).
- For responses from before this change, the popover says "Exit details
  weren't recorded for this attempt."

### 2.7 Extras (decided by Claude, per the product owner's direction)

- **Live "Away 0:23" chip** on the Monitor roster. It sits behind the existing
  `monitorShowTabWarnings` toggle, which is hidden by default, so there is no
  new toggle. The popover is reached through that same column.
- **Export**: add a "Time away" column next to the warning count in
  `assignmentExportShared.ts`.
- **Student results screen**: not in scope for now. Students don't see their
  own exit log.

## 3. Implementation notes

### 3.1 Data model

Add to the response doc (Quiz responses and Video Activity responses):

```ts
tabExits?: Array<{
  leftAt: number;          // epoch ms (client)
  returnedAt?: number;     // unset while the exit is open
  durationMs?: number;     // performance.now()-based, not affected by clock changes
  questionIndex?: number;  // quiz
  videoTime?: number;      // video activity, seconds
  attempt: number;         // the counter never resets between attempts
  outcome?: 'returned' | 'over-limit' | 'auto-submitted' | 'session-ended';
}>;
```

- `tabSwitchWarnings` remains the source of truth for the **count**, so
  existing readers don't change.
- Cap `tabExits` at about 50 entries. After the cap, keep incrementing the
  counter but stop appending.

### 3.2 Firestore rules

Add `tabExits` to the list of fields students may change, for both response
collections. A student may only (a) append one new exit or (b) close their own
last open exit by setting `returnedAt`, `durationMs` and `outcome`. Earlier
entries must stay unchanged (compare list slices), and the size cap is
enforced. Add rules tests alongside `tests/rules/quizResponseProtection.test.ts`
and `videoActivityResponseProtection.test.ts`.

### 3.3 Shared hook

Move the two copies of the tracker into a single `useTabAwayTracker` hook. It
owns detection, the debounce, opening and closing exits, the deadline timer,
and the reopen check. It is used by both `QuizStudentApp` and
`VideoActivityStudentApp`. Keep the existing unlocked-attempt rule (the next
exit submits immediately).

### 3.4 Overlay

- The clock ring and digits go in the existing red overlay.
- For accessibility, announce the countdown through `aria-live` at 30s, 10s
  and 5s remaining, not every second.

### 3.5 Session paused or ended

If the session leaves `active` while an exit is open, close the exit with
`session-ended`.

## 4. Known limits and risks

- **Client-reported timing.** A student who knows DevTools could fake shorter
  durations. This is the same level of trust as the current counter.
- **Chromebook false positives.** The focus-loss poll and blurs from iframes
  or the read-aloud bar can create very short exits. With a 5s deadline that
  could submit a quiz by accident. Test on a real Chromebook before allowing
  short timers, and consider raising the 5s minimum.
- **Hidden-tab throttling.** Deadlines are capped at 5 minutes so they stay
  under Chrome's heavier throttling, which could otherwise delay a submit by up
  to about a minute.

## 5. Release

- Put the feature behind a new `GlobalFeature` id, for example `tab-away-timer`.
  Its `FEATURE_DEFAULTS` entry uses `defaultAccessLevel: 'admin'`,
  `defaultEnabled: true` and `missingDocPublic: false`.
- Gate the new settings row, the per-student override, the overlay clock and
  the teacher popover with `canAccessFeature('tab-away-timer')`. With the flag
  off, keep today's behavior: the plain overlay and count only.
- Record `tabExits` whether or not the flag is on, so that durations already
  exist once the popover opens to everyone.
- The PR names the flag and the path to open it: Admin Settings > Access >
  Global Settings > set to Public. Paul opens it after testing in prod. The
  changelog entry is added when the flag goes public.
