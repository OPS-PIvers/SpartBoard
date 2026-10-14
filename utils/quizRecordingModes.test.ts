import { describe, it, expect } from 'vitest';
import {
  recordingLimitCeiling,
  recordingModesForQuestion,
} from './quizRecordingModes';

const block = {
  prepSeconds: 0,
  limitSeconds: 60,
  prepExpiry: 'armed' as const,
  takeLimit: null,
};

describe('recordingModesForQuestion', () => {
  it('reads no mode as audio and nothing for a question without a block', () => {
    expect(recordingModesForQuestion({ recording: block })).toEqual(['audio']);
    expect(recordingModesForQuestion({})).toEqual([]);
  });

  it('reads the whiteboard mode', () => {
    expect(
      recordingModesForQuestion({ recording: { ...block, mode: 'whiteboard' } })
    ).toEqual(['whiteboard']);
  });

  it('gives whiteboard the 300 s ceiling', () => {
    expect(recordingLimitCeiling(['whiteboard'])).toEqual({
      seconds: 300,
      mode: 'whiteboard',
    });
  });
});
