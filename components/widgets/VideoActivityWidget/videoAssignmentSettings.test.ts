import { describe, expect, it } from 'vitest';
import type {
  VideoActivityAssignment,
  VideoActivitySessionSettings,
} from '@/types';
import {
  patchVideoBehaviorOptions,
  patchVideoPlayer,
} from '@/components/common/library/assignStepper/VideoRuleStepValues';
import {
  videoRulesFromAssignment,
  videoRulesPatch,
} from './videoAssignmentSettings';

type RuleFields = Pick<
  VideoActivityAssignment,
  'sessionOptions' | 'sessionSettings'
>;

const STAMPED: RuleFields = {
  sessionOptions: {
    attemptLimit: 2,
    answerRulesSet: true,
    shuffleAnswerOptions: true,
    showResultToStudent: true,
    showCorrectAnswerToStudent: true,
    tabWarningsEnabled: true,
    dueAt: 123,
    dueAtHasTime: true,
  },
  sessionSettings: {
    autoPlay: false,
    requireCorrectAnswer: true,
    allowSkipping: false,
  },
};

const OLD: RuleFields = {
  sessionOptions: { attemptLimit: null, showResultToStudent: false },
  // Older assignments predate allowSkipping.
  sessionSettings: {
    autoPlay: true,
    requireCorrectAnswer: true,
  } as VideoActivitySessionSettings,
};

describe('videoRulesFromAssignment', () => {
  it('reads a stamped assignment as saved, without assign-time keys', () => {
    const rules = videoRulesFromAssignment(STAMPED);
    expect(rules.behavior.attemptLimit).toBe(2);
    expect(rules.behavior.sessionOptions).not.toHaveProperty('dueAt');
    expect(rules.behavior.sessionOptions).not.toHaveProperty('answerRulesSet');
    expect(rules.behavior.sessionOptions.shuffleAnswerOptions).toBe(true);
  });

  it('shows what an unstamped session plays: one class order, right and wrong, the answer', () => {
    const rules = videoRulesFromAssignment(OLD);
    expect(rules.behavior.attemptLimit).toBeNull();
    expect(rules.behavior.sessionOptions).toMatchObject({
      shuffleAnswerOptions: false,
      showResultToStudent: true,
      showCorrectAnswerToStudent: true,
    });
    expect(rules.player).toEqual({
      autoPlay: true,
      requireCorrectAnswer: true,
      allowSkipping: false,
    });
  });
});

describe('videoRulesPatch', () => {
  it('writes nothing when nothing changed', () => {
    const initial = videoRulesFromAssignment(STAMPED);
    expect(videoRulesPatch(STAMPED, initial, initial)).toEqual({});
  });

  it('writes only the changed option and the attempt limit', () => {
    const initial = videoRulesFromAssignment(STAMPED);
    const next = patchVideoBehaviorOptions(
      {
        ...initial,
        behavior: { ...initial.behavior, attemptLimit: 3 },
      },
      { tabWarningsEnabled: false }
    );
    expect(videoRulesPatch(STAMPED, initial, next)).toEqual({
      sessionOptionEdits: { tabWarningsEnabled: false, attemptLimit: 3 },
    });
  });

  it('stamps an old session with all three answer rows when one changes', () => {
    const initial = videoRulesFromAssignment(OLD);
    const next = patchVideoBehaviorOptions(initial, {
      showCorrectAnswerToStudent: false,
    });
    expect(videoRulesPatch(OLD, initial, next).sessionOptionEdits).toEqual({
      shuffleAnswerOptions: false,
      showResultToStudent: true,
      showCorrectAnswerToStudent: false,
      answerRulesSet: true,
    });
  });

  it('leaves an old session unstamped for a non-answer change', () => {
    const initial = videoRulesFromAssignment(OLD);
    const next = patchVideoPlayer(initial, { allowSkipping: true });
    expect(videoRulesPatch(OLD, initial, next)).toEqual({
      sessionSettings: {
        autoPlay: true,
        requireCorrectAnswer: true,
        allowSkipping: true,
      },
    });
  });

  it('turns rewind off in the saved player rules when right and wrong is hidden', () => {
    const initial = videoRulesFromAssignment(STAMPED);
    const next = patchVideoBehaviorOptions(initial, {
      showResultToStudent: false,
    });
    const patch = videoRulesPatch(STAMPED, initial, next);
    expect(patch.sessionSettings?.requireCorrectAnswer).toBe(false);
    expect(patch.sessionOptionEdits).toEqual({ showResultToStudent: false });
  });
});
