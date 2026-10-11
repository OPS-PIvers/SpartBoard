import { describe, expect, it } from 'vitest';
import type { GuidedLearningStep } from '@/types';
import { buildClaudePrompt } from './claudePrompt';

const step = (
  id: string,
  imageIndex: number,
  label?: string
): GuidedLearningStep =>
  ({
    id,
    imageIndex,
    label,
    xPct: 0,
    yPct: 0,
    interactionType: 'text-popover',
  }) as GuidedLearningStep;

const set = {
  id: 'set-1',
  title: 'Cell Parts',
  steps: [step('a', 0), step('b', 1, 'Nucleus'), step('c', 1)],
};

describe('buildClaudePrompt', () => {
  it('names the activity, source and fetch tool', () => {
    const text = buildClaudePrompt(set, { kind: 'activity' });
    expect(text).toContain('"Cell Parts" (set_id: set-1, source: mine)');
    expect(text).toContain('get_guided_learning');
    expect(text.endsWith('What I want: ')).toBe(true);
    expect(text).not.toContain('SpartBoard-Dev');
  });

  it('lists a slide by number with its step ids', () => {
    const text = buildClaudePrompt(set, { kind: 'slide', slideIndex: 1 });
    expect(text).toContain('slide 2 of');
    expect(text).toContain('slide_index: 1');
    expect(text).toContain('step 2 ("Nucleus"), step 3');
    expect(text).toContain('step ids: b, c');
  });

  it('says when a slide has no steps', () => {
    const text = buildClaudePrompt(set, { kind: 'slide', slideIndex: 4 });
    expect(text).toContain('This slide has no steps yet.');
  });

  it('pins a step by id', () => {
    const text = buildClaudePrompt(set, { kind: 'step', stepId: 'b' });
    expect(text).toContain('step 2 ("Nucleus"), on slide 2,');
    expect(text).toContain('by its id, b,');
  });

  it('falls back to the activity for a missing step', () => {
    const text = buildClaudePrompt(set, { kind: 'step', stepId: 'zzz' });
    expect(text).toContain("I'm working on my SpartBoard");
  });

  it('uses the building source and the dev connector hint', () => {
    const text = buildClaudePrompt(
      { ...set, isBuilding: true, title: '  ' },
      { kind: 'activity' },
      { dev: true }
    );
    expect(text.startsWith('Use the SpartBoard-Dev connector.')).toBe(true);
    expect(text).toContain(
      '"Untitled activity" (set_id: set-1, source: building)'
    );
  });
});
