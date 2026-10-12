import { describe, expect, it } from 'vitest';
import type { GuidedLearningStep } from '@/types';
import { bindWithStarterText, starterStepText } from './starterText';

const step = (patch: Partial<GuidedLearningStep> = {}) =>
  ({
    id: 'a',
    xPct: 50,
    yPct: 50,
    imageIndex: 0,
    interactionType: 'text-popover',
    tour: { anchor: '', action: 'click' },
    ...patch,
  }) as GuidedLearningStep;

describe('starterStepText', () => {
  it('names a control from its registry label', () => {
    expect(starterStepText({ anchor: 'dock.open-tools', action: 'click' }))
      .toMatchInlineSnapshot(`
      {
        "label": "Open Tools button",
        "text": "Click the Open Tools button in the collapsed dock.",
      }
    `);
  });

  it('uses the widget name for a widget-scoped anchor', () => {
    expect(
      starterStepText({ anchor: 'library.item:clock', action: 'click' })
    ).toEqual({
      label: 'Clock tile',
      text: 'Click the Clock tile in the widget library.',
    });
  });

  it('lowers a plain noun mid-sentence', () => {
    expect(
      starterStepText({
        anchor: 'library.search',
        action: 'type',
        value: 'timer',
      })?.text
    ).toBe('Type "timer" in the widget library search box.');
  });

  it('words each action', () => {
    const text = (b: Parameters<typeof starterStepText>[0]) =>
      starterStepText(b)?.text;
    expect(text({ anchor: 'library.root', action: 'observe' })).toBe(
      'Take a look at the widget library window.'
    );
    expect(
      text({ anchor: 'library.root', action: 'toggle', value: true })
    ).toBe('Turn on the widget library window.');
    expect(
      text({ anchor: 'library.root', action: 'toggle', value: false })
    ).toBe('Turn off the widget library window.');
    expect(text({ anchor: 'library.root', action: 'select' })).toBe(
      'Choose an option in the widget library window.'
    );
  });

  it('names an untagged control by its accessible name', () => {
    expect(
      starterStepText({
        anchor: '',
        action: 'click',
        fallback: { role: 'button', name: 'tools' },
      })
    ).toEqual({ label: 'Tools', text: 'Click tools.' });
  });

  it('says nothing for the whole board, an unknown anchor or no binding', () => {
    expect(starterStepText({ anchor: 'board.whole', action: 'observe' })).toBe(
      null
    );
    expect(starterStepText({ anchor: 'nope.nope', action: 'click' })).toBe(
      null
    );
    expect(starterStepText({ anchor: '', action: 'click' })).toBe(null);
    expect(starterStepText(undefined)).toBe(null);
  });
});

describe('bindWithStarterText', () => {
  const tools = { anchor: 'dock.open-tools', action: 'click' } as const;

  it('fills an empty title and text', () => {
    expect(bindWithStarterText(step(), tools)).toEqual({
      tour: tools,
      label: 'Open Tools button',
      text: 'Click the Open Tools button in the collapsed dock.',
    });
  });

  it('keeps what the author wrote', () => {
    expect(
      bindWithStarterText(step({ label: 'Mine', text: 'My words' }), tools)
    ).toEqual({ tour: tools });
  });

  it('refreshes untouched starter text when the binding changes', () => {
    const first = step({ tour: tools, ...bindWithStarterText(step(), tools) });
    const toggled = { ...tools, action: 'observe' } as const;
    expect(bindWithStarterText(first, toggled)).toEqual({
      tour: toggled,
      label: 'Open Tools button',
      text: 'Take a look at the Open Tools button in the collapsed dock.',
    });
    expect(
      bindWithStarterText({ ...first, text: 'Edited' }, toggled)
    ).not.toHaveProperty('text');
  });

  it('leaves the text alone when the new binding has no starter', () => {
    expect(
      bindWithStarterText(step(), { anchor: 'board.whole', action: 'observe' })
    ).toEqual({ tour: { anchor: 'board.whole', action: 'observe' } });
  });
});
