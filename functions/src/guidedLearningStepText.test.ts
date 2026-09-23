import { describe, expect, it } from 'vitest';
import {
  buildStepTextParts,
  clampStepText,
  clampStepTextResponse,
  parseStepTextRequest,
  STEP_TEXT_MAX_STEPS,
} from './guidedLearningStepText';

const STEP = { imageBase64: 'AAAA', action: 'click', accessibleName: 'Clock' };

describe('parseStepTextRequest', () => {
  it('fills defaults and bounds the fields', () => {
    const req = parseStepTextRequest({
      goal: 'Add a clock',
      steps: [{ ...STEP, action: 'weird', anchorLabel: 'x'.repeat(500) }],
    });
    expect(req.goal).toBe('Add a clock');
    expect(req.steps[0]).toMatchObject({
      mimeType: 'image/png',
      action: 'click',
      accessibleName: 'Clock',
    });
    expect(req.steps[0].anchorLabel).toHaveLength(200);
  });

  it('refuses empty, oversized and imageless requests', () => {
    expect(() => parseStepTextRequest({ steps: [] })).toThrow(
      'At least one step is required.'
    );
    expect(() =>
      parseStepTextRequest({
        steps: Array.from({ length: STEP_TEXT_MAX_STEPS + 1 }, () => STEP),
      })
    ).toThrow('Draft at most 20 steps at a time.');
    expect(() =>
      parseStepTextRequest({ steps: [{ action: 'click' }] })
    ).toThrow('Every step needs an image under 1 MB.');
    expect(() =>
      parseStepTextRequest({ steps: [{ ...STEP, mimeType: 'image/gif' }] })
    ).toThrow('Unsupported image type.');
  });
});

describe('buildStepTextParts', () => {
  it('sends the goal, then each step line and its image', () => {
    const parts = buildStepTextParts(
      parseStepTextRequest({
        goal: 'Add a clock',
        steps: [{ ...STEP, anchorLabel: 'Dock button' }],
      })
    );
    expect(parts[0].text).toBe('Goal of the walkthrough: Add a clock');
    expect(parts[1].text).toBe('Step 1: click "Clock" (Dock button)');
    expect(parts[2]).toEqual({
      inlineData: { mimeType: 'image/png', data: 'AAAA' },
    });
  });
});

describe('clampStepText', () => {
  it('holds labels to 4 words and text to 25 words, without em-dashes or exclamations', () => {
    expect(
      clampStepText({
        label: 'Open the big settings menu.',
        text: 'Click Settings — it opens the menu!',
      })
    ).toEqual({
      label: 'Open the big settings',
      text: 'Click Settings, it opens the menu.',
    });
    const long = clampStepText({ text: Array(40).fill('word').join(' ') });
    expect(long.text.split(' ')).toHaveLength(25);
    expect(long.text.endsWith('word.')).toBe(true);
  });

  it('treats junk as empty', () => {
    expect(clampStepText(null)).toEqual({ label: '', text: '' });
    expect(clampStepText({ label: 4, text: {} })).toEqual({
      label: '',
      text: '',
    });
  });

  it('returns one entry per input step', () => {
    expect(clampStepTextResponse({ steps: [{ label: 'A' }] }, 3)).toEqual([
      { label: 'A', text: '' },
      { label: '', text: '' },
      { label: '', text: '' },
    ]);
    expect(clampStepTextResponse('nope', 1)).toEqual([{ label: '', text: '' }]);
  });
});
