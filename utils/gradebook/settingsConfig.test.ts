import { describe, expect, it } from 'vitest';
import { DEFAULT_GRADEBOOK_FLAGS } from './gradebookCore';
import {
  BUILTIN_CONFIG_ENTRY,
  applyToastText,
  checkFlagKey,
  defaultSettingsBody,
  newFlag,
  nextFreeFlagKey,
  resolveClassConfig,
  restoreDefaultCategories,
  type GradebookConfigEntry,
} from './settingsConfig';

const entry = (
  key: string,
  source: GradebookConfigEntry['source'],
  extra: Partial<GradebookConfigEntry> = {}
): GradebookConfigEntry => {
  const [, id] = key.split(':');
  return {
    key,
    source,
    ref:
      source === 'plc'
        ? { source: 'plc', plcId: id }
        : source === 'builtin'
          ? null
          : { source, configId: id },
    name: key,
    body: defaultSettingsBody(key),
    readOnly: source !== 'personal',
    ...extra,
  };
};

describe('resolveClassConfig', () => {
  const mine = entry('personal:a', 'personal');
  const plc = entry('plc:p1', 'plc');
  const dist = entry('district:d1', 'district', { isDefault: true });

  it('uses the class doc ref, and null means built-in defaults', () => {
    const refs = new Map([
      ['r1', mine.ref],
      ['r2', null],
    ]);
    expect(resolveClassConfig('r1', refs, [mine, plc]).key).toBe(mine.key);
    expect(resolveClassConfig('r2', refs, [mine, plc])).toBe(
      BUILTIN_CONFIG_ENTRY
    );
  });

  it('falls back to built-in when the linked configuration is gone', () => {
    const refs = new Map([
      ['r1', { source: 'personal' as const, configId: 'x' }],
    ]);
    expect(resolveClassConfig('r1', refs, [mine])).toBe(BUILTIN_CONFIG_ENTRY);
  });

  it('starts a new class on the single PLC set, then the district default', () => {
    const none = new Map();
    expect(resolveClassConfig('new', none, [mine, plc, dist]).key).toBe(
      plc.key
    );
    const plc2 = entry('plc:p2', 'plc');
    expect(resolveClassConfig('new', none, [mine, plc, plc2, dist]).key).toBe(
      dist.key
    );
    expect(resolveClassConfig('new', none, [mine])).toBe(BUILTIN_CONFIG_ENTRY);
  });
});

describe('flag keys', () => {
  it('refuses non-letters, P and a key another flag uses', () => {
    expect(checkFlagKey('1', DEFAULT_GRADEBOOK_FLAGS, 'late')).toEqual({
      ok: false,
      message: 'A key is one letter.',
    });
    expect(checkFlagKey('p', DEFAULT_GRADEBOOK_FLAGS, 'late')).toEqual({
      ok: false,
      message: 'P is the privacy shortcut.',
    });
    expect(checkFlagKey('m', DEFAULT_GRADEBOOK_FLAGS, 'late')).toEqual({
      ok: false,
      message: 'Missing already uses M.',
    });
    expect(checkFlagKey('m', DEFAULT_GRADEBOOK_FLAGS, 'missing')).toEqual({
      ok: true,
      key: 'M',
    });
    expect(checkFlagKey(' t ', DEFAULT_GRADEBOOK_FLAGS, 'late')).toEqual({
      ok: true,
      key: 'T',
    });
  });

  it('gives a new flag the next free key and never P', () => {
    expect(nextFreeFlagKey(DEFAULT_GRADEBOOK_FLAGS)).toBe('N');
    const f = newFlag(DEFAULT_GRADEBOOK_FLAGS, 'f1');
    expect(f).toMatchObject({
      key: 'N',
      builtIn: false,
      visibility: 'teacher',
      value: null,
    });
    const all = 'ABCDEFGHIJKLMNOQRSTUVWXYZ'
      .split('')
      .map((key) => ({ ...DEFAULT_GRADEBOOK_FLAGS[3], id: key, key }));
    expect(nextFreeFlagKey(all)).toBeNull();
  });
});

it('restores default categories onto the first two ids', () => {
  const out = restoreDefaultCategories([
    { id: 'x', name: 'Tests', weight: 50 },
    { id: 'y', name: 'Homework', weight: 30 },
    { id: 'z', name: 'Other', weight: 20 },
  ]);
  expect(out).toEqual([
    { id: 'x', name: 'Academic Achievement', weight: 60 },
    { id: 'y', name: 'Academic Practice', weight: 40 },
  ]);
});

it('words the Applies to toasts', () => {
  const a = entry('personal:a', 'personal', { name: 'My settings' });
  const b = entry('personal:b', 'personal', { name: 'Honors' });
  expect(applyToastText('Period 6', a, b, true)).toBe(
    'Moved Period 6 from Honors to My settings'
  );
  expect(applyToastText('Period 2', a, BUILTIN_CONFIG_ENTRY, true)).toBe(
    'Period 2 now uses My settings'
  );
  expect(applyToastText('Period 2', a, a, false)).toBe(
    'Period 2 now uses the default settings'
  );
});
