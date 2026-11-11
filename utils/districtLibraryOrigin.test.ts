import { describe, expect, it } from 'vitest';
import {
  DISTRICT_SHARE_REFUSAL,
  assertShareableOutsideLibrary,
  districtItemIdsOf,
  districtLinkedQuizId,
  districtMetaFields,
  hasDistrictContent,
  isDistrictLinkedCopy,
  responsesAnsweringRemoved,
} from './districtLibraryOrigin';

// A typed-but-unset mark, as on an ordinary QuizQuestion.
const plainQ: { id: string; districtItemId?: string } = { id: 'q1' };
const libQ = { id: 'q2', districtItemId: 'item-a' };
const libSlot = { id: 's1', districtItemId: 'item-b' };

describe('districtItemIdsOf', () => {
  it('collects marks from questions and draws, sorted and once each', () => {
    expect(
      districtItemIdsOf({
        questions: [plainQ, libQ, { districtItemId: 'item-a' }],
        bankSlots: [libSlot],
      })
    ).toEqual(['item-a', 'item-b']);
    expect(districtItemIdsOf({ questions: [{ districtItemId: '' }] })).toEqual(
      []
    );
  });
});

describe('districtMetaFields', () => {
  it('only grows the origin, so deleting library questions never clears it', () => {
    const first = districtMetaFields({ questions: [libQ] });
    expect(first).toEqual({ districtOrigin: ['item-a'] });
    expect(districtMetaFields({ questions: [plainQ] }, first)).toEqual({
      districtOrigin: ['item-a'],
    });
  });

  it('sets, keeps and clears the linked item', () => {
    const linked = districtMetaFields({}, null, 'item-z');
    expect(linked).toEqual({
      districtOrigin: ['item-z'],
      districtLinkedItemId: 'item-z',
    });
    expect(districtMetaFields({}, linked).districtLinkedItemId).toBe('item-z');
    // A duplicate passes null: an unlinked copy that still carries the origin.
    expect(districtMetaFields({}, linked, null)).toEqual({
      districtOrigin: ['item-z'],
    });
  });

  it('writes nothing for an ordinary quiz', () => {
    expect(districtMetaFields({ questions: [plainQ] })).toEqual({});
  });
});

describe('share refusal (M30)', () => {
  it('refuses library questions, library draws, a library bank and a recorded origin', () => {
    expect(() => assertShareableOutsideLibrary({ questions: [libQ] })).toThrow(
      DISTRICT_SHARE_REFUSAL
    );
    expect(() =>
      assertShareableOutsideLibrary({ bankSlots: [libSlot] })
    ).toThrow(DISTRICT_SHARE_REFUSAL);
    expect(() =>
      assertShareableOutsideLibrary({}, [{ districtItemId: 'bank-1' }])
    ).toThrow(DISTRICT_SHARE_REFUSAL);
    expect(() =>
      assertShareableOutsideLibrary({ questions: [plainQ] }, [], ['item-a'])
    ).toThrow(DISTRICT_SHARE_REFUSAL);
  });

  it('lets an ordinary quiz through', () => {
    expect(() =>
      assertShareableOutsideLibrary({ questions: [plainQ] }, [
        { questions: [plainQ] },
      ])
    ).not.toThrow();
    expect(hasDistrictContent({ questions: [plainQ] })).toBe(false);
  });
});

describe('linked copies', () => {
  it('uses one fixed library id per item and reads the marker', () => {
    expect(districtLinkedQuizId('item-a')).toBe('district-item-a');
    expect(isDistrictLinkedCopy({ districtLinkedItemId: 'item-a' })).toBe(true);
    expect(isDistrictLinkedCopy({})).toBe(false);
    expect(isDistrictLinkedCopy(null)).toBe(false);
  });
});

describe('responsesAnsweringRemoved', () => {
  it('counts responses that answered a question the new version drops', () => {
    const responses = [
      { answers: [{ questionId: 'a' }, { questionId: 'b' }] },
      { answers: [{ questionId: 'c' }] },
      { answers: [] },
      {},
    ];
    expect(
      responsesAnsweringRemoved(['a', 'b', 'c'], ['b', 'c'], responses)
    ).toEqual({
      removed: ['a'],
      responseCount: 1,
    });
    expect(responsesAnsweringRemoved(['a'], ['a', 'd'], responses)).toEqual({
      removed: [],
      responseCount: 0,
    });
  });
});
