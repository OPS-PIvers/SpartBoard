import { describe, it, expect } from 'vitest';
import { subLaunchRunSettings } from './subLaunchRunSettings';
import { DEFAULT_QUIZ_BEHAVIOR } from './quizBehavior';
import {
  DEFAULT_FLASHCARD_ASSIGN_FORM,
  buildFlashcardAssignKindFields,
} from '@/components/widgets/Flashcards/utils/flashcardAssign';

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

const GL_SESSION_FIELDS = new Set([
  'assignmentMode',
  'openAt',
  'closeAt',
  'dueAt',
]);
const GL_ASSIGNMENT_FIELDS = new Set([
  'status',
  'assignmentMode',
  'openAt',
  'closeAt',
  'dueAt',
  'updatedAt',
]);

const FC_SESSION_FIELDS = new Set(['status', 'openAt', 'closeAt', 'dueAt']);
const FC_ASSIGNMENT_FIELDS = new Set([
  'status',
  'openAt',
  'closeAt',
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

  // The player reads the cap from the session doc, not the assignment, so an
  // omitted bag there means unlimited retakes.
  it('caps attempts on the session, where the player reads it', () => {
    const options = session.sessionOptions as { attemptLimit?: number | null };
    expect(options.attemptLimit).toBe(1);
    expect(
      (assignment.sessionOptions as { attemptLimit?: number | null })
        .attemptLimit
    ).toBe(1);
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

describe('subLaunchRunSettings for a guided activity', () => {
  const { session, assignment } = subLaunchRunSettings(
    'guidedLearning',
    'Period 5',
    NOW
  );

  // The student steps through it on their own device and the teacher publishes
  // the scores afterwards, so starting it is the only choice there is.
  it('starts a tracked run and nothing else', () => {
    expect(session.assignmentMode).toBe('submissions');
    expect(assignment.status).toBe('active');
    expect(assignment.assignmentMode).toBe('submissions');
  });

  // Guided Learning's own `mode` is the play mode, so an assignment mode sent
  // under that name would either be refused or overwrite how it plays.
  it('never sends the assignment mode as `mode`', () => {
    expect(session.mode).toBeUndefined();
    expect(assignment.mode).toBeUndefined();
  });

  // The teacher's list names the class from the rosters, and publishing scores
  // reveals the answers, so neither is the sub's to set.
  it('names no class and no score visibility', () => {
    expect(assignment.className).toBeUndefined();
    expect(session.scoreVisibility).toBeUndefined();
    expect(assignment.scoreVisibility).toBeUndefined();
  });

  it('sends nothing the callable would refuse', () => {
    expect(outside(session, GL_SESSION_FIELDS)).toEqual([]);
    expect(outside(assignment, GL_ASSIGNMENT_FIELDS)).toEqual([]);
  });
});

describe('subLaunchRunSettings for a flashcard set', () => {
  const { session, assignment } = subLaunchRunSettings(
    'flashcards',
    'Period 5',
    NOW
  );

  it('starts the run and leaves the rest to the server', () => {
    expect(session).toEqual({ status: 'active' });
    expect(assignment).toEqual({ status: 'active' });
  });

  // The server writes `kind: 'study'`. This is the pin on that literal: it is
  // the teacher's own default, and a graded Check brings a mastery threshold
  // and a score visibility that can reveal answers.
  it('matches the kind the teacher\u2019s own assign form defaults to', () => {
    expect(
      buildFlashcardAssignKindFields(DEFAULT_FLASHCARD_ASSIGN_FORM, 10)
    ).toEqual({ kind: 'study' });
  });

  it('sends nothing the callable would refuse', () => {
    expect(outside(session, FC_SESSION_FIELDS)).toEqual([]);
    expect(outside(assignment, FC_ASSIGNMENT_FIELDS)).toEqual([]);
  });
});
