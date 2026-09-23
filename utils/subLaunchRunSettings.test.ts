import { describe, it, expect } from 'vitest';
import { subLaunchRunSettings } from './subLaunchRunSettings';
import { DEFAULT_QUIZ_BEHAVIOR } from './quizBehavior';

const NOW = 1_700_000_000_000;

// The callable refuses anything outside its allowlists by name, so these are
// the field sets it accepts as of the slice that added each kind. A key added
// here without one added there fails at the boundary, not in a test.
const QUIZ_SESSION_FIELDS = new Set([
  'status',
  'sessionMode',
  'currentQuestionIndex',
  'startedAt',
  'endedAt',
  'autoProgressAt',
  'completenessModel',
  'handRaiseEnabled',
  'questionPhase',
  'pauseMessage',
  'periodNames',
  'attemptLimit',
  'mode',
  'openAt',
  'closeAt',
  'dueAt',
  'tabWarningsEnabled',
  'tabWarningThreshold',
  'blockCopyPaste',
  'showResultToStudent',
  'showCorrectAnswerToStudent',
  'showCorrectOnBoard',
  'speedBonusEnabled',
  'streakBonusEnabled',
  'showPodiumBetweenQuestions',
  'soundEffectsEnabled',
  'shuffleQuestions',
  'shuffleAnswerOptions',
]);
const QUIZ_ASSIGNMENT_FIELDS = new Set([
  'className',
  'sessionMode',
  'sessionOptions',
  'teacherName',
  'periodName',
  'periodNames',
  'attemptLimit',
  'dueAt',
  'dueAtHasTime',
  'status',
  'mode',
  'openAt',
  'closeAt',
  'updatedAt',
]);
const VA_SESSION_FIELDS = new Set([
  'status',
  'mode',
  'settings',
  'sessionOptions',
  'assignmentName',
  'periodNames',
  'openAt',
  'closeAt',
  'dueAt',
]);
const VA_ASSIGNMENT_FIELDS = new Set([
  'className',
  'status',
  'mode',
  'sessionSettings',
  'sessionOptions',
  'scoreVisibility',
  'periodNames',
  'dueAt',
  'updatedAt',
]);

const outside = (payload: Record<string, unknown>, allowed: Set<string>) =>
  Object.keys(payload).filter((key) => !allowed.has(key));

describe('subLaunchRunSettings for a quiz', () => {
  const { session, assignment } = subLaunchRunSettings('quiz', 'Period 3', NOW);

  // Teacher-paced needs someone to advance it, and a sub cannot pace material
  // they have not taught.
  it('runs self-paced and starts straight away', () => {
    expect(session.sessionMode).toBe('student');
    expect(session.status).toBe('active');
    expect(session.currentQuestionIndex).toBe(0);
    expect(session.startedAt).toBe(NOW);
  });

  it('takes the shared defaults for everything else', () => {
    const opts = DEFAULT_QUIZ_BEHAVIOR.sessionOptions;
    expect(session.shuffleAnswerOptions).toBe(opts.shuffleAnswerOptions);
    expect(session.blockCopyPaste).toBe(opts.blockCopyPaste);
    expect(session.attemptLimit).toBe(DEFAULT_QUIZ_BEHAVIOR.attemptLimit);
  });

  // Required on a `QuizAssignment` and read unguarded by the teacher's own
  // settings panel.
  it('carries sessionOptions on the assignment', () => {
    expect(assignment.sessionOptions).toEqual(
      DEFAULT_QUIZ_BEHAVIOR.sessionOptions
    );
  });

  it('names the class the teacher named it', () => {
    expect(assignment.className).toBe('Period 3');
  });

  it('sends nothing the callable would refuse', () => {
    expect(outside(session, QUIZ_SESSION_FIELDS)).toEqual([]);
    expect(outside(assignment, QUIZ_ASSIGNMENT_FIELDS)).toEqual([]);
  });
});

describe('subLaunchRunSettings for a video activity', () => {
  const { session, assignment } = subLaunchRunSettings(
    'videoActivity',
    'Period 5',
    NOW
  );

  // A student works through the video on their own device, so there is no
  // pacing choice to make and no join code to show.
  it('starts active with the player defaults', () => {
    expect(session.status).toBe('active');
    expect(session.mode).toBe('submissions');
    expect(session.settings).toEqual({
      autoPlay: false,
      requireCorrectAnswer: false,
      allowSkipping: true,
    });
  });

  it('labels the run with the class', () => {
    expect(session.assignmentName).toBe('Period 5');
    expect(assignment.className).toBe('Period 5');
  });

  it('keeps scores to a score, since nobody is there to explain answers', () => {
    expect(assignment.scoreVisibility).toBe('score-only');
  });

  it('sends no quiz field, which this allowlist would refuse', () => {
    expect(session.sessionMode).toBeUndefined();
    expect(session.currentQuestionIndex).toBeUndefined();
  });

  it('sends nothing the callable would refuse', () => {
    expect(outside(session, VA_SESSION_FIELDS)).toEqual([]);
    expect(outside(assignment, VA_ASSIGNMENT_FIELDS)).toEqual([]);
  });
});
