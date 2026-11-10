import { describe, expect, it } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import {
  newPublicToken,
  parsePublicTourPath,
  pictureFingerprint,
  publicLinkStatus,
  type PublicLinkRecord,
} from './publicLinkModel';

const web = (
  steps: { id: string; path?: string; text?: string; markup?: unknown[] }[]
) =>
  ({
    id: 'w',
    title: 'Web',
    surface: 'web',
    steps: steps.map((s) => ({
      id: s.id,
      label: s.id,
      text: s.text ?? 'Tip',
      web: {
        urlPattern: 'https://x.example/*',
        action: 'click',
        ...(s.path
          ? { picture: { path: s.path, w: 10, h: 10, markup: s.markup } }
          : {}),
      },
    })),
  }) as unknown as GuidedLearningSet;

const box = { id: 'b', kind: 'box', x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
const base = web([
  { id: 'a', path: 'p/a.png', markup: [box] },
  { id: 'b', path: 'p/b.png' },
]);

const live = (thumbUrl: string) =>
  ({
    id: 'l',
    title: 'Live',
    mode: 'tour',
    steps: [
      {
        id: 'a',
        text: 'Tip',
        tour: {
          anchor: 'dock.x',
          action: 'click',
          thumbnail: { url: thumbUrl, anchor: 'dock.x', w: 1, h: 1 },
        },
      },
    ],
  }) as unknown as GuidedLearningSet;

describe('pictureFingerprint', () => {
  it('ignores text edits and step order', () => {
    const f = pictureFingerprint(base);
    expect(
      pictureFingerprint(
        web([
          { id: 'b', path: 'p/b.png', text: 'Other words' },
          { id: 'a', path: 'p/a.png', markup: [box] },
        ])
      )
    ).toBe(f);
  });

  it('changes with a new file from a crop, blur, retake or replace', () => {
    expect(
      pictureFingerprint(
        web([
          { id: 'a', path: 'p/a2.png', markup: [box] },
          { id: 'b', path: 'p/b.png' },
        ])
      )
    ).not.toBe(pictureFingerprint(base));
  });

  it('changes with markup, and with a new picture on a step', () => {
    const f = pictureFingerprint(base);
    expect(
      pictureFingerprint(
        web([
          { id: 'a', path: 'p/a.png', markup: [{ ...box, x: 0.3 }] },
          { id: 'b', path: 'p/b.png' },
        ])
      )
    ).not.toBe(f);
    expect(
      pictureFingerprint(
        web([
          { id: 'a', path: 'p/a.png', markup: [box] },
          { id: 'b', path: 'p/b.png' },
          { id: 'c', path: 'p/c.png' },
        ])
      )
    ).not.toBe(f);
  });

  it('changes with a Live retake, which stores a new thumbnail file', () => {
    expect(pictureFingerprint(live('https://h/o/1.png'))).not.toBe(
      pictureFingerprint(live('https://h/o/2.png'))
    );
  });

  it('is null for something that is not a tour', () => {
    expect(
      pictureFingerprint({ id: 'x', steps: [] } as unknown as GuidedLearningSet)
    ).toBeNull();
  });
});

describe('publicLinkStatus', () => {
  const record: PublicLinkRecord = {
    token: 'a'.repeat(32),
    fingerprint: pictureFingerprint(base) ?? '',
    kind: 'web',
    confirmedBy: 'admin@x.org',
    confirmedAt: 1,
    pictures: {},
  };
  it('is on with the public address while the pictures match', () => {
    expect(publicLinkStatus(record, base, 'https://s.app')).toEqual({
      kind: 'on',
      url: `https://s.app/tour-steps/${'a'.repeat(32)}`,
    });
  });
  it('is paused once a changed picture is published, before the server says so', () => {
    const changed = web([{ id: 'a', path: 'p/new.png' }]);
    expect(publicLinkStatus(record, changed, 'o')).toEqual({
      kind: 'paused',
      reason: 'pictures',
    });
  });
  it('stays paused once the server switched it off, even when the pictures match again', () => {
    expect(
      publicLinkStatus(
        { ...record, off: { reason: 'pictures', at: 2 } },
        base,
        'o'
      )
    ).toEqual({ kind: 'paused', reason: 'pictures' });
  });
  it('is off when an admin switched it off, so turning it on again needs no review', () => {
    expect(
      publicLinkStatus(
        { ...record, off: { reason: 'admin', at: 2 } },
        base,
        'o'
      )
    ).toEqual({ kind: 'off' });
  });
  it('is off without a record and paused when unpublished', () => {
    expect(publicLinkStatus(null, base, 'o')).toEqual({ kind: 'off' });
    expect(publicLinkStatus(record, null, 'o')).toEqual({
      kind: 'paused',
      reason: 'unpublished',
    });
  });
});

describe('tokens and paths', () => {
  it('makes 128-bit hex tokens that the page reads back', () => {
    const a = newPublicToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newPublicToken()).not.toBe(a);
    expect(parsePublicTourPath(`/tour-steps/${a}`)).toBe(a);
    expect(parsePublicTourPath(`/tour-steps/${a}/`)).toBe(a);
    expect(parsePublicTourPath('/tour-steps/set-id')).toBeNull();
    expect(parsePublicTourPath(`/tour/${a}`)).toBeNull();
  });
});
