import { describe, expect, it, vi } from 'vitest';
import {
  narrateTourSteps,
  narrationSourceText,
  stepsToNarrate,
  type NarrationDeps,
} from './tourNarration';
import type { GlSet } from './glTools';

type Steps = GlSet['steps'];
const hash = (text: string) => `h:${text}`;

const deps = (fail: string[] = []): NarrationDeps => ({
  hash,
  synthesize: vi.fn((text: string) =>
    fail.some((f) => text.includes(f))
      ? Promise.reject(new Error('TTS down'))
      : Promise.resolve({
          storagePath: `quiz_tts_cache/v/${text}.mp3`,
          voice: 'v',
          textHash: hash(text),
          durationMs: 900,
        })
  ),
  urlFor: (path) => Promise.resolve(`https://cdn/${path}`),
});

const steps = [
  { id: 'new', label: 'Open it', text: 'Click the gear.' },
  { id: 'none', label: 'Only a label' },
  {
    id: 'same',
    label: 'Keep',
    text: 'Same words.',
    narration: { source: 'generated', textHash: hash('Keep. Same words.') },
  },
  {
    id: 'changed',
    label: 'Keep',
    text: 'New words.',
    narration: { source: 'generated', textHash: hash('Keep. Old words.') },
  },
  {
    id: 'recorded',
    text: 'Anything.',
    narration: { source: 'recorded', textHash: 'x' },
  },
] as unknown as Steps;

describe('live tour narration', () => {
  it('speaks the label then the text, as the Studio does', () => {
    expect(narrationSourceText({ label: 'Open it', text: 'Click.' })).toBe(
      'Open it. Click.'
    );
    expect(narrationSourceText({ label: 'Ready?', text: 'Go.' })).toBe(
      'Ready? Go.'
    );
  });

  it('narrates new and changed text, never a recorded take or a step without text', () => {
    expect(stepsToNarrate(steps, hash)).toEqual([0, 3]);
  });

  it('adds generated takes and reports the steps TTS failed on', async () => {
    const out = await narrateTourSteps(steps, deps(['New words']));
    expect(out.failed).toEqual(['changed']);
    expect(out.steps[0]).toMatchObject({
      narration: {
        source: 'generated',
        url: 'https://cdn/quiz_tts_cache/v/Open it. Click the gear..mp3',
        textHash: hash('Open it. Click the gear.'),
        durationMs: 900,
      },
    });
    expect(out.steps[3]).toBe(steps[3]);
    expect(out.steps[2]).toBe(steps[2]);
  });
});
