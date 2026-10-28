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
    expect(formatVideoAttemptsValue(make())).toBe('1 attempt');
    expect(formatVideoAttemptsValue(make({}, 3))).toBe('3 attempts');
    expect(formatVideoAttemptsValue(make({}, null))).toBe('Unlimited attempts');
  });

  it('mentions shuffling only once the player honors it', () => {
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
  it('reads the drawer defaults as rewind only', () => {
    expect(formatVideoPlaybackValue(make())).toBe('Rewind on wrong answer');
  });

  it('lists every rule that is on, or Off', () => {
    expect(
      formatVideoPlaybackValue(
        make({}, 1, { allowSkipping: true, autoPlay: true })
      )
    ).toBe('Skipping ahead, Rewind on wrong answer, Autoplay');
    expect(
      formatVideoPlaybackValue(make({}, 1, { requireCorrectAnswer: false }))
    ).toBe('Off');
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
