import { describe, it, expect } from 'vitest';
import type { QuizStimulus } from '@/types';
import {
  activeStimulusTab,
  hasStimulusTab,
  imageInPanel,
  splitStimuliForTabs,
  stimulusTabLabels,
  stimulusUseCounts,
} from '@/utils/quizStimulusTabs';
import { projectSessionStimuli } from '@/utils/quizStimuli';

const stim = (id: string, extra: Partial<QuizStimulus> = {}): QuizStimulus => ({
  id,
  type: 'text',
  url: '',
  label: '',
  ...extra,
});

describe('stimulus tabs', () => {
  const counts = stimulusUseCounts([
    { stimulusIds: ['shared', 'text'] },
    { stimulusIds: ['shared', 'solo', 'shared'] },
    {},
  ]);

  it('counts each question once per stimulus', () => {
    expect(counts.get('shared')).toBe(2);
    expect(counts.get('solo')).toBe(1);
  });

  it('puts a shared picture beside the question and a single-use one in it (M13)', () => {
    expect(imageInPanel(stim('shared', { type: 'image' }), counts)).toBe(true);
    expect(imageInPanel(stim('solo', { type: 'image' }), counts)).toBe(false);
    expect(
      imageInPanel(stim('solo', { type: 'image', placement: 'panel' }), counts)
    ).toBe(true);
    expect(
      imageInPanel(
        stim('shared', { type: 'image', placement: 'inline' }),
        counts
      )
    ).toBe(false);
  });

  it('keeps audio and video in the question and the calculator last (M13, M14)', () => {
    const { panel, inline } = splitStimuliForTabs(
      [
        stim('calc', { type: 'calculator', calculator: 'scientific' }),
        stim('shared', { type: 'image' }),
        stim('audio', { type: 'audio' }),
        stim('text'),
        stim('solo', { type: 'image' }),
      ],
      counts
    );
    expect(panel.map((s) => s.id)).toEqual(['shared', 'text', 'calc']);
    expect(inline.map((s) => s.id)).toEqual(['audio', 'solo']);
  });

  it('names tabs by tabLabel, numbers the rest and calls the calculator Calculator (M12, M14)', () => {
    expect(
      stimulusTabLabels([
        stim('a', { tabLabel: ' Source A ' }),
        stim('b'),
        stim('c', { type: 'calculator', tabLabel: 'Ignored' }),
      ])
    ).toEqual(['Source A', 'Tab 2', 'Calculator']);
  });

  it('opens the first tab, and keeps the open one when the next question shares it', () => {
    const panel = [stim('a'), stim('b')];
    expect(activeStimulusTab(panel, null)).toBe('a');
    expect(activeStimulusTab(panel, 'b')).toBe('b');
    expect(activeStimulusTab(panel, 'gone')).toBe('a');
    expect(activeStimulusTab([], 'a')).toBeNull();
  });

  it('only offers a tab for panel types', () => {
    expect(hasStimulusTab('image')).toBe(true);
    expect(hasStimulusTab('pdf')).toBe(true);
    expect(hasStimulusTab('video')).toBe(false);
  });

  it('keeps tabLabel on the session doc and strips the authoring label', () => {
    const [out] = projectSessionStimuli({
      questions: [
        {
          id: 'q',
          type: 'MC',
          text: '',
          timeLimit: 0,
          correctAnswer: 'a',
          incorrectAnswers: [],
          stimulusIds: ['a'],
        },
      ],
      stimuli: [stim('a', { label: 'Mine', tabLabel: 'Tab A' })],
    });
    expect(out.label).toBe('');
    expect(out.tabLabel).toBe('Tab A');
  });
});
