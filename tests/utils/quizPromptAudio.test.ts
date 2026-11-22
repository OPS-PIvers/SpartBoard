import { describe, it, expect } from 'vitest';
import {
  AUDIO_QUESTION_LABEL,
  promptLabel,
  promptLabelOf,
} from '@/utils/quizPromptText';
import { pickPromptAudioMime } from '@/components/widgets/QuizWidget/components/usePromptAudioRecorder';
import { formatAudioDuration } from '@/utils/questionAudio';

const audio = { driveFileId: 'f1', durationSec: 4, mimeType: 'audio/mp4' };

describe('promptLabel', () => {
  it('names an audio-only question and keeps real text', () => {
    expect(promptLabel({ text: '', promptAudio: audio })).toBe(
      AUDIO_QUESTION_LABEL
    );
    expect(promptLabel({ text: 'Hi', promptAudio: audio })).toBe('Hi');
    expect(promptLabel({ text: '' })).toBe('');
    expect(promptLabelOf(undefined)).toBe('');
  });
});

describe('pickPromptAudioMime', () => {
  it('prefers MP4 so iPads can play it', () => {
    expect(pickPromptAudioMime(() => true)).toBe('audio/mp4;codecs=mp4a.40.2');
    expect(pickPromptAudioMime((m) => m.startsWith('audio/webm'))).toBe(
      'audio/webm;codecs=opus'
    );
    expect(pickPromptAudioMime(() => false)).toBe('');
  });
});

describe('formatAudioDuration', () => {
  it('shows minutes and padded seconds', () => {
    expect(formatAudioDuration(7.4)).toBe('0:07');
    expect(formatAudioDuration(125)).toBe('2:05');
  });
});
