import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FOCUS_SETTINGS,
  DEFAULT_FOCUS_WINDOW,
  FOCUS_SESSIONS_COLLECTION,
  FOCUS_STUDENTS_SUBCOLLECTION,
  FOCUS_TTL_FIELD,
} from './contract';
import { parseFocusSettings, validFocusWindow } from './settings';
import { normalizeFocusLiveSiteSettings } from '@/config/focusSessions';

const W = {
  start: '08:15',
  end: '15:00',
  days: [1, 3, 5],
  timeZone: 'America/Chicago',
};

describe('parseFocusSettings', () => {
  it('falls back to the defaults, live site off, for a missing or odd doc', () => {
    for (const raw of [undefined, null, 'x', 3, {}])
      expect(parseFocusSettings(raw)).toEqual(DEFAULT_FOCUS_SETTINGS);
  });

  it('turns the live site on only for an explicit true', () => {
    expect(parseFocusSettings({ showLiveSite: true }).showLiveSite).toBe(true);
    for (const v of ['true', 1, null, false])
      expect(parseFocusSettings({ showLiveSite: v }).showLiveSite).toBe(false);
    expect(normalizeFocusLiveSiteSettings({ showLiveSite: true })).toEqual({
      enabled: true,
    });
    expect(normalizeFocusLiveSiteSettings(undefined)).toEqual({
      enabled: false,
    });
  });

  it('keeps a valid window and replaces a malformed one with the default', () => {
    expect(parseFocusSettings({ window: W }).window).toEqual(W);
    for (const bad of [
      { ...W, start: '15:00', end: '08:00' },
      { ...W, end: '24:00' },
      { ...W, days: [] },
      { ...W, days: [7] },
      { ...W, timeZone: 'Mars/Base' },
    ]) {
      expect(validFocusWindow(bad)).toBeNull();
      expect(parseFocusSettings({ window: bad }).window).toEqual(
        DEFAULT_FOCUS_WINDOW
      );
    }
  });

  it('drops repeated days', () => {
    expect(validFocusWindow({ ...W, days: [1, 1, 3] })?.days).toEqual([1, 3]);
  });
});

describe('Focus TTL policies', () => {
  it('cover the session and students collection groups on the contract field', () => {
    const { fieldOverrides } = JSON.parse(
      readFileSync(resolve(process.cwd(), 'firestore.indexes.json'), 'utf8')
    ) as {
      fieldOverrides: {
        collectionGroup: string;
        fieldPath: string;
        ttl?: boolean;
      }[];
    };
    for (const group of [
      FOCUS_SESSIONS_COLLECTION,
      FOCUS_STUDENTS_SUBCOLLECTION,
    ])
      expect(
        fieldOverrides.some(
          (o) =>
            o.collectionGroup === group &&
            o.fieldPath === FOCUS_TTL_FIELD &&
            o.ttl === true
        )
      ).toBe(true);
  });
});
