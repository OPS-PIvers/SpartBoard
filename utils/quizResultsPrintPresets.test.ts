import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyPreset,
  loadResultsPrintChoice,
  saveResultsPrintChoice,
} from '@/utils/quizResultsPrintPresets';

describe('results print presets', () => {
  beforeEach(() => localStorage.clear());

  it('sets every toggle per the plan table', () => {
    expect(applyPreset('student-copy')).toMatchObject({
      includeQuestions: true,
      markAnswers: true,
      keyMode: 'off',
      showScore: true,
      showTargets: true,
      showCommentBox: true,
      showWrittenFeedback: false,
      includeStimuli: false,
      duplexPadding: true,
      layout: 'report',
    });
    expect(applyPreset('graded-copy')).toMatchObject({
      keyMode: 'missed',
      showWrittenFeedback: true,
    });
    expect(applyPreset('responses-only')).toMatchObject({
      markAnswers: false,
      showScore: false,
      showTargets: false,
      showCommentBox: false,
    });
    expect(applyPreset('answer-key-review')).toMatchObject({
      keyMode: 'all',
      showTargets: false,
      showCommentBox: false,
    });
    expect(applyPreset('bubble-sheet').layout).toBe('sheet');
  });

  it('hands back a copy, so changing a toggle never edits the preset', () => {
    applyPreset('student-copy').markAnswers = false;
    expect(applyPreset('student-copy').markAnswers).toBe(true);
  });

  it('remembers the last choice and falls back to the student copy', () => {
    expect(loadResultsPrintChoice().preset).toBe('student-copy');
    saveResultsPrintChoice({
      preset: null,
      options: { ...applyPreset('graded-copy'), includeStimuli: true },
    });
    const loaded = loadResultsPrintChoice();
    expect(loaded.preset).toBeNull();
    expect(loaded.options).toMatchObject({
      keyMode: 'missed',
      includeStimuli: true,
    });
  });

  it('ignores stored junk field by field', () => {
    localStorage.setItem(
      'spartboard.quizResults.printOptions',
      JSON.stringify({
        preset: 'nope',
        options: {
          keyMode: 'everything',
          markAnswers: 'yes',
          showScore: false,
        },
      })
    );
    const loaded = loadResultsPrintChoice();
    expect(loaded.preset).toBeNull();
    expect(loaded.options.keyMode).toBe('off');
    expect(loaded.options.markAnswers).toBe(true);
    expect(loaded.options.showScore).toBe(false);

    localStorage.setItem('spartboard.quizResults.printOptions', '{bad');
    expect(loadResultsPrintChoice().preset).toBe('student-copy');
  });

  it('starts on a given preset when nothing is saved and keeps a saved missed-only scope', () => {
    localStorage.clear();
    expect(loadResultsPrintChoice('full-report').preset).toBe('full-report');
    saveResultsPrintChoice({
      preset: 'missed-only',
      options: applyPreset('missed-only'),
    });
    expect(loadResultsPrintChoice().options.questionScope).toBe('missed');
  });
});
