import { describe, expect, it } from 'vitest';
import { getAssignSteps, getAssignStepTitle } from './assignSteps';

describe('getAssignSteps (D4)', () => {
  it('gives Quiz the three rule steps and never a study resource', () => {
    expect(getAssignSteps('quiz', { kind: 'work' })).toEqual([
      'classes',
      'when',
      'attempts',
      'integrity',
      'feedback',
    ]);
    expect(getAssignSteps('quiz', { kind: 'resource' })).toEqual(
      getAssignSteps('quiz', { kind: 'work' })
    );
  });

  it('adds Sharing for Quiz and Video when the teacher is in a PLC', () => {
    expect(getAssignSteps('quiz', { kind: 'work', inPlc: true }).at(-1)).toBe(
      'sharing'
    );
    expect(getAssignSteps('video', { kind: 'work', inPlc: true })).toEqual([
      'classes',
      'when',
      'sharing',
    ]);
    expect(
      getAssignSteps('video', { kind: 'work', live: true, inPlc: true })
    ).toEqual(['classes', 'when', 'sharing']);
  });

  it('gives Video only Classes and When outside a PLC', () => {
    expect(getAssignSteps('video', { kind: 'work' })).toEqual([
      'classes',
      'when',
    ]);
  });

  it('adds the Video rule steps when rules belong to the assignment, self-paced only', () => {
    expect(getAssignSteps('video', { kind: 'work', rules: true })).toEqual([
      'classes',
      'when',
      'attempts',
      'video',
      'integrity',
    ]);
    expect(
      getAssignSteps('video', {
        kind: 'work',
        rules: true,
        videoAnswerRows: true,
        inPlc: true,
      })
    ).toEqual([
      'classes',
      'when',
      'attempts',
      'video',
      'integrity',
      'feedback',
      'sharing',
    ]);
    expect(
      getAssignSteps('video', { kind: 'work', rules: true, live: true })
    ).toEqual(['classes', 'when']);
    expect(getAssignSteps('quiz', { kind: 'work', rules: true })).toEqual(
      getAssignSteps('quiz', { kind: 'work' })
    );
  });

  it('titles the Video steps', () => {
    expect(getAssignStepTitle('video', 'video', { kind: 'work' })).toBe(
      'Video'
    );
    expect(getAssignStepTitle('integrity', 'video', { kind: 'work' })).toBe(
      'Integrity'
    );
    expect(getAssignStepTitle('integrity', 'quiz', { kind: 'work' })).toBe(
      'Quiz integrity'
    );
  });

  it('never gives Guided Learning or Flashcards a Sharing step', () => {
    expect(getAssignSteps('gl', { kind: 'work', inPlc: true })).toEqual([
      'classes',
      'when',
    ]);
    expect(getAssignSteps('flashcards', { kind: 'work', inPlc: true })).toEqual(
      ['classes', 'when', 'check']
    );
  });

  it('removes every step after When for a study resource', () => {
    expect(getAssignSteps('gl', { kind: 'resource' })).toEqual([
      'classes',
      'when',
    ]);
    expect(
      getAssignSteps('flashcards', { kind: 'resource', inPlc: true })
    ).toEqual(['classes', 'when']);
  });

  it('adds the Speak step to a Flashcards study resource when Speak is available', () => {
    expect(
      getAssignSteps('flashcards', { kind: 'resource', speak: true })
    ).toEqual(['classes', 'when', 'speak']);
    expect(getAssignSteps('flashcards', { kind: 'work', speak: true })).toEqual(
      ['classes', 'when', 'check']
    );
    expect(getAssignSteps('gl', { kind: 'resource', speak: true })).toEqual([
      'classes',
      'when',
    ]);
  });

  it('gives Mini App Classes and When for either kind (D20)', () => {
    expect(getAssignSteps('miniapp', { kind: 'work', inPlc: true })).toEqual([
      'classes',
      'when',
    ]);
    expect(getAssignSteps('miniapp', { kind: 'resource' })).toEqual([
      'classes',
      'when',
    ]);
    expect(getAssignStepTitle('when', 'miniapp', { kind: 'resource' })).toBe(
      'Available'
    );
  });
});

describe('getAssignStepTitle', () => {
  it('names Class for Video live and Available for a study resource', () => {
    expect(
      getAssignStepTitle('classes', 'video', { kind: 'work', live: true })
    ).toBe('Class');
    expect(getAssignStepTitle('classes', 'quiz', { kind: 'work' })).toBe(
      'Classes'
    );
    expect(getAssignStepTitle('when', 'gl', { kind: 'resource' })).toBe(
      'Available'
    );
    expect(getAssignStepTitle('when', 'quiz', { kind: 'resource' })).toBe(
      'When'
    );
    expect(getAssignStepTitle('check', 'flashcards', { kind: 'work' })).toBe(
      'How students are checked'
    );
  });
});
