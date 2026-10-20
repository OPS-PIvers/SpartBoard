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
import { SPEAK_DIALECTS, SPEAK_LANGUAGES } from '@/config/pronunciationGroups';
import { SPEAK_G2P_VERSION } from '@/utils/pronunciation/g2pVersion';

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
  g2pVersion: SPEAK_G2P_VERSION,
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
      cardNeedsLookup(card(), ['es-419'], {
        c1: { term: 'hola', ipa: { 'es-419': 'ola' } },
      })
    ).toBe(true);
    expect(
      cardNeedsLookup(card(), ['es-419'], {
        c1: { term: 'hola', ipa: { 'es-419': '  ' } },
      })
    ).toBe(false);
    const failed = card({
      speak: { ...readySpeak(), reasons: ['lookup-failed'] },
    });
    expect(cardNeedsLookup(failed, ['es-419'], {})).toBe(true);
    expect(cardNeedsLookup(card({ speak: undefined }), ['es-419'], {})).toBe(
      true
    );
  });

  it('looks up again after an engine change', () => {
    const old = card({ speak: { ...readySpeak(), g2pVersion: 'old' } });
    expect(cardNeedsLookup(old, ['es-419'], {})).toBe(true);
    const pending = card({
      speak: { ...readySpeak(), g2pVersion: `${SPEAK_G2P_VERSION}/pending` },
    });
    // Without its accents recorded the background fill can't take it, so Save does.
    expect(cardNeedsLookup(pending, ['es-419'], {})).toBe(true);
    const waiting = card({
      speak: {
        ...readySpeak(),
        dialects: ['es-419'],
        g2pVersion: `${SPEAK_G2P_VERSION}/pending`,
      },
    });
    expect(cardNeedsLookup(waiting, ['es-419'], {})).toBe(false);
    expect(cardNeedsLookup(waiting, ['es-419', 'es-ES'], {})).toBe(true);
    const voiced = card({
      speak: {
        ...readySpeak(),
        refs: [
          ...readySpeak().refs,
          {
            dialect: 'es-419',
            tokens: ['o', 'l', 'ɐ'],
            stress: [0],
            source: 'voice',
          },
        ],
      },
    });
    expect(cardNeedsLookup(voiced, ['es-419'], {})).toBe(false);
    expect(cardNeedsLookup(voiced, ['es-419', 'es-ES'], {})).toBe(true);
  });

  it('keeps a card whose other accent failed for a recorded reason', () => {
    const oneFailed = card({
      speak: {
        ...readySpeak(),
        status: 'needs-review',
        reasons: ['untokenizable'],
      },
    });
    expect(cardNeedsLookup(oneFailed, ['es-419', 'es-ES'], {})).toBe(false);
    expect(cardNeedsLookup(oneFailed, ['es-ES'], {})).toBe(true);
    // A flag on the accent that worked doesn't explain a newly added accent.
    const flagged = card({
      speak: {
        ...readySpeak(),
        status: 'needs-review',
        reasons: ['g2p-disagree'],
      },
    });
    expect(cardNeedsLookup(flagged, ['es-419', 'es-ES'], {})).toBe(true);
  });

  it('looks a card with no refs up again for an accent it was not looked up for', () => {
    const noneSpeak: NonNullable<FlashcardCard['speak']> = {
      ...readySpeak(),
      refs: [],
      status: 'unavailable',
      reasons: ['untokenizable'],
      dialects: ['es-419'],
    };
    const none = card({ speak: noneSpeak });
    expect(cardNeedsLookup(none, ['es-419'], {})).toBe(false);
    expect(cardNeedsLookup(none, ['es-419', 'es-ES'], {})).toBe(true);
    expect(cardNeedsLookup(none, ['es-ES'], {})).toBe(true);
    // Saved before lookups recorded their accents, so it can't say which it covered.
    const legacy = { ...noneSpeak };
    delete legacy.dialects;
    expect(cardNeedsLookup(card({ speak: legacy }), ['es-419'], {})).toBe(true);
    // One accent failed: the recorded accents say both were tried.
    const oneFailedSpeak: NonNullable<FlashcardCard['speak']> = {
      ...readySpeak(),
      status: 'needs-review',
      reasons: ['untokenizable'],
      dialects: ['es-419'],
    };
    const oneFailed = card({ speak: oneFailedSpeak });
    expect(cardNeedsLookup(oneFailed, ['es-419', 'es-ES'], {})).toBe(true);
    expect(
      cardNeedsLookup(
        card({ speak: { ...oneFailedSpeak, dialects: ['es-419', 'es-ES'] } }),
        ['es-419', 'es-ES'],
        {}
      )
    ).toBe(false);
  });

  it('relies on no language having more than two accents', () => {
    for (const language of SPEAK_LANGUAGES) {
      expect(SPEAK_DIALECTS[language].length).toBeLessThanOrEqual(2);
    }
  });

  it('keeps a confirmation only when the references are unchanged', () => {
    const previous = {
      ...readySpeak(),
      status: 'needs-review' as const,
      confirmedAt: 5,
    };
    const same = { ...previous, confirmedAt: undefined };
    expect(keepSpeakConfirmation(previous, same).confirmedAt).toBe(5);
    const voiced = {
      ...same,
      refs: [
        ...same.refs,
        {
          dialect: 'es-419' as const,
          tokens: ['o', 'l', 'ɐ'],
          stress: [0],
          source: 'voice' as const,
        },
      ],
    };
    expect(keepSpeakConfirmation(previous, voiced).confirmedAt).toBe(5);
    const moved = { ...same, refs: [] };
    expect(keepSpeakConfirmation(previous, moved).confirmedAt).toBeUndefined();
  });

  it('validates IPA like the server does', () => {
    expect(ipaOverrideValid('')).toBe(true);
    expect(ipaOverrideValid('/ˈo.la/')).toBe(true);
    expect(ipaOverrideValid('#')).toBe(false);
  });
});
