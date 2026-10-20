import { describe, expect, it } from 'vitest';
import type { FlashcardCard, FlashcardSpeakSettings } from '@/types';
import {
  applySpeakPreset,
  cardNeedsLookup,
  ipaOverrideValid,
  keepSpeakConfirmation,
  setSpeakGroup,
  setSpeakStrict,
} from './speakEditorState';

const base: FlashcardSpeakSettings = {
  dialects: ['es-419'],
  preset: 'beginner',
  strict: false,
  groups: {},
  attempts: 3,
  example: true,
};

const readySpeak = (): NonNullable<FlashcardCard['speak']> => ({
  term: 'hola',
  refs: [{ dialect: 'es-419', tokens: ['o', 'l', 'a'], stress: [0] }],
  g2pVersion: 'v1',
  status: 'ready',
});

const card = (over: Partial<FlashcardCard> = {}): FlashcardCard => ({
  id: 'c1',
  term: 'hola',
  definition: 'hello',
  speak: readySpeak(),
  ...over,
});

describe('speakEditorState', () => {
  it('fills every group from a preset', () => {
    const next = applySpeakPreset(base, 'es', 'intermediate');
    expect(next.preset).toBe('intermediate');
    expect(next.groups['es-trill']).toBe('require');
    expect(next.groups['es-aspiration']).toBe('forgive');
    expect(applySpeakPreset(base, 'es', 'advanced').strict).toBe(true);
  });

  it('moves to custom on a group change or a Strict the preset lacks', () => {
    expect(setSpeakGroup(base, 'es-tap', 'require').preset).toBe('custom');
    expect(setSpeakStrict(base, true).preset).toBe('custom');
    expect(setSpeakStrict(base, false).preset).toBe('beginner');
    const advanced = applySpeakPreset(base, 'es', 'advanced');
    expect(setSpeakStrict(advanced, true).preset).toBe('advanced');
  });

  it('looks up again on a changed term, accents, IPA or a failed lookup', () => {
    expect(cardNeedsLookup(card(), ['es-419'], {})).toBe(false);
    expect(cardNeedsLookup(card({ term: 'hole' }), ['es-419'], {})).toBe(true);
    expect(cardNeedsLookup(card(), ['es-419', 'es-ES'], {})).toBe(true);
    expect(
      cardNeedsLookup(card(), ['es-419'], { c1: { 'es-419': 'ola' } })
    ).toBe(true);
    expect(
      cardNeedsLookup(card(), ['es-419'], { c1: { 'es-419': '  ' } })
    ).toBe(false);
    const failed = card({
      speak: { ...readySpeak(), reasons: ['lookup-failed'] },
    });
    expect(cardNeedsLookup(failed, ['es-419'], {})).toBe(true);
    expect(cardNeedsLookup(card({ speak: undefined }), ['es-419'], {})).toBe(
      true
    );
  });

  it('keeps a confirmation only when the references are unchanged', () => {
    const previous = {
      ...readySpeak(),
      status: 'needs-review' as const,
      confirmedAt: 5,
    };
    const same = { ...previous, confirmedAt: undefined };
    expect(keepSpeakConfirmation(previous, same).confirmedAt).toBe(5);
    const moved = { ...same, refs: [] };
    expect(keepSpeakConfirmation(previous, moved).confirmedAt).toBeUndefined();
  });

  it('validates IPA like the server does', () => {
    expect(ipaOverrideValid('')).toBe(true);
    expect(ipaOverrideValid('/ˈo.la/')).toBe(true);
    expect(ipaOverrideValid('#')).toBe(false);
  });
});
