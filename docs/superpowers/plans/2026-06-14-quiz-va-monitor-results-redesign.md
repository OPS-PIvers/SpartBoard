# Quiz / Video Activity — Monitor & Results Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the teacher-facing Monitor and Results views of the Quiz and Video Activity widgets up to the polish of the modernized Library view, via shared atoms + per-view restyle.

**Architecture:** Build a small set of container-query-scaled shared atoms in `components/common/sessionViews/` (mirroring the library's design language), a unified `utils/scoreColor.ts` helper, and a DEV-only `/session-views-dev` harness. Then restyle the four views to consume them. No data/Firestore/scoring/grade-push logic changes — visual + header IA only, plus VA's score _color_ banding moving to the unified 80/60 scale.

**Tech Stack:** React 19, TypeScript (strict), Tailwind CSS (brand tokens + container queries), Vitest + @testing-library/react, lucide-react icons. Package manager `pnpm`. Path alias `@/` → repo root (no `src/`).

**Spec:** `docs/superpowers/specs/2026-06-14-quiz-va-monitor-results-redesign-design.md`

**Conventions:**

- All scaled UI uses `style={{ ... 'min(px, Ncqmin)' }}` — never hardcoded Tailwind size classes (`text-sm`, `w-12`, `size={24}`) in scaled content.
- Run a single test file with: `pnpm exec vitest run <path>`
- Type-check with: `pnpm run type-check`
- Full gate before any push: `pnpm run validate`
- Commit messages end with the required trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Work happens on branch `dev-paul` (already checked out).

---

## File Structure

**New — shared atoms (`components/common/sessionViews/`):**

- `SessionBadge.tsx` — tone-based status/info badge (`SessionTone` union).
- `ScorePill.tsx` — score chip using the unified helper.
- `StatTile.tsx` — KPI / overview stat tile on a glass surface.
- `SegmentedTabs.tsx` — pill tab control (extracted from `LibraryShell`).
- `SessionRow.tsx` — hairline list-row shell.
- `OverflowMenu.tsx` — kebab overflow menu.
- `ActionButton.tsx` — primary/secondary/danger button.
- `SessionViewHeader.tsx` — shared view header (back · status pulse · title/subtitle · actions slot).
- `index.ts` — barrel export.

**New — util & harness:**

- `utils/scoreColor.ts` — unified 80/60 score-color helper.
- `components/dev/SessionViewsDevHarness.tsx` — DEV-only visual harness.

**New — tests:**

- `tests/utils/scoreColor.test.ts`
- `tests/components/common/sessionViews/SessionBadge.test.tsx`
- `tests/components/common/sessionViews/ScorePill.test.tsx`
- `tests/components/common/sessionViews/StatTile.test.tsx`
- `tests/components/common/sessionViews/SegmentedTabs.test.tsx`
- `tests/components/common/sessionViews/SessionRow.test.tsx`
- `tests/components/common/sessionViews/OverflowMenu.test.tsx`
- `tests/components/common/sessionViews/ActionButton.test.tsx`
- `tests/components/common/sessionViews/SessionViewHeader.test.tsx`

**Modified:**

- `components/common/library/LibraryShell.tsx` — consume `SegmentedTabs`.
- `App.tsx` — register `/session-views-dev`.
- `components/widgets/QuizWidget/components/QuizLiveMonitor.tsx`
- `components/widgets/QuizWidget/components/QuizResults.tsx`
- `components/widgets/VideoActivityWidget/components/VideoActivityLiveMonitor.tsx`
- `components/widgets/VideoActivityWidget/components/Results.tsx`

---

## Task 1: `scoreColor` util (TDD)

**Files:**

- Create: `utils/scoreColor.ts`
- Test: `tests/utils/scoreColor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/utils/scoreColor.test.ts
import { describe, it, expect } from 'vitest';
import { scoreTone, scoreColorClasses } from '@/utils/scoreColor';

describe('scoreTone (unified 80/60 scale)', () => {
  it('maps the threshold boundaries', () => {
    expect(scoreTone(100)).toBe('success');
    expect(scoreTone(80)).toBe('success');
    expect(scoreTone(79)).toBe('warn');
    expect(scoreTone(60)).toBe('warn');
    expect(scoreTone(59)).toBe('danger');
    expect(scoreTone(0)).toBe('danger');
  });
});

describe('scoreColorClasses', () => {
  it('returns emerald / amber / red fragments by tone', () => {
    expect(scoreColorClasses(90).text).toBe('text-emerald-600');
    expect(scoreColorClasses(70).text).toBe('text-amber-600');
    expect(scoreColorClasses(30).text).toBe('text-brand-red-primary');
    expect(scoreColorClasses(90).bar).toBe('bg-emerald-500');
    expect(scoreColorClasses(70).band).toBe('bg-amber-50 border-amber-200');
    expect(scoreColorClasses(30).band).toBe('bg-rose-50 border-rose-200');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/utils/scoreColor.test.ts`
Expected: FAIL — cannot resolve `@/utils/scoreColor`.

- [ ] **Step 3: Write the implementation**

```ts
// utils/scoreColor.ts
/**
 * Unified score-color scale shared by the Quiz and Video Activity monitor and
 * results views — the single source of truth for green/amber/red banding so the
 * two widgets never drift apart again.
 *
 * Thresholds: >= 80 success, >= 60 warn, else danger. (Video Activity previously
 * used 70/40; unifying to 80/60 changes only the COLOR shown — never the numeric
 * score, accuracy math, or any grade pushed to Classroom/Schoology.)
 */
export type ScoreTone = 'success' | 'warn' | 'danger';

export interface ScoreColorClasses {
  /** Foreground text color, e.g. a score number. */
  text: string;
  /** Solid fill for a progress/accuracy bar. */
  bar: string;
  /** Soft background + border for a score-band card/row wash. */
  band: string;
}

const TONE_CLASSES: Record<ScoreTone, ScoreColorClasses> = {
  success: {
    text: 'text-emerald-600',
    bar: 'bg-emerald-500',
    band: 'bg-emerald-50 border-emerald-200',
  },
  warn: {
    text: 'text-amber-600',
    bar: 'bg-amber-500',
    band: 'bg-amber-50 border-amber-200',
  },
  danger: {
    text: 'text-brand-red-primary',
    bar: 'bg-brand-red-primary',
    band: 'bg-rose-50 border-rose-200',
  },
};

/** Map a 0–100 score to its tone using the unified 80/60 scale. */
export function scoreTone(score: number): ScoreTone {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warn';
  return 'danger';
}

/** Tailwind class fragments (text / bar / band) for a 0–100 score. */
export function scoreColorClasses(score: number): ScoreColorClasses {
  return TONE_CLASSES[scoreTone(score)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/utils/scoreColor.test.ts`
Expected: PASS (2 suites).

- [ ] **Step 5: Commit**

```bash
git add utils/scoreColor.ts tests/utils/scoreColor.test.ts
git commit -m "feat(sessionViews): unified scoreColor helper (80/60 scale)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `SessionBadge` atom

**Files:**

- Create: `components/common/sessionViews/SessionBadge.tsx`
- Test: `tests/components/common/sessionViews/SessionBadge.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/common/sessionViews/SessionBadge.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionBadge } from '@/components/common/sessionViews/SessionBadge';

describe('SessionBadge', () => {
  it('renders the label with success tone classes', () => {
    render(<SessionBadge tone="success" label="Done" />);
    const badge = screen.getByTestId('session-badge');
    expect(badge).toHaveTextContent('Done');
    expect(badge.className).toContain('bg-emerald-100');
    expect(badge.className).toContain('text-emerald-700');
  });

  it('renders a pulsing dot for success tone when dot is set', () => {
    const { container } = render(
      <SessionBadge tone="success" label="Live" dot />
    );
    const dot = container.querySelector('.animate-pulse');
    expect(dot).not.toBeNull();
  });

  it('uses neutral classes for neutral tone', () => {
    render(<SessionBadge tone="neutral" label="Ended" />);
    expect(screen.getByTestId('session-badge').className).toContain(
      'bg-slate-200'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/components/common/sessionViews/SessionBadge.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

```tsx
// components/common/sessionViews/SessionBadge.tsx
import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type SessionTone = 'success' | 'warn' | 'info' | 'neutral' | 'danger';

const TONE: Record<SessionTone, { bg: string; fg: string; dot: string }> = {
  success: {
    bg: 'bg-emerald-100',
    fg: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  warn: { bg: 'bg-amber-100', fg: 'text-amber-700', dot: 'bg-amber-500' },
  info: { bg: 'bg-blue-100', fg: 'text-blue-700', dot: 'bg-blue-500' },
  neutral: { bg: 'bg-slate-200', fg: 'text-slate-500', dot: 'bg-slate-400' },
  danger: { bg: 'bg-red-100', fg: 'text-red-700', dot: 'bg-red-500' },
};

interface SessionBadgeProps {
  tone: SessionTone;
  label: string;
  icon?: LucideIcon;
  /** Render a leading status dot (success dots pulse). */
  dot?: boolean;
  /** Reserve a fixed min-width so badges align in a column. */
  fixedWidth?: boolean;
}

/**
 * Tone-based status/info badge matching the library's badge language:
 * pill-shaped, uppercase, tracking-wide, fully container-query scaled.
 */
export const SessionBadge: React.FC<SessionBadgeProps> = ({
  tone,
  label,
  icon: Icon,
  dot = false,
  fixedWidth = false,
}) => {
  const t = TONE[tone];
  return (
    <span
      data-testid="session-badge"
      className={`inline-flex items-center justify-center rounded-full font-bold uppercase tracking-wide shrink-0 ${t.bg} ${t.fg}`}
      style={{
        gap: 'min(4px, 1cqmin)',
        minWidth: fixedWidth ? 'min(60px, 14cqmin)' : undefined,
        paddingInline: 'min(8px, 2cqmin)',
        paddingBlock: 'min(2px, 0.6cqmin)',
        fontSize: 'min(10px, 3cqmin)',
      }}
    >
      {dot && (
        <span
          className={`rounded-full ${t.dot} ${tone === 'success' ? 'animate-pulse' : ''}`}
          style={{ width: 'min(6px, 1.8cqmin)', height: 'min(6px, 1.8cqmin)' }}
        />
      )}
      {Icon && (
        <Icon
          style={{ width: 'min(12px, 4cqmin)', height: 'min(12px, 4cqmin)' }}
        />
      )}
      {label}
    </span>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/components/common/sessionViews/SessionBadge.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/common/sessionViews/SessionBadge.tsx tests/components/common/sessionViews/SessionBadge.test.tsx
git commit -m "feat(sessionViews): SessionBadge atom

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `ScorePill` atom

**Files:**

- Create: `components/common/sessionViews/ScorePill.tsx`
- Test: `tests/components/common/sessionViews/ScorePill.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/common/sessionViews/ScorePill.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScorePill } from '@/components/common/sessionViews/ScorePill';

describe('ScorePill', () => {
  it('renders rounded percent with the tone color', () => {
    render(<ScorePill score={90} display="percent" />);
    const pill = screen.getByTestId('score-pill');
    expect(pill).toHaveTextContent('90%');
    expect(pill.className).toContain('text-emerald-600');
  });

  it('renders count form as answered/total', () => {
    render(<ScorePill score={0} display="count" count={3} total={5} />);
    expect(screen.getByTestId('score-pill')).toHaveTextContent('3/5');
  });

  it('renders nothing when hidden', () => {
    const { container } = render(<ScorePill score={90} display="hidden" />);
    expect(container.querySelector('[data-testid="score-pill"]')).toBeNull();
  });

  it('shows points in brand-blue when gamified', () => {
    render(<ScorePill score={42} display="percent" gamified points={1200} />);
    const pill = screen.getByTestId('score-pill');
    expect(pill).toHaveTextContent('1200');
    expect(pill.className).toContain('text-brand-blue-dark');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/components/common/sessionViews/ScorePill.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

```tsx
// components/common/sessionViews/ScorePill.tsx
import React from 'react';
import { scoreColorClasses } from '@/utils/scoreColor';

interface ScorePillProps {
  /** 0–100 percentage; ignored when display is 'count' or 'hidden'. */
  score: number;
  display: 'percent' | 'count' | 'hidden';
  /** Answered count, used when display is 'count'. */
  count?: number;
  /** Total questions, used when display is 'count'. */
  total?: number;
  /** Gamified sessions show raw points in brand-blue rather than a graded color. */
  gamified?: boolean;
  /** Raw points to show when gamified. */
  points?: number;
}

/**
 * Score chip colored via the unified scoreColor helper. Supports the three
 * teacher score-display modes (percent / raw count / hidden) plus the gamified
 * points variant used by the live scoreboard.
 */
export const ScorePill: React.FC<ScorePillProps> = ({
  score,
  display,
  count,
  total,
  gamified = false,
  points,
}) => {
  if (display === 'hidden') return null;
  const colorClass = gamified
    ? 'text-brand-blue-dark'
    : scoreColorClasses(score).text;
  let text: string;
  if (gamified) text = `${points ?? 0}`;
  else if (display === 'count') text = `${count ?? 0}/${total ?? 0}`;
  else text = `${Math.round(score)}%`;
  return (
    <span
      data-testid="score-pill"
      className={`font-black tabular-nums shrink-0 ${colorClass}`}
      style={{ fontSize: 'min(14px, 4.5cqmin)' }}
    >
      {text}
    </span>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/components/common/sessionViews/ScorePill.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/common/sessionViews/ScorePill.tsx tests/components/common/sessionViews/ScorePill.test.tsx
git commit -m "feat(sessionViews): ScorePill atom

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `StatTile` atom

**Files:**

- Create: `components/common/sessionViews/StatTile.tsx`
- Test: `tests/components/common/sessionViews/StatTile.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/common/sessionViews/StatTile.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Users } from 'lucide-react';
import { StatTile } from '@/components/common/sessionViews/StatTile';

describe('StatTile', () => {
  it('renders value and label on a glass surface', () => {
    render(<StatTile icon={<Users />} value={12} label="Joined" />);
    const tile = screen.getByTestId('stat-tile');
    expect(tile).toHaveTextContent('12');
    expect(tile).toHaveTextContent('Joined');
    expect(tile.className).toContain('bg-white/70');
  });

  it('renders as a button and fires onClick when interactive', () => {
    const onClick = vi.fn();
    render(
      <StatTile
        icon={<Users />}
        value={3}
        label="Active"
        interactive
        onClick={onClick}
      />
    );
    const tile = screen.getByTestId('stat-tile');
    expect(tile.tagName).toBe('BUTTON');
    fireEvent.click(tile);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows the selected ring when selected', () => {
    render(
      <StatTile
        icon={<Users />}
        value={3}
        label="Active"
        interactive
        selected
      />
    );
    expect(screen.getByTestId('stat-tile').className).toContain(
      'ring-brand-blue-primary/40'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/components/common/sessionViews/StatTile.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

```tsx
// components/common/sessionViews/StatTile.tsx
import React from 'react';

type StatTone = 'blue' | 'amber' | 'green' | 'violet';

const ICON_TONE: Record<StatTone, string> = {
  blue: 'text-brand-blue-primary',
  amber: 'text-amber-600',
  green: 'text-emerald-600',
  violet: 'text-violet-600',
};

interface StatTileProps {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  tone?: StatTone;
  /** Interactive tiles get hover affordance + optional selected ring. */
  interactive?: boolean;
  selected?: boolean;
  onClick?: () => void;
  /** Expandable content (e.g. a student-name list) shown below the value. */
  children?: React.ReactNode;
}

/**
 * KPI / overview stat tile on a glass surface matching the library card
 * language. Replaces the bespoke StatBox / InteractiveStatBox / StatTile copies
 * across the monitor and results views.
 */
export const StatTile: React.FC<StatTileProps> = ({
  icon,
  value,
  label,
  tone = 'blue',
  interactive = false,
  selected = false,
  onClick,
  children,
}) => {
  const surface =
    'bg-white/70 border border-slate-200/60 rounded-2xl backdrop-blur-sm shadow-sm transition-all';
  const interactiveClass = interactive
    ? `cursor-pointer hover:bg-white/85 hover:shadow-md ${
        selected ? 'ring-2 ring-brand-blue-primary/40' : ''
      }`
    : '';
  const inner = (
    <>
      <div
        className={`flex items-center justify-center ${ICON_TONE[tone]}`}
        style={{ gap: 'min(4px, 1cqmin)', marginBottom: 'min(4px, 1cqmin)' }}
      >
        {icon}
      </div>
      <div
        className={`font-black leading-none ${ICON_TONE[tone]}`}
        style={{ fontSize: 'min(22px, 7cqmin)' }}
      >
        {value}
      </div>
      <div
        className="font-bold uppercase tracking-wider text-slate-500"
        style={{
          fontSize: 'min(10px, 3cqmin)',
          marginTop: 'min(3px, 0.8cqmin)',
        }}
      >
        {label}
      </div>
      {children}
    </>
  );
  const style: React.CSSProperties = { padding: 'min(10px, 2.5cqmin)' };
  if (interactive) {
    return (
      <button
        type="button"
        data-testid="stat-tile"
        onClick={onClick}
        className={`block w-full text-center ${surface} ${interactiveClass}`}
        style={style}
      >
        {inner}
      </button>
    );
  }
  return (
    <div
      data-testid="stat-tile"
      className={`text-center ${surface}`}
      style={style}
    >
      {inner}
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/components/common/sessionViews/StatTile.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/common/sessionViews/StatTile.tsx tests/components/common/sessionViews/StatTile.test.tsx
git commit -m "feat(sessionViews): StatTile atom

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `SegmentedTabs` atom + `LibraryShell` refactor

**Files:**

- Create: `components/common/sessionViews/SegmentedTabs.tsx`
- Test: `tests/components/common/sessionViews/SegmentedTabs.test.tsx`
- Modify: `components/common/library/LibraryShell.tsx` (replace the inline tab nav at lines ~238–297 with `<SegmentedTabs>`)

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/common/sessionViews/SegmentedTabs.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SegmentedTabs } from '@/components/common/sessionViews/SegmentedTabs';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'students', label: 'Students', count: 4 },
];

describe('SegmentedTabs', () => {
  it('marks the active tab with aria-selected and white surface', () => {
    render(<SegmentedTabs tabs={TABS} value="overview" onChange={vi.fn()} />);
    const active = screen.getByRole('tab', { name: 'Overview' });
    expect(active).toHaveAttribute('aria-selected', 'true');
    expect(active.className).toContain('bg-white');
  });

  it('fires onChange with the tab key', () => {
    const onChange = vi.fn();
    render(<SegmentedTabs tabs={TABS} value="overview" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Students' }));
    expect(onChange).toHaveBeenCalledWith('students');
  });

  it('renders a count badge when count > 0', () => {
    render(<SegmentedTabs tabs={TABS} value="overview" onChange={vi.fn()} />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('hides labels but keeps icons/aria when labelsHidden', () => {
    render(
      <SegmentedTabs
        tabs={TABS}
        value="overview"
        onChange={vi.fn()}
        labelsHidden
      />
    );
    // Label text not rendered, but the accessible name (aria-label) remains.
    expect(screen.queryByText('Overview')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/components/common/sessionViews/SegmentedTabs.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

```tsx
// components/common/sessionViews/SegmentedTabs.tsx
import React from 'react';

export interface SegmentedTab<K extends string = string> {
  key: K;
  label: string;
  icon?: React.ComponentType<{
    style?: React.CSSProperties;
    className?: string;
  }>;
  count?: number;
}

interface SegmentedTabsProps<K extends string = string> {
  tabs: SegmentedTab<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Collapse labels to icon-only (the caller measures width). */
  labelsHidden?: boolean;
  ariaLabel?: string;
}

/**
 * Segmented-pill tab control extracted from LibraryShell so the library and the
 * Quiz/VA results views share one tab component. Fully container-query scaled.
 */
export function SegmentedTabs<K extends string = string>({
  tabs,
  value,
  onChange,
  labelsHidden = false,
  ariaLabel,
}: SegmentedTabsProps<K>): React.ReactElement {
  return (
    <nav
      role="tablist"
      aria-label={ariaLabel}
      className="flex items-center rounded-xl bg-slate-200/50 min-w-0"
      style={{ padding: 'min(3px, 0.8cqmin)', gap: 'min(2px, 0.5cqmin)' }}
    >
      {tabs.map(({ key, label, icon: Icon, count }) => {
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={label}
            title={labelsHidden ? label : undefined}
            onClick={() => onChange(key)}
            className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-lg font-bold transition-colors ${
              selected
                ? 'bg-white text-brand-blue-dark shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            style={{
              gap: 'min(6px, 1.5cqmin)',
              paddingInline: 'min(12px, 2.8cqmin)',
              paddingBlock: 'min(6px, 1.5cqmin)',
              fontSize: 'min(13px, 3.8cqmin)',
            }}
          >
            {Icon && (
              <Icon
                style={{
                  width: 'min(14px, 4cqmin)',
                  height: 'min(14px, 4cqmin)',
                }}
                className="shrink-0"
              />
            )}
            {!labelsHidden && <span>{label}</span>}
            {count != null && count > 0 && (
              <span
                className={`inline-flex items-center justify-center rounded-full font-bold leading-none ${
                  selected
                    ? 'bg-brand-blue-primary text-white'
                    : 'bg-slate-200/70 text-slate-600'
                }`}
                style={{
                  paddingInline: 'min(7px, 1.8cqmin)',
                  paddingBlock: 'min(2px, 0.5cqmin)',
                  fontSize: 'min(10px, 3cqmin)',
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/components/common/sessionViews/SegmentedTabs.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Refactor `LibraryShell` to consume `SegmentedTabs`**

In `components/common/library/LibraryShell.tsx`:

1. Add the import near the top:

```tsx
import { SegmentedTabs } from '@/components/common/sessionViews/SegmentedTabs';
```

2. Replace the entire inline `<nav role="tablist"> ... </nav>` block (currently the first child of the chrome `<div>`, the branch rendered when `tabs.length > 0`) with:

```tsx
<SegmentedTabs
  tabs={tabs}
  value={tab}
  onChange={onTabChange}
  labelsHidden={tabLabelsHidden}
  ariaLabel={`${widgetLabel} library tabs`}
/>
```

Leave everything else (width measurement, `tabLabelsHidden`, the action buttons, folder panel) unchanged. The `tabs` array's element type (`TabDef`) is structurally assignable to `SegmentedTab<LibraryTab>` (icon accepts `{ size?, className?, style? }` which satisfies the narrower `{ style?, className? }`; `count` is `number | undefined`).

- [ ] **Step 6: Verify the library still type-checks and its tests pass**

Run: `pnpm run type-check`
Expected: no errors.

Run: `pnpm exec vitest run tests/components/AssignmentArchiveCard.test.tsx tests/components/common/LibraryGrid.test.tsx tests/components/LibraryItemCard.doubleClick.test.tsx tests/components/common/library/LibraryPreviewPane.width.test.tsx`
Expected: PASS (library suites unaffected).

- [ ] **Step 7: Commit**

```bash
git add components/common/sessionViews/SegmentedTabs.tsx tests/components/common/sessionViews/SegmentedTabs.test.tsx components/common/library/LibraryShell.tsx
git commit -m "feat(sessionViews): SegmentedTabs atom + LibraryShell adopts it

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `SessionRow` atom

**Files:**

- Create: `components/common/sessionViews/SessionRow.tsx`
- Test: `tests/components/common/sessionViews/SessionRow.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/common/sessionViews/SessionRow.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionRow } from '@/components/common/sessionViews/SessionRow';

describe('SessionRow', () => {
  it('renders children and a hairline bottom border', () => {
    render(
      <SessionRow trailing={<span>99%</span>}>
        <span>Ada Lovelace</span>
      </SessionRow>
    );
    const row = screen.getByTestId('session-row');
    expect(row).toHaveTextContent('Ada Lovelace');
    expect(row).toHaveTextContent('99%');
    expect(row.className).toContain('border-b');
  });

  it('applies a score-band wash when tintTone is set', () => {
    render(
      <SessionRow tintTone="success">
        <span>x</span>
      </SessionRow>
    );
    expect(screen.getByTestId('session-row').className).toContain(
      'bg-emerald-50/60'
    );
  });

  it('fires onClick', () => {
    const onClick = vi.fn();
    render(
      <SessionRow onClick={onClick}>
        <span>x</span>
      </SessionRow>
    );
    fireEvent.click(screen.getByTestId('session-row'));
    expect(onClick).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/components/common/sessionViews/SessionRow.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

```tsx
// components/common/sessionViews/SessionRow.tsx
import React from 'react';
import type { ScoreTone } from '@/utils/scoreColor';

type DotTone = 'success' | 'warn' | 'neutral' | 'danger';

const TINT: Record<ScoreTone, string> = {
  success: 'bg-emerald-50/60',
  warn: 'bg-amber-50/60',
  danger: 'bg-rose-50/60',
};

const DOT_COLOR: Record<DotTone, string> = {
  success: 'bg-emerald-500',
  warn: 'bg-amber-500',
  neutral: 'bg-slate-400',
  danger: 'bg-red-500',
};

interface SessionRowProps {
  /** Leading status dot; pulse for live. Omit to render an empty reserved slot. */
  dot?: { tone: DotTone; pulse?: boolean };
  /** Subtle full-row score-band wash (teacher "colors" toggle). */
  tintTone?: ScoreTone;
  /** Main row content (name, badges, meta). */
  children: React.ReactNode;
  /** Right-aligned trailing slot (score pill, actions, overflow). */
  trailing?: React.ReactNode;
  onClick?: () => void;
}

/**
 * Hairline list-row shell matching the library's list rows: gapless container
 * (each row carries its own bottom border), a reserved status-dot slot for
 * column alignment, an optional score-band wash, and a transient hover. Content
 * and trailing slot are supplied by each view.
 */
export const SessionRow: React.FC<SessionRowProps> = ({
  dot,
  tintTone,
  children,
  trailing,
  onClick,
}) => {
  return (
    <div
      data-testid="session-row"
      onClick={onClick}
      className={`flex items-center border-b border-slate-200/60 last:border-b-0 rounded-lg transition-colors ${
        tintTone ? TINT[tintTone] : 'hover:bg-white/60'
      } ${onClick ? 'cursor-pointer' : ''}`}
      style={{
        gap: 'min(10px, 2.2cqmin)',
        paddingInline: 'min(12px, 2.6cqmin)',
        paddingBlock: 'min(10px, 2.2cqmin)',
      }}
    >
      <div
        className="flex shrink-0 items-center justify-center"
        style={{ width: 'min(8px, 2cqmin)' }}
        aria-hidden="true"
      >
        {dot && (
          <span
            className={`rounded-full ${DOT_COLOR[dot.tone]} ${
              dot.pulse ? 'animate-pulse' : ''
            }`}
            style={{ width: 'min(8px, 2cqmin)', height: 'min(8px, 2cqmin)' }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
      {trailing && (
        <div
          className="flex items-center shrink-0"
          style={{ gap: 'min(8px, 2cqmin)' }}
        >
          {trailing}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/components/common/sessionViews/SessionRow.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/common/sessionViews/SessionRow.tsx tests/components/common/sessionViews/SessionRow.test.tsx
git commit -m "feat(sessionViews): SessionRow hairline row shell

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `OverflowMenu` atom

**Files:**

- Create: `components/common/sessionViews/OverflowMenu.tsx`
- Test: `tests/components/common/sessionViews/OverflowMenu.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/common/sessionViews/OverflowMenu.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OverflowMenu } from '@/components/common/sessionViews/OverflowMenu';

describe('OverflowMenu', () => {
  it('opens on click and shows items', () => {
    render(<OverflowMenu items={[{ label: 'Export', onClick: vi.fn() }]} />);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Export' })
    ).toBeInTheDocument();
  });

  it('fires the item onClick and closes', () => {
    const onClick = vi.fn();
    render(<OverflowMenu items={[{ label: 'Export', onClick }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/components/common/sessionViews/OverflowMenu.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

```tsx
// components/common/sessionViews/OverflowMenu.tsx
import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface OverflowMenuItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface OverflowMenuProps {
  items: OverflowMenuItem[];
  ariaLabel?: string;
}

/**
 * Kebab overflow menu matching the library dropdown surface. Used to declutter
 * the results-view headers — secondary actions live here.
 */
export const OverflowMenu: React.FC<OverflowMenuProps> = ({
  items,
  ariaLabel = 'More actions',
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // External-system sync (document click) — a valid useEffect use.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-white/70 hover:text-brand-blue-primary"
        style={{ width: 'min(36px, 10cqmin)', height: 'min(36px, 10cqmin)' }}
      >
        <MoreHorizontal
          style={{ width: 'min(18px, 5cqmin)', height: 'min(18px, 5cqmin)' }}
        />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-50 min-w-[176px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  item.destructive
                    ? 'text-brand-red-dark hover:bg-brand-red-lighter/30'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {Icon && <Icon size={16} className="shrink-0" />}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/components/common/sessionViews/OverflowMenu.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/common/sessionViews/OverflowMenu.tsx tests/components/common/sessionViews/OverflowMenu.test.tsx
git commit -m "feat(sessionViews): OverflowMenu atom

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `ActionButton` atom

**Files:**

- Create: `components/common/sessionViews/ActionButton.tsx`
- Test: `tests/components/common/sessionViews/ActionButton.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/common/sessionViews/ActionButton.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Play } from 'lucide-react';
import { ActionButton } from '@/components/common/sessionViews/ActionButton';

describe('ActionButton', () => {
  it('renders label + primary styling and fires onClick', () => {
    const onClick = vi.fn();
    render(
      <ActionButton
        variant="primary"
        label="Export"
        icon={Play}
        onClick={onClick}
      />
    );
    const btn = screen.getByRole('button', { name: 'Export' });
    expect(btn).toHaveTextContent('Export');
    expect(btn.className).toContain('bg-brand-blue-primary');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });

  it('uses danger styling for the danger variant', () => {
    render(<ActionButton variant="danger" label="End" onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'End' }).className).toContain(
      'bg-brand-red-primary'
    );
  });

  it('hides the label text but keeps the accessible name when labelHidden', () => {
    render(
      <ActionButton
        variant="secondary"
        label="Scoreboard"
        icon={Play}
        onClick={vi.fn()}
        labelHidden
      />
    );
    expect(screen.queryByText('Scoreboard')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Scoreboard' })
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/components/common/sessionViews/ActionButton.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

```tsx
// components/common/sessionViews/ActionButton.tsx
import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface ActionButtonProps {
  variant: 'primary' | 'secondary' | 'danger';
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  /** Collapse to icon-only (tooltip shows the label). */
  labelHidden?: boolean;
}

const VARIANT: Record<ActionButtonProps['variant'], string> = {
  primary: 'bg-brand-blue-primary hover:bg-brand-blue-dark text-white',
  secondary:
    'bg-white/70 backdrop-blur-sm hover:bg-brand-blue-lighter/40 text-brand-blue-primary border border-brand-blue-primary/20',
  danger: 'bg-brand-red-primary hover:bg-brand-red-dark text-white',
};

/**
 * Action button matching the library header buttons. Primary/secondary mirror
 * LibraryShell; danger adds the brand-red destructive variant for End-session.
 */
export const ActionButton: React.FC<ActionButtonProps> = ({
  variant,
  label,
  icon: Icon,
  onClick,
  disabled = false,
  disabledReason,
  labelHidden = false,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={disabled ? disabledReason : labelHidden ? label : undefined}
    aria-label={label}
    className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT[variant]}`}
    style={{
      paddingInline: labelHidden ? '0' : 'min(14px, 3cqmin)',
      paddingBlock: 'min(8px, 1.8cqmin)',
      fontSize: 'min(14px, 4cqmin)',
      minWidth: labelHidden ? 'min(36px, 10cqmin)' : undefined,
      height: labelHidden ? 'min(36px, 10cqmin)' : undefined,
    }}
  >
    {Icon && (
      <Icon
        style={{ width: 'min(16px, 4.5cqmin)', height: 'min(16px, 4.5cqmin)' }}
        className="shrink-0"
      />
    )}
    {!labelHidden && <span className="truncate">{label}</span>}
  </button>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/components/common/sessionViews/ActionButton.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/common/sessionViews/ActionButton.tsx tests/components/common/sessionViews/ActionButton.test.tsx
git commit -m "feat(sessionViews): ActionButton atom

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `SessionViewHeader` atom + barrel export

**Files:**

- Create: `components/common/sessionViews/SessionViewHeader.tsx`
- Create: `components/common/sessionViews/index.ts`
- Test: `tests/components/common/sessionViews/SessionViewHeader.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/common/sessionViews/SessionViewHeader.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionViewHeader } from '@/components/common/sessionViews/SessionViewHeader';

describe('SessionViewHeader', () => {
  it('renders title/subtitle and fires onBack', () => {
    const onBack = vi.fn();
    render(
      <SessionViewHeader onBack={onBack} title="My Quiz" subtitle="Period 3" />
    );
    expect(screen.getByText('My Quiz')).toBeInTheDocument();
    expect(screen.getByText('Period 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('shows a live status pill', () => {
    render(<SessionViewHeader onBack={vi.fn()} status="live" title="Q" />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders the actions slot', () => {
    render(
      <SessionViewHeader
        onBack={vi.fn()}
        title="Q"
        actions={<button type="button">End</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'End' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/components/common/sessionViews/SessionViewHeader.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

```tsx
// components/common/sessionViews/SessionViewHeader.tsx
import React from 'react';
import { ChevronLeft } from 'lucide-react';

type ViewStatus = 'live' | 'paused' | 'ended' | 'none';

interface SessionViewHeaderProps {
  onBack: () => void;
  status?: ViewStatus;
  title: string;
  subtitle?: string;
  /** Right-aligned action buttons / overflow. */
  actions?: React.ReactNode;
}

const STATUS: Record<
  Exclude<ViewStatus, 'none'>,
  { dot: string; label: string; text: string; pulse: boolean }
> = {
  live: {
    dot: 'bg-brand-red-primary',
    label: 'Live',
    text: 'text-brand-red-primary',
    pulse: true,
  },
  paused: {
    dot: 'bg-amber-500',
    label: 'Paused',
    text: 'text-amber-600',
    pulse: false,
  },
  ended: {
    dot: 'bg-slate-400',
    label: 'Ended',
    text: 'text-slate-500',
    pulse: false,
  },
};

/**
 * Shared header for the monitor and results views: glass chrome, back button,
 * an optional live/paused/ended status pulse, title/subtitle, and a
 * right-aligned actions slot. Matches the library header surface.
 */
export const SessionViewHeader: React.FC<SessionViewHeaderProps> = ({
  onBack,
  status = 'none',
  title,
  subtitle,
  actions,
}) => {
  const s = status !== 'none' ? STATUS[status] : null;
  return (
    <div
      className="flex items-center justify-between bg-white/60 backdrop-blur-sm border-b border-slate-200/70 shrink-0"
      style={{
        gap: 'min(12px, 2.5cqmin)',
        paddingInline: 'min(16px, 3.5cqmin)',
        paddingBlock: 'min(8px, 1.8cqmin)',
      }}
    >
      <div
        className="flex items-center min-w-0"
        style={{ gap: 'min(10px, 2.2cqmin)' }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="inline-flex shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-white/70 hover:text-brand-blue-primary"
          style={{ width: 'min(32px, 8cqmin)', height: 'min(32px, 8cqmin)' }}
        >
          <ChevronLeft
            style={{ width: 'min(18px, 5cqmin)', height: 'min(18px, 5cqmin)' }}
          />
        </button>
        {s && (
          <span
            className="flex shrink-0 items-center"
            style={{ gap: 'min(5px, 1.2cqmin)' }}
          >
            <span
              className={`rounded-full ${s.dot} ${s.pulse ? 'animate-pulse' : ''}`}
              style={{ width: 'min(8px, 2cqmin)', height: 'min(8px, 2cqmin)' }}
            />
            <span
              className={`font-black uppercase tracking-tight leading-none ${s.text}`}
              style={{ fontSize: 'min(12px, 4cqmin)' }}
            >
              {s.label}
            </span>
          </span>
        )}
        <div className="min-w-0">
          <div
            className="font-black text-slate-800 truncate"
            style={{ fontSize: 'min(15px, 4.8cqmin)' }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              className="font-medium text-slate-500 truncate"
              style={{ fontSize: 'min(11px, 3.2cqmin)' }}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {actions && (
        <div
          className="flex items-center shrink-0"
          style={{ gap: 'min(8px, 2cqmin)' }}
        >
          {actions}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Write the barrel export**

```ts
// components/common/sessionViews/index.ts
export { SessionViewHeader } from './SessionViewHeader';
export { SegmentedTabs } from './SegmentedTabs';
export type { SegmentedTab } from './SegmentedTabs';
export { StatTile } from './StatTile';
export { SessionBadge } from './SessionBadge';
export type { SessionTone } from './SessionBadge';
export { ScorePill } from './ScorePill';
export { SessionRow } from './SessionRow';
export { OverflowMenu } from './OverflowMenu';
export type { OverflowMenuItem } from './OverflowMenu';
export { ActionButton } from './ActionButton';
```

- [ ] **Step 5: Run test + type-check**

Run: `pnpm exec vitest run tests/components/common/sessionViews/SessionViewHeader.test.tsx`
Expected: PASS (3 tests).

Run: `pnpm run type-check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/common/sessionViews/SessionViewHeader.tsx components/common/sessionViews/index.ts tests/components/common/sessionViews/SessionViewHeader.test.tsx
git commit -m "feat(sessionViews): SessionViewHeader atom + barrel export

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: DEV-only `/session-views-dev` harness

**Files:**

- Create: `components/dev/SessionViewsDevHarness.tsx`
- Modify: `App.tsx` (register the route, mirroring `/library-dev`)

This harness renders the four **real** view components against mock data so every visual state can be checked without Firestore. The views call `useAuth` / `useDialog` / `useDashboard`, so the harness wraps them in the same provider stack the teacher app uses and relies on `VITE_AUTH_BYPASS=true` (see CLAUDE.md → "Authentication Bypass") to supply a mock admin user without Firestore listeners.

- [ ] **Step 1: Read the mock-data type shapes**

Read these type definitions so the mock builders satisfy every required (non-optional) field:

- `types.ts` — `QuizSession`, `QuizResponse`, `QuizData`, `QuizQuestion`, `QuizConfig`, `VideoActivitySession`, `VideoActivityResponse`, `VideoActivityQuestion`.

Note required fields and their types; the builders below show the shape — fill in any additional required fields TypeScript flags.

- [ ] **Step 2: Write the harness**

```tsx
// components/dev/SessionViewsDevHarness.tsx
import React, { useState } from 'react';
import { DialogProvider } from '@/context/DialogContext';
import { AuthProvider } from '@/context/AuthContext';
import { CustomWidgetsProvider } from '@/context/CustomWidgetsContext';
import { SavedWidgetsProvider } from '@/context/SavedWidgetsContext';
import { DashboardProvider } from '@/context/DashboardContext';
import { QuizLiveMonitor } from '@/components/widgets/QuizWidget/components/QuizLiveMonitor';
import { QuizResults } from '@/components/widgets/QuizWidget/components/QuizResults';
import { VideoActivityLiveMonitor } from '@/components/widgets/VideoActivityWidget/components/VideoActivityLiveMonitor';
import { Results as VideoActivityResults } from '@/components/widgets/VideoActivityWidget/components/Results';
import {
  makeQuizSession,
  makeQuizResponses,
  makeQuizData,
  makeQuizConfig,
  makeVaSession,
  makeVaResponses,
} from './sessionViewsMocks';

type ViewKey = 'quiz-monitor' | 'quiz-results' | 'va-monitor' | 'va-results';
type StateKey = 'waiting' | 'live' | 'paused' | 'ended' | 'populated' | 'empty';

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'quiz-monitor', label: 'Quiz Monitor' },
  { key: 'quiz-results', label: 'Quiz Results' },
  { key: 'va-monitor', label: 'VA Monitor' },
  { key: 'va-results', label: 'VA Results' },
];

const WIDTHS = [340, 520, 820];

const noop = async (): Promise<void> => undefined;

export const SessionViewsDevHarness: React.FC = () => {
  const [view, setView] = useState<ViewKey>('quiz-monitor');
  const [state, setState] = useState<StateKey>('live');
  const [width, setWidth] = useState<number>(520);

  const renderView = (): React.ReactNode => {
    if (view === 'quiz-monitor') {
      return (
        <QuizLiveMonitor
          session={makeQuizSession(state)}
          responses={state === 'waiting' ? [] : makeQuizResponses()}
          quizData={makeQuizData()}
          config={makeQuizConfig()}
          rosters={[]}
          onAdvance={noop}
          onEnd={noop}
          onPause={noop}
          onResume={noop}
          onUpdateConfig={noop}
          onRemoveStudent={noop}
          onUnlockStudent={noop}
          onUnlockResultsForStudent={noop}
          onRevealAnswer={noop}
          onBack={() => undefined}
        />
      );
    }
    if (view === 'quiz-results') {
      return (
        <QuizResults
          responses={state === 'empty' ? [] : makeQuizResponses()}
          quiz={makeQuizData()}
          config={makeQuizConfig()}
          session={makeQuizSession('ended')}
          onBack={() => undefined}
        />
      );
    }
    if (view === 'va-monitor') {
      return (
        <VideoActivityLiveMonitor
          session={makeVaSession(state)}
          responses={state === 'waiting' ? [] : makeVaResponses()}
          onEnd={noop}
          onPause={noop}
          onResume={noop}
          onUnlockStudent={noop}
          onBack={() => undefined}
        />
      );
    }
    return (
      <VideoActivityResults
        session={makeVaSession('ended')}
        responses={state === 'empty' ? [] : makeVaResponses()}
        onBack={() => undefined}
      />
    );
  };

  return (
    <DialogProvider>
      <AuthProvider>
        <CustomWidgetsProvider>
          <SavedWidgetsProvider>
            <DashboardProvider>
              <div className="min-h-screen bg-slate-100 p-6">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <select
                    value={view}
                    onChange={(e) => setView(e.target.value as ViewKey)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold"
                  >
                    {VIEWS.map((v) => (
                      <option key={v.key} value={v.key}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={state}
                    onChange={(e) => setState(e.target.value as StateKey)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold"
                  >
                    {(
                      [
                        'waiting',
                        'live',
                        'paused',
                        'ended',
                        'populated',
                        'empty',
                      ] as StateKey[]
                    ).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    {WIDTHS.map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setWidth(w)}
                        className={`rounded-lg px-3 py-2 text-sm font-bold ${
                          width === w
                            ? 'bg-brand-blue-primary text-white'
                            : 'bg-white text-slate-600 border border-slate-300'
                        }`}
                      >
                        {w}px
                      </button>
                    ))}
                  </div>
                </div>
                <div
                  className="mx-auto overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-lg"
                  style={{
                    width,
                    height: 640,
                    containerType: 'size',
                  }}
                >
                  {renderView()}
                </div>
              </div>
            </DashboardProvider>
          </SavedWidgetsProvider>
        </CustomWidgetsProvider>
      </AuthProvider>
    </DialogProvider>
  );
};
```

- [ ] **Step 3: Write the mock-data module**

Create `components/dev/sessionViewsMocks.ts`. Build minimal objects satisfying the types read in Step 1. Representative skeleton (extend with any other required fields TypeScript reports):

```ts
// components/dev/sessionViewsMocks.ts
import type {
  QuizSession,
  QuizResponse,
  QuizData,
  QuizConfig,
  VideoActivitySession,
  VideoActivityResponse,
} from '@/types';

type MonitorState =
  | 'waiting'
  | 'live'
  | 'paused'
  | 'ended'
  | 'populated'
  | 'empty';

export const makeQuizData = (): QuizData => ({
  // Fill required QuizData fields per types.ts.
  title: 'Photosynthesis Check',
  questions: [
    {
      id: 'q1',
      type: 'multiple-choice',
      text: 'Which gas do plants absorb?',
      options: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Helium'],
      correctAnswer: 'Carbon dioxide',
      timeLimit: 30,
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      text: 'Where does photosynthesis occur?',
      options: ['Mitochondria', 'Chloroplast', 'Nucleus', 'Ribosome'],
      correctAnswer: 'Chloroplast',
      timeLimit: 30,
    },
  ],
});

export const makeQuizSession = (state: MonitorState): QuizSession => ({
  // Fill required QuizSession fields per types.ts.
  id: 'sess-1',
  code: 'AB12',
  status:
    state === 'paused' ? 'paused' : state === 'ended' ? 'ended' : 'active',
  currentQuestionIndex: state === 'waiting' ? -1 : 0,
  totalQuestions: 2,
  sessionMode: 'teacher-paced',
  assignmentName: 'Photosynthesis Check',
});

export const makeQuizConfig = (): QuizConfig => ({
  // Fill required QuizConfig fields per types.ts.
});

export const makeQuizResponses = (): QuizResponse[] => [
  // 5–8 responses spanning completed (high/mid/low score), in-progress, joined,
  // with a tab-warning and a locked one. Fill required QuizResponse fields.
];

export const makeVaSession = (state: MonitorState): VideoActivitySession => ({
  // Fill required VideoActivitySession fields per types.ts.
  id: 'va-1',
  status:
    state === 'paused' ? 'paused' : state === 'ended' ? 'ended' : 'active',
  assignmentName: 'Cell Division Video',
  activityTitle: 'Cell Division',
  questions: [
    {
      id: 'vq1',
      text: 'What phase is shown?',
      correctAnswer: 'Anaphase',
      timestamp: 42,
    },
  ],
});

export const makeVaResponses = (): VideoActivityResponse[] => [
  // 5–8 responses spanning done / in-progress with varied scores. Fill required
  // VideoActivityResponse fields.
];
```

> The `// Fill required ... fields` markers are explicit instructions to satisfy the type. Run `pnpm run type-check` after writing — TypeScript names every missing required field; add each until it's clean. This is faster and less error-prone than transcribing the full type defs here.

- [ ] **Step 4: Register the route in `App.tsx`**

Near the other DEV harness lazy imports (after the `LibraryDevHarness` constant, ~line 215):

```tsx
const SessionViewsDevHarness = import.meta.env.DEV
  ? lazy(() =>
      import('./components/dev/SessionViewsDevHarness').then((module) => ({
        default: module.SessionViewsDevHarness,
      }))
    )
  : null;
```

Near the other DEV route checks (after the `/library-dev` block, ~line 529):

```tsx
if (
  import.meta.env.DEV &&
  SessionViewsDevHarness &&
  pathname === '/session-views-dev'
) {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <SessionViewsDevHarness />
    </Suspense>
  );
}
```

- [ ] **Step 5: Verify the harness loads**

Run the dev server with the auth bypass:

```bash
$env:VITE_AUTH_BYPASS='true'; pnpm run dev
```

Then use the preview tools: `preview_start` (or navigate the running server) to `http://localhost:3000/session-views-dev`. Check `preview_console_logs` for errors and `preview_snapshot` to confirm a view renders. Resolve any "must be used within a Provider" error by confirming the provider stack matches the one above. (At this step the four views still look pre-redesign — that's expected; the harness just has to render them.)

- [ ] **Step 6: Type-check + commit**

Run: `pnpm run type-check`
Expected: no errors.

```bash
git add components/dev/SessionViewsDevHarness.tsx components/dev/sessionViewsMocks.ts App.tsx
git commit -m "feat(dev): /session-views-dev harness for monitor/results redesign

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Restyle `QuizLiveMonitor`

**Files:**

- Modify: `components/widgets/QuizWidget/components/QuizLiveMonitor.tsx`

This is a restyle-in-place: swap bespoke chrome for the shared atoms and apply the design language, preserving **all** existing handlers, state, and sub-component logic (scoreboard, podium, MC distribution, period filter, unlock/remove, score-display cycle, colors/tab-warning toggles, mute, advance/reveal).

- [ ] **Step 1: Add imports**

```tsx
import {
  SessionViewHeader,
  StatTile,
  SessionBadge,
  ScorePill,
  SessionRow,
  ActionButton,
} from '@/components/common/sessionViews';
import { scoreColorClasses, scoreTone } from '@/utils/scoreColor';
```

- [ ] **Step 2: Replace the header**

Replace the bespoke header block (the `border-b border-brand-red-primary/10` strip, ~lines 976–1100, including the live pulse, title, and pause/end/scoreboard buttons) with `<SessionViewHeader>`:

```tsx
<SessionViewHeader
  onBack={onBack}
  status={
    session.status === 'paused'
      ? 'paused'
      : session.status === 'ended'
        ? 'ended'
        : 'live'
  }
  title={session.assignmentName ?? quizData.title}
  subtitle={`Code ${session.code}`}
  actions={
    <>
      {onPause && session.status !== 'ended' && (
        <ActionButton
          variant="secondary"
          label={session.status === 'paused' ? 'Resume' : 'Pause'}
          icon={session.status === 'paused' ? Play : Pause}
          onClick={() =>
            session.status === 'paused' ? onResume?.() : onPause()
          }
        />
      )}
      {/* keep the existing scoreboard toggle button, now as ActionButton secondary */}
      <ActionButton
        variant="danger"
        label="End"
        icon={Square}
        onClick={handleEnd}
      />
    </>
  }
/>
```

Keep the existing `handleEnd` confirm logic and the scoreboard setup popup anchoring (the popup can remain rendered just below the header as today). Use the lucide icons already imported in the file (`Play`, `Pause`, `Square`, etc.); add any missing icon imports.

- [ ] **Step 3: Replace KPI stat boxes with `StatTile`**

Both `StatBox` (waiting/ended) and `InteractiveStatBox` (active) usages become `StatTile`. Map the `color` prop directly (`blue`/`amber`/`green` → StatTile `tone`). For the interactive ones, pass `interactive`, `selected={expanded}`, `onClick={onToggle}`, and render the existing expanded student-name list as `children`. Delete the now-unused `StatBox` and `InteractiveStatBox` component definitions (~lines 2321–2456) and their `themes` maps.

Example (active KPI):

```tsx
<StatTile
  icon={<Users style={{ width: 'min(18px, 5.5cqmin)', height: 'min(18px, 5.5cqmin)' }} />}
  value={joined}
  label="Joined"
  tone="blue"
  interactive
  selected={expandedStat === 'joined'}
  onClick={() => toggleStat('joined')}
>
  {expandedStat === 'joined' && (
    /* existing student-name dropdown JSX */
  )}
</StatTile>
```

- [ ] **Step 4: Convert the student roster to hairline `SessionRow`s**

The roster list container becomes gapless (`flex flex-col`, remove the `gap-*`/row spacing). Each `StudentRow` renders its content inside `SessionRow`:

- `dot` ← live/active status (`{ tone: 'success', pulse: true }` for active answering; `'neutral'` for joined; `'success'` non-pulse for done).
- `tintTone` ← when `effectiveColorsEnabled`, map the student's band score via `scoreTone(bandScore)` (replaces the local `scoreBandBg` helper at ~lines 2758).
- main content ← name + existing badges, but each badge (period, done/in-progress, duplicate, tab-warnings, lock/unlock, results-locked) becomes a `<SessionBadge tone=... label=... icon=... />`.
- `trailing` ← `<ScorePill score={pct} display={effectiveScoreDisplay} count={answeredCount} total={totalQuestions} gamified={isGamified} points={points} />` plus the existing remove (X) button and unlock controls.

Preserve the confirmation-mode variant (red "Remove {name}?" Yes/No) — render it as the row content when `confirmingRemoval`, unchanged in behavior.

- [ ] **Step 5: Restyle remaining surfaces to glass**

Apply the card surface `bg-white/70 border border-slate-200/60 rounded-2xl backdrop-blur-sm shadow-sm` to: the join-code bar, the question hero card, the answer-reveal card (keep emerald accent), the MC distribution container, the podium card, and the scoreboard setup popup. Replace `border-brand-blue-primary/10` borders with `border-slate-200/60`. Convert the progress bar fill to use `scoreColorClasses` only if it represents a score (the answered-progress bar stays emerald). Use unified `scoreColorClasses(...).text` anywhere a score is colored (e.g. the answer-reveal correct-count).

- [ ] **Step 6: Verify in the harness**

Run dev server with bypass (if not already running) and check each Quiz-monitor state at 340/520/820px:

Use `preview_resize` + `preview_snapshot` + `preview_screenshot` for: `waiting`, `live`, `paused`, `ended`. Confirm: header status pulse correct, KPI tiles glassy, roster rows hairline with aligned columns, score pills colored on the 80/60 scale, no console errors (`preview_console_logs`).

- [ ] **Step 7: Type-check + commit**

Run: `pnpm run type-check`
Expected: no errors.

```bash
git add components/widgets/QuizWidget/components/QuizLiveMonitor.tsx
git commit -m "ui(quiz): restyle live monitor with shared sessionViews atoms

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Restyle `VideoActivityLiveMonitor`

**Files:**

- Modify: `components/widgets/VideoActivityWidget/components/VideoActivityLiveMonitor.tsx`

- [ ] **Step 1: Add imports**

```tsx
import {
  SessionViewHeader,
  StatTile,
  SessionBadge,
  ScorePill,
  SessionRow,
  ActionButton,
} from '@/components/common/sessionViews';
import { scoreColorClasses } from '@/utils/scoreColor';
```

- [ ] **Step 2: Replace the header**

Replace the bespoke header (~lines 572–714, the `border-b border-brand-blue-primary/10 bg-white` strip with the live/paused pulse, title, activity subtitle, and pause/end buttons) with:

```tsx
<SessionViewHeader
  onBack={onBack}
  status={
    session.status === 'paused'
      ? 'paused'
      : session.status === 'ended'
        ? 'ended'
        : 'live'
  }
  title={session.assignmentName}
  subtitle={`${session.activityTitle} · ${session.questions.length} questions`}
  actions={
    <>
      {onPause && session.status !== 'ended' && (
        <ActionButton
          variant="secondary"
          label={session.status === 'paused' ? 'Resume' : 'Pause'}
          icon={session.status === 'paused' ? Play : Pause}
          onClick={() =>
            session.status === 'paused' ? onResume?.() : onPause()
          }
        />
      )}
      <ActionButton
        variant="danger"
        label="End"
        icon={Square}
        onClick={handleEnd}
      />
    </>
  }
/>
```

Preserve the existing `handleEnd` confirm flow. Add any missing lucide icon imports.

- [ ] **Step 3: Replace KPI tiles + delete the local `StatTile`**

Replace the three local `StatTile` usages (Joined/Active/Finished) with the shared `StatTile` (map `color` → `tone`). Delete the local `StatTile` definition (~lines 366–408).

- [ ] **Step 4: Convert student rows to hairline `SessionRow`**

In the `StudentRow` component (~lines 109–362):

- Wrap the row in `SessionRow` with `dot` reflecting done (`{tone:'success'}`) / in-progress (`{tone:'warn'}`).
- Period, Done / In progress, tab-warnings, and Resumed/lock badges → `<SessionBadge>`; the lock/unlock action keeps its `onUnlock` button.
- The right-side per-question correctness strip: keep the per-question circles/checks but raise contrast — render each as a small filled chip (`CheckCircle2` emerald-500, `XCircle` red-500, empty `Circle` slate-300) inside `trailing`, followed by `<ScorePill score={scorePct} display="percent" />` (now unified 80/60 via the helper — this replaces the local 70/40 ternary at ~lines 349 and the bar color logic).
- Keep `ScaledEmptyState` for the empty roster.

- [ ] **Step 5: Restyle surfaces to glass**

Replace `bg-white border border-slate-100 rounded-xl` tiles/rows backgrounds with the glass surface / hairline patterns. Remove the faint `bg-brand-blue-lighter/10` page wash if it competes with the new glass look (optional — keep if it reads well in the harness).

- [ ] **Step 6: Verify in the harness**

Check VA-monitor states `waiting`, `live`, `paused`, `ended` at 340/520/820px via `preview_resize` + `preview_snapshot` + `preview_screenshot`. Confirm hairline rows, unified score colors, contrast on the correctness strip, no console errors.

- [ ] **Step 7: Type-check + commit**

Run: `pnpm run type-check`
Expected: no errors.

```bash
git add components/widgets/VideoActivityWidget/components/VideoActivityLiveMonitor.tsx
git commit -m "ui(video-activity): restyle live monitor with shared sessionViews atoms

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Restyle `QuizResults`

**Files:**

- Modify: `components/widgets/QuizWidget/components/QuizResults.tsx`

- [ ] **Step 1: Add imports**

```tsx
import {
  SessionViewHeader,
  SegmentedTabs,
  StatTile,
  SessionBadge,
  ScorePill,
  SessionRow,
  ActionButton,
  OverflowMenu,
} from '@/components/common/sessionViews';
import type { OverflowMenuItem } from '@/components/common/sessionViews';
import { scoreColorClasses } from '@/utils/scoreColor';
```

- [ ] **Step 2: Replace the header + action buttons**

Replace the header block (~lines 1227–1578) with `<SessionViewHeader>`. **Visible actions: Grade Written + Push Grades** (whichever push applies — Classroom or Schoology). Everything else goes in an `OverflowMenu`:

```tsx
const overflowItems: OverflowMenuItem[] = [
  {
    label: hasExport ? 'Re-export Sheet' : 'Export to Sheets',
    icon: Sheet,
    onClick: handleExport,
    disabled: exporting,
  },
  ...(exportUrl
    ? [{ label: 'Open Sheet', icon: ExternalLink, onClick: openSheet }]
    : []),
  { label: 'Send to Scoreboard', icon: Trophy, onClick: openScoreboardSetup },
  // include Push to Schoology here only if it is NOT the visible push (see below)
];

<SessionViewHeader
  onBack={onBack}
  title={quiz.title}
  subtitle={periodSubtitle /* existing period/teacher subtitle, if any */}
  actions={
    <>
      {hasWrittenResponses && (
        <ActionButton
          variant="secondary"
          label="Grade Written"
          icon={PenSquare}
          onClick={() => setShowGrader(true)}
        />
      )}
      {classroomAttached && canPushClassroom && (
        <ActionButton
          variant="primary"
          label="Push Grades"
          icon={Upload}
          onClick={handlePushGrades}
          disabled={pushingGrades}
        />
      )}
      {!classroomAttached && ltiAttached && (
        <ActionButton
          variant="primary"
          label="Push Grades"
          icon={Upload}
          onClick={handlePushSchoology}
          disabled={pushingSchoology}
        />
      )}
      <OverflowMenu items={overflowItems} />
    </>
  }
/>;
```

Preserve every existing handler (`handleExport`, `handlePushGrades`, `handlePushSchoology`, scoreboard setup, schema-mismatch recovery). The export-error banner and recovery button stay below the header. Use the lucide icons already imported (add `PenSquare`/`Upload`/`Sheet`/`ExternalLink`/`Trophy` if missing). Keep the gating conditions exactly as they are today — only the placement (visible vs overflow) changes.

- [ ] **Step 3: Replace the tab strip with `SegmentedTabs`**

Replace the uppercase button strip (~lines 1686–1717) with:

```tsx
<SegmentedTabs
  tabs={[
    { key: 'overview', label: 'Overview' },
    { key: 'questions', label: 'Questions' },
    { key: 'students', label: 'Students', count: responses.length },
    ...(config.plcMode ? [{ key: 'plc', label: 'PLC' }] : []),
  ]}
  value={activeTab}
  onChange={setActiveTab}
  ariaLabel="Quiz results tabs"
/>
```

(Wrap it in the existing toolbar row alongside the period filter.)

- [ ] **Step 4: Modernize `OverviewTab`**

- Stat cards (Class Average, Finished) → `StatTile` (drop the `absolute ... h-1` colored top-bar). Use `tone="blue"`/`"green"`.
- Distribution chart container → glass surface (`bg-white/70 border border-slate-200/60 rounded-2xl backdrop-blur-sm shadow-sm`, replace `shadow-sm` heavy combo). Keep the bucket bars but source the fill from a fixed bucket palette (90–100 emerald, 80–89 blue, 60–79 amber, 0–59 red) — unchanged.

- [ ] **Step 5: Modernize `QuestionsTab`**

Convert the per-question cards to hairline rows in a gapless container (or keep light glass cards if rows feel too dense — verify in harness). The accuracy bar fill uses `scoreColorClasses(accuracyPct).bar`; the accuracy number uses `scoreColorClasses(accuracyPct).text` (replaces the local 80/60 ternary at ~line 2044 — same scale, now via the helper). The manual-grading marker → `<SessionBadge tone="danger" label="Manual" />` (or `warn`).

- [ ] **Step 6: Modernize `StudentsTab`**

- The list becomes gapless hairline `SessionRow`s (replace the spaced `rounded-2xl shadow-sm` cards at ~line 2272).
- Name + badges in the content slot; tab-warning → `<SessionBadge tone="danger" .../>`, results-locked → `<SessionBadge tone="warn" .../>`, pre-sync version → `<SessionBadge tone="warn" .../>`.
- `trailing` ← `<ScorePill score={score} display="percent" gamified={gamified} points={points} />` (replaces the local ternary at ~line 2329) plus the existing Unlock/Delete buttons (Delete keeps its confirm state).
- Keep the "Show/Hide Results" toggle row behavior.

- [ ] **Step 7: Empty state**

Replace the inline "No data available yet" (~lines 1630–1646) with `ScaledEmptyState` (icon `BarChart3` or similar, already a pattern in the repo).

- [ ] **Step 8: Verify in the harness**

Check Quiz-results `populated` and `empty` at 340/520/820px; click through Overview/Questions/Students/PLC tabs and open the overflow menu. Confirm: header shows Grade Written + Push, Export is in the overflow, segmented tabs, hairline student rows, unified score colors, no console errors.

- [ ] **Step 9: Type-check + commit**

Run: `pnpm run type-check`
Expected: no errors.

```bash
git add components/widgets/QuizWidget/components/QuizResults.tsx
git commit -m "ui(quiz): restyle results with shared sessionViews atoms + overflow header

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Restyle `Results` (Video Activity)

**Files:**

- Modify: `components/widgets/VideoActivityWidget/components/Results.tsx`

- [ ] **Step 1: Add imports**

```tsx
import {
  SessionViewHeader,
  SegmentedTabs,
  StatTile,
  SessionBadge,
  ScorePill,
  SessionRow,
  ActionButton,
  OverflowMenu,
} from '@/components/common/sessionViews';
import type { OverflowMenuItem } from '@/components/common/sessionViews';
import { scoreColorClasses } from '@/utils/scoreColor';
```

- [ ] **Step 2: Replace the header + actions**

Replace the header (~lines 417–577) with `<SessionViewHeader>`. **Visible action: Push Grades** (Classroom or Schoology, whichever applies). Export and Open Sheet go in the `OverflowMenu`. (No Grade Written — VA has no written-response grading.)

```tsx
const overflowItems: OverflowMenuItem[] = [
  {
    label: exportUrl ? 'Re-export Sheet' : 'Export to Sheets',
    icon: Sheet,
    onClick: handleExport,
    disabled: exporting,
  },
  ...(exportUrl
    ? [{ label: 'Open Sheet', icon: ExternalLink, onClick: openSheet }]
    : []),
];

<SessionViewHeader
  onBack={onBack}
  title={session.assignmentName}
  subtitle={session.activityTitle}
  actions={
    <>
      {classroomAttached && canPushClassroom && (
        <ActionButton
          variant="primary"
          label="Push Grades"
          icon={Upload}
          onClick={handlePushGrades}
          disabled={pushingGrades}
        />
      )}
      {!classroomAttached && ltiAttached && (
        <ActionButton
          variant="primary"
          label="Push Grades"
          icon={Upload}
          onClick={handlePushSchoology}
          disabled={pushingSchoology}
        />
      )}
      <OverflowMenu items={overflowItems} />
    </>
  }
/>;
```

Preserve all handlers. The export-error banner stays below the header. This also fixes the odd outlined "Open Sheet" button (now a normal overflow item).

- [ ] **Step 3: Replace the tab strip with `SegmentedTabs`**

```tsx
<SegmentedTabs
  tabs={[
    { key: 'overview', label: 'Overview' },
    { key: 'questions', label: 'Questions' },
    { key: 'students', label: 'Students', count: responses.length },
  ]}
  value={activeTab}
  onChange={setActiveTab}
  ariaLabel="Video activity results tabs"
/>
```

- [ ] **Step 4: Modernize the three tabs**

- Overview: the three stat cards → `StatTile` (Students `tone="blue"`, Completed `tone="green"`, Avg Score `tone="violet"`).
- Questions: per-question rows; accuracy bar fill `scoreColorClasses(accuracy).bar`, number `scoreColorClasses(accuracy).text` (replaces the 70/40 ternary at ~lines 745/768 — now unified 80/60). Timestamp badge → keep or `<SessionBadge tone="info" .../>`.
- Students: gapless hairline `SessionRow`s (replace the `rounded-xl` cards at ~line 811). Status → `<SessionBadge>`; `trailing` ← `<ScorePill score={score} display="percent" />` (replaces the 70/40 ternary at ~line 866). Keep the correct/incorrect indicators.

- [ ] **Step 5: Empty states**

Replace the inline "No …" empty messages with `ScaledEmptyState`.

- [ ] **Step 6: Verify in the harness**

Check VA-results `populated` and `empty` at 340/520/820px; click Overview/Questions/Students and open the overflow. Confirm Push visible, Export in overflow, segmented tabs, hairline rows, unified 80/60 colors, no console errors.

- [ ] **Step 7: Type-check + commit**

Run: `pnpm run type-check`
Expected: no errors.

```bash
git add components/widgets/VideoActivityWidget/components/Results.tsx
git commit -m "ui(video-activity): restyle results with shared sessionViews atoms + overflow header

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Final validation pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full gate**

Run: `pnpm run validate`
Expected: type-check + lint (zero warnings) + format-check + tests all PASS. Fix any issues (lint `--max-warnings 0` is enforced).

- [ ] **Step 2: Format any new files if needed**

Run: `pnpm run format`
Then re-run: `pnpm run format:check`
Expected: PASS.

- [ ] **Step 3: Full harness sweep**

With the dev server (bypass) running, walk all four views × every state × {340, 520, 820}px using `preview_resize` + `preview_screenshot`. Confirm visual consistency with the library (glass surfaces, hairline rows, segmented tabs, unified score colors) and that every action is reachable (visible or in the overflow). Capture before/after screenshots to share with the user.

- [ ] **Step 4: Confirm no behavior regressions**

Spot-check that all preserved actions still fire (pause/resume, end, advance, reveal, scoreboard, period filter, unlock, remove, delete, export, push grades) — in the harness the handlers are no-ops, so verify wiring via `preview_console_logs` (no errors) and code review of the diff (handlers unchanged, only presentation moved).

- [ ] **Step 5: Final commit (if any format/lint fixes were made)**

```bash
git add -A
git commit -m "chore(sessionViews): final lint/format pass for monitor+results redesign

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

- Shared atoms (8) + `scoreColor` util → Tasks 1–9. ✅
- `SegmentedTabs` extraction from `LibraryShell` → Task 5. ✅
- Unified 80/60 score scale (incl. VA shift from 70/40) → Task 1 (helper) applied in Tasks 11–14. ✅
- `/session-views-dev` harness, DEV-gated like `/library-dev`, mock states → Task 10. ✅
- Per-view restyles preserving functionality → Tasks 11 (Quiz monitor), 12 (VA monitor), 13 (Quiz results), 14 (VA results). ✅
- Results header IA: Grade Written + Push visible, Export in overflow (Quiz); Push visible, Export in overflow (VA) → Tasks 13 & 14. ✅
- Testing: atom + util unit tests, library tests stay green, harness visual pass, `pnpm run validate` → Tasks 1–9, 5 (step 6), 15. ✅
- Guardrails (no data/Firestore/scoring/grade-push changes) → enforced by "preserve handlers" instructions in Tasks 11–14. ✅

**Type consistency:** `SessionTone` (badge, 5 tones) and `ScoreTone` (score, 3 tones) are intentionally distinct and used consistently. `SegmentedTab`/`OverflowMenuItem` types are exported from the barrel and imported where used. `StatTile` tone union (`blue|amber|green|violet`) matches the legacy `color` props it replaces. `ScorePill` display union (`percent|count|hidden`) matches the monitor's `scoreDisplay` state.

**Placeholder note:** Task 10's mock builders intentionally defer per-field completion to type-check (the only honest way to satisfy large generated types without transcribing them); every other code step is complete and copy-ready.
