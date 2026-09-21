import { describe, it, expect } from 'vitest';
import type { QuizQuestion, QuizStimulus } from '@/types';
import {
  isDocShapedStimulus,
  isPlayLimitedType,
  projectSessionStimuli,
  questionsUsingStimulus,
  readAloudTextByStimulusId,
  resolveStimuli,
  sanitizeStimulusPointers,
  stimulusMediaUrl,
  stimulusPlayKey,
} from './quizStimuli';

const stim = (id: string, over: Partial<QuizStimulus> = {}): QuizStimulus => ({
  id,
  type: 'image',
  url: `https://example.com/${id}.png`,
  label: id,
  ...over,
});

const q = (id: string, stimulusIds?: string[]): QuizQuestion => ({
  id,
  timeLimit: 0,
  text: `Question ${id}`,
  type: 'MC',
  correctAnswer: 'a',
  incorrectAnswers: ['b'],
  ...(stimulusIds ? { stimulusIds } : {}),
});

describe('type predicates', () => {
  it('classifies doc-shaped and play-limited types', () => {
    expect(isDocShapedStimulus('pdf')).toBe(true);
    expect(isDocShapedStimulus('gdoc-embed')).toBe(true);
    expect(isDocShapedStimulus('image')).toBe(false);
    expect(isPlayLimitedType('audio')).toBe(true);
    expect(isPlayLimitedType('video')).toBe(true);
    expect(isPlayLimitedType('youtube')).toBe(true);
    expect(isPlayLimitedType('pdf')).toBe(false);
  });

  it('reads a passage alongside the question, like a PDF (D16)', () => {
    expect(isDocShapedStimulus('text')).toBe(true);
    // Nothing plays, so no play limit applies.
    expect(isPlayLimitedType('text')).toBe(false);
  });
});

describe('a passage has no file to fetch', () => {
  it('asks for no media URL even when one was left on it', () => {
    const passage = stim('s1', {
      type: 'text',
      url: 'https://example.com/stale.png',
      text: 'The tide pool.',
    });
    expect(stimulusMediaUrl(passage)).toBe('');
  });
});

describe('sanitizeStimulusPointers', () => {
  it('returns the same array reference when nothing dangles', () => {
    const questions = [q('a', ['s1']), q('b')];
    const result = sanitizeStimulusPointers(questions, [stim('s1')]);
    expect(result).toBe(questions);
  });

  it('strips ids that reference no stimulus and drops empty arrays', () => {
    const questions = [q('a', ['s1', 'gone']), q('b', ['gone'])];
    const result = sanitizeStimulusPointers(questions, [stim('s1')]);
    expect(result[0].stimulusIds).toEqual(['s1']);
    expect(result[1].stimulusIds).toBeUndefined();
  });

  it('treats undefined stimuli as an empty registry', () => {
    const result = sanitizeStimulusPointers([q('a', ['s1'])], undefined);
    expect(result[0].stimulusIds).toBeUndefined();
  });
});

describe('projectSessionStimuli', () => {
  it('keeps only referenced entries and strips labels', () => {
    const quiz = {
      questions: [q('a', ['s1']), q('b')],
      stimuli: [stim('s1', { label: 'secret name' }), stim('s2')],
    };
    const projected = projectSessionStimuli(quiz);
    expect(projected).toHaveLength(1);
    expect(projected[0].id).toBe('s1');
    expect(projected[0].label).toBe('');
    // Source array is untouched.
    expect(quiz.stimuli[0].label).toBe('secret name');
  });

  it('keeps playLimit on projected entries', () => {
    const projected = projectSessionStimuli({
      questions: [q('a', ['s1'])],
      stimuli: [stim('s1', { type: 'audio', playLimit: 2 })],
    });
    expect(projected[0].playLimit).toBe(2);
  });

  it('returns empty for stimulus-free quizzes', () => {
    expect(
      projectSessionStimuli({ questions: [q('a')], stimuli: undefined })
    ).toEqual([]);
  });

  it('dedupes a referenced stimulus id that appears twice in stimuli (Drive-sync race), keeping the first', () => {
    const projected = projectSessionStimuli({
      questions: [q('a', ['s1'])],
      stimuli: [
        stim('s1', { url: 'https://example.com/first.png' }),
        stim('s1', { url: 'https://example.com/second.png' }),
      ],
    });
    expect(projected).toHaveLength(1);
    expect(projected[0].url).toBe('https://example.com/first.png');
  });

  it('strips the authoring-only read-aloud fields', () => {
    const projected = projectSessionStimuli({
      questions: [q('a', ['s1'])],
      stimuli: [
        stim('s1', { readAloudText: 'Passage', readAloudSource: 'pdf-text' }),
      ],
    });
    expect(projected[0]).not.toHaveProperty('readAloudText');
    expect(projected[0]).not.toHaveProperty('readAloudSource');
  });

  it('carries a passage through to the session (D16)', () => {
    // The projection strips authoring-only fields and blanks the label; a
    // passage's text is the content itself, so losing it would leave the
    // student an empty box where the reading should be.
    const projected = projectSessionStimuli({
      questions: [q('a', ['s1'])],
      stimuli: [
        stim('s1', {
          type: 'text',
          url: '',
          text: 'The tide pool holds more life than it looks.',
          label: 'Reading',
        }),
      ],
    });
    expect(projected[0].text).toBe(
      'The tide pool holds more life than it looks.'
    );
    expect(projected[0].label).toBe('');
  });
});

describe('readAloudTextByStimulusId', () => {
  it('collects trimmed text for referenced image/pdf stimuli only', () => {
    const out = readAloudTextByStimulusId({
      questions: [q('a', ['s1', 's2', 's3', 's4'])],
      stimuli: [
        stim('s1', { readAloudText: '  Passage one.  ' }),
        stim('s2', { type: 'pdf', readAloudText: 'Passage two.' }),
        stim('s3', { type: 'audio', readAloudText: 'never spoken' }),
        stim('s4', { readAloudText: '   ' }),
        stim('s5', { readAloudText: 'unreferenced' }),
      ],
    });
    expect(out).toEqual({ s1: 'Passage one.', s2: 'Passage two.' });
  });

  it('speaks a passage as written, with no review pass (D16)', () => {
    const out = readAloudTextByStimulusId({
      questions: [q('a', ['s1', 's2'])],
      stimuli: [
        stim('s1', { type: 'text', url: '', text: '  The tide pool.  ' }),
        // An empty passage has nothing to speak.
        stim('s2', { type: 'text', url: '', text: '   ' }),
      ],
    });
    expect(out).toEqual({ s1: 'The tide pool.' });
  });

  it('is empty when nothing has text', () => {
    expect(
      readAloudTextByStimulusId({
        questions: [q('a', ['s1'])],
        stimuli: [stim('s1')],
      })
    ).toEqual({});
  });
});

describe('resolveStimuli', () => {
  const registry = [stim('s1'), stim('s2')];
  it('resolves ids in pointer order and skips unknowns', () => {
    expect(
      resolveStimuli(['s2', 'missing', 's1'], registry).map((s) => s.id)
    ).toEqual(['s2', 's1']);
  });
  it('handles empty inputs', () => {
    expect(resolveStimuli(undefined, registry)).toEqual([]);
    expect(resolveStimuli(['s1'], undefined)).toEqual([]);
  });
});

describe('stimulusPlayKey / questionsUsingStimulus', () => {
  it('namespaces play counters by attempt', () => {
    expect(stimulusPlayKey(0, 's1')).toBe('a0:s1');
    expect(stimulusPlayKey(2, 's1')).toBe('a2:s1');
  });
  it('lists question indices using a stimulus', () => {
    const questions = [q('a', ['s1']), q('b'), q('c', ['s1', 's2'])];
    expect(questionsUsingStimulus(questions, 's1')).toEqual([0, 2]);
    expect(questionsUsingStimulus(questions, 's2')).toEqual([2]);
    expect(questionsUsingStimulus(questions, 'zz')).toEqual([]);
  });
});
