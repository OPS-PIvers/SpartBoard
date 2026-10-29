import { describe, it, expect } from 'vitest';
import type { VideoActivitySessionSettings } from '@/types';
import { DEFAULT_VA_BEHAVIOR } from '@/utils/videoActivityBehavior';
import {
  DEFAULT_VIDEO_PLAYER_SETTINGS,
  formatVideoAttemptsValue,
  formatVideoFeedbackValue,
  formatVideoIntegrityValue,
  formatVideoPlaybackValue,
  patchVideoBehaviorOptions,
  patchVideoPlayer,
  videoRulesFromBehavior,
  videoRulesPrefill,
  videoRulesSessionFields,
  type VideoAssignRules,
  type VideoBehaviorOptions,
} from '@/components/common/library/assignStepper/VideoRuleStepValues';

const make = (
  options: Partial<VideoBehaviorOptions> = {},
  attemptLimit: number | null = 1,
  player: Partial<VideoActivitySessionSettings> = {}
): VideoAssignRules => ({
  behavior: {
    ...DEFAULT_VA_BEHAVIOR,
    attemptLimit,
    sessionOptions: { ...DEFAULT_VA_BEHAVIOR.sessionOptions, ...options },
  },
  player: { ...DEFAULT_VIDEO_PLAYER_SETTINGS, ...player },
});

describe('formatVideoAttemptsValue', () => {
  it('names the attempt count', () => {
    expect(formatVideoAttemptsValue(make(), false)).toBe('1 attempt');
    expect(formatVideoAttemptsValue(make({}, 3), false)).toBe('3 attempts');
    expect(formatVideoAttemptsValue(make({}, null), false)).toBe(
      'Unlimited attempts'
    );
  });

  it('mentions shuffling with answerRows, which is now the default', () => {
    expect(formatVideoAttemptsValue(make())).toBe(
      '1 attempt, Shuffled answers'
    );
    expect(formatVideoAttemptsValue(make(), false)).toBe('1 attempt');
    expect(formatVideoAttemptsValue(make(), true)).toBe(
      '1 attempt, Shuffled answers'
    );
    expect(
      formatVideoAttemptsValue(make({ shuffleAnswerOptions: false }), true)
    ).toBe('1 attempt');
  });
});

describe('formatVideoPlaybackValue', () => {
  const shown = {
    showResultToStudent: true,
    showCorrectAnswerToStudent: true,
  };

  it('reads the drawer defaults as rewind only', () => {
    expect(formatVideoPlaybackValue(make(shown))).toBe(
      'Rewind on wrong answer'
    );
  });

  it('lists every rule that is on, or Off', () => {
    expect(
      formatVideoPlaybackValue(
        make(shown, 1, { allowSkipping: true, autoPlay: true })
      )
    ).toBe('Skipping ahead, Rewind on wrong answer, Autoplay');
    expect(
      formatVideoPlaybackValue(make(shown, 1, { requireCorrectAnswer: false }))
    ).toBe('Off');
  });

  it('drops rewind while right and wrong or the answer is hidden', () => {
    expect(formatVideoPlaybackValue(make({ showResultToStudent: false }))).toBe(
      'Off'
    );
    expect(
      formatVideoPlaybackValue(make({ showCorrectAnswerToStudent: false }))
    ).toBe('Off');
    expect(
      formatVideoPlaybackValue(make({ showResultToStudent: false }), false)
    ).toBe('Rewind on wrong answer');
  });
});

describe('formatVideoIntegrityValue', () => {
  it('treats absent focus mode as on', () => {
    expect(
      formatVideoIntegrityValue(make({ tabWarningsEnabled: undefined }))
    ).toBe('Focus mode');
    expect(formatVideoIntegrityValue(make({ tabWarningsEnabled: false }))).toBe(
      'Off'
    );
  });
});

describe('formatVideoFeedbackValue', () => {
  it("treats absent fields as today's player: right and wrong plus the key", () => {
    expect(
      formatVideoFeedbackValue(
        make({
          showResultToStudent: undefined,
          showCorrectAnswerToStudent: undefined,
        })
      )
    ).toBe('Right and wrong, and the correct answers');
  });

  it('covers the other combinations', () => {
    expect(
      formatVideoFeedbackValue(
        make({ showResultToStudent: true, showCorrectAnswerToStudent: false })
      )
    ).toBe('Which answers were right');
    expect(
      formatVideoFeedbackValue(
        make({ showResultToStudent: false, showCorrectAnswerToStudent: true })
      )
    ).toBe('Nothing until I release results');
  });
});

describe('videoRulesFromBehavior', () => {
  it("starts the rows the player ignores at today's behavior and keeps the rest", () => {
    const rules = videoRulesFromBehavior({
      ...DEFAULT_VA_BEHAVIOR,
      attemptLimit: 3,
      sessionOptions: {
        ...DEFAULT_VA_BEHAVIOR.sessionOptions,
        tabWarningsEnabled: false,
        scoreVisibility: 'none',
      },
    });
    expect(rules.behavior.attemptLimit).toBe(3);
    expect(rules.behavior.sessionOptions).toMatchObject({
      tabWarningsEnabled: false,
      scoreVisibility: 'none',
      shuffleAnswerOptions: true,
      showResultToStudent: true,
      showCorrectAnswerToStudent: true,
    });
    expect(rules.player).toEqual(DEFAULT_VIDEO_PLAYER_SETTINGS);
    expect(rules.player).not.toBe(DEFAULT_VIDEO_PLAYER_SETTINGS);
  });
});

describe('patch helpers', () => {
  it('patch without touching the input', () => {
    const v = make();
    const a = patchVideoBehaviorOptions(v, { tabWarningsEnabled: false });
    const b = patchVideoPlayer(v, { autoPlay: true });
    expect(a.behavior.sessionOptions.tabWarningsEnabled).toBe(false);
    expect(b.player.autoPlay).toBe(true);
    expect(v.behavior.sessionOptions.tabWarningsEnabled).toBe(true);
    expect(v.player.autoPlay).toBe(false);
  });
});

describe('videoRulesPrefill', () => {
  it('uses the last-used rows when there are some', () => {
    const last = make({ tabWarningsEnabled: false }, 4, { autoPlay: true });
    const out = videoRulesPrefill(DEFAULT_VA_BEHAVIOR, last);
    expect(out.behavior.attemptLimit).toBe(4);
    expect(out.player.autoPlay).toBe(true);
  });

  it("falls back to the activity's behavior and the given player rules", () => {
    const player = {
      autoPlay: false,
      requireCorrectAnswer: false,
      allowSkipping: true,
    };
    const out = videoRulesPrefill(DEFAULT_VA_BEHAVIOR, null, player);
    expect(out.behavior.attemptLimit).toBe(DEFAULT_VA_BEHAVIOR.attemptLimit);
    expect(out.player).toEqual(player);
  });
});

describe('videoRulesSessionFields', () => {
  it('stamps answerRulesSet, drops assign-time keys and carries the attempt limit', () => {
    const rules = make(
      { dueAt: 5, dueAtHasTime: true } as Partial<VideoBehaviorOptions>,
      3
    );
    const { sessionOptions } = videoRulesSessionFields(rules);
    expect(sessionOptions.answerRulesSet).toBe(true);
    expect(sessionOptions.attemptLimit).toBe(3);
    expect(sessionOptions.dueAt).toBeUndefined();
  });

  it('turns rewind off while right and wrong is hidden', () => {
    const rules = make({ showResultToStudent: false }, 1, {
      requireCorrectAnswer: true,
    });
    expect(
      videoRulesSessionFields(rules).sessionSettings.requireCorrectAnswer
    ).toBe(false);
  });
});
