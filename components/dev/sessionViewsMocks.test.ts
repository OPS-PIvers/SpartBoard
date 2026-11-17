import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { liveViewSupported } from '@/utils/quizLiveView';
import { getAssignmentWidgetKind } from '@/utils/quizWidgetKind';
import {
  makeQuizSession,
  makeReviewSession,
  makeStopQuizSession,
  makeTimedQuizSession,
} from './sessionViewsMocks';

const read = (path: string) => readFileSync(path, 'utf8');

describe('session views harness matches what teachers run', () => {
  it('builds Quiz fixtures as self-paced Quiz assignments with Live view', () => {
    for (const session of [
      makeQuizSession(),
      makeTimedQuizSession(),
      makeStopQuizSession(),
    ]) {
      expect(getAssignmentWidgetKind(session)).toBe('quiz');
      expect(liveViewSupported(session)).toBe(true);
      expect(session.teacherUid).toBe('mock-user-id');
    }
  });

  it('keeps the teacher-paced fixture a Review', () => {
    expect(getAssignmentWidgetKind(makeReviewSession())).toBe('review');
  });

  it('opens the Quiz monitor on a Quiz fixture by default', () => {
    const harness = read('components/dev/SessionViewsDevHarness.tsx');
    expect(harness).toMatch(/'quiz-monitor': 'live'/);
    expect(harness).toMatch(
      /assessmentOnly=\{quizKind\}[\s\S]*hideLiveScoreboard=\{quizKind\}/
    );
  });

  it('mounts the same monitor and results components as the widgets', () => {
    const harness = read('components/dev/SessionViewsDevHarness.tsx');
    const pairs: [string, string][] = [
      [
        'components/widgets/QuizWidget/Widget.tsx',
        "import { QuizLiveMonitor } from './components/QuizLiveMonitor'",
      ],
      [
        'components/widgets/QuizWidget/Widget.tsx',
        "import { QuizResults } from './components/QuizResults'",
      ],
      [
        'components/widgets/VideoActivityWidget/Widget.tsx',
        "import { VideoActivityLiveMonitor } from './components/VideoActivityLiveMonitor'",
      ],
      [
        'components/widgets/VideoActivityWidget/Widget.tsx',
        "import { Results } from './components/Results'",
      ],
    ];
    for (const [widget, line] of pairs) {
      expect(read(widget)).toContain(line);
    }
    expect(harness).toContain(
      "from '@/components/widgets/QuizWidget/components/QuizLiveMonitor'"
    );
    expect(harness).toContain(
      "from '@/components/widgets/QuizWidget/components/QuizResults'"
    );
    expect(harness).toContain(
      "from '@/components/widgets/VideoActivityWidget/components/VideoActivityLiveMonitor'"
    );
    expect(harness).toContain(
      "from '@/components/widgets/VideoActivityWidget/components/Results'"
    );
  });
});
