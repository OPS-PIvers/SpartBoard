import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { WidgetType } from '@/types';
import {
  WIDGET_SETTINGS_COMPONENTS,
  WIDGET_APPEARANCE_COMPONENTS,
  WIDGET_SETTINGS_SCHEMAS,
} from '@/components/widgets/WidgetRegistry';
import { renderLegacySettings, LegacySlot } from './renderLegacySettings';

// Inert Firestore so panels that load data render their deterministic empty state.
vi.mock('firebase/firestore', () => {
  const ref = { id: 'mock', path: 'mock' };
  const emptySnap = {
    exists: () => false,
    data: () => undefined,
    docs: [],
    empty: true,
    forEach: () => undefined,
    id: 'mock',
  };
  return {
    collection: () => ref,
    doc: () => ref,
    query: () => ref,
    where: () => ref,
    orderBy: () => ref,
    limit: () => ref,
    FieldPath: class {},
    getDoc: () => Promise.resolve(emptySnap),
    getDocs: () => Promise.resolve(emptySnap),
    getCountFromServer: () => Promise.resolve({ data: () => ({ count: 0 }) }),
    onSnapshot: () => () => undefined,
    setDoc: () => Promise.resolve(),
    addDoc: () => Promise.resolve(ref),
    updateDoc: () => Promise.resolve(),
    deleteDoc: () => Promise.resolve(),
    deleteField: () => undefined,
    arrayUnion: (...items: unknown[]) => items,
    increment: (n: number) => n,
    serverTimestamp: () => 0,
    runTransaction: () => Promise.resolve(),
    writeBatch: () => ({
      set: () => undefined,
      update: () => undefined,
      delete: () => undefined,
      commit: () => Promise.resolve(),
    }),
    Timestamp: { now: () => ({ toMillis: () => 0 }), fromMillis: () => ({}) },
  };
});

// Panels that cannot render under jsdom; each retires with its wave migration.
const SKIPPED: Partial<
  Record<LegacySlot, Partial<Record<WidgetType, string>>>
> = {
  settings: {},
  appearance: {},
};

const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

// React's useId() output (both the `_r_xx_` and legacy `:rN:` forms) shifts
// whenever the set of registry entries changes, so normalize it before
// snapshotting.
const normalizeGeneratedIds = (html: string): string =>
  html.replace(/_r_[0-9a-z]+_/g, '_r_ID_').replace(/:r[0-9a-z]+:/g, '_r_ID_');

describe('legacy settings render snapshots', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(FIXED_NOW);
    // CI injects a weather key; pin it so the Weather panel renders the same everywhere.
    vi.stubEnv('VITE_OPENWEATHER_API_KEY', 'test-key');
    let counter = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => 0.42);
    vi.stubGlobal('crypto', {
      ...globalThis.crypto,
      randomUUID: () =>
        `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
      getRandomValues: (array: Uint8Array) => array.fill(7),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const allCases: Array<{ slot: LegacySlot; type: WidgetType }> = [
    ...Object.keys(WIDGET_SETTINGS_COMPONENTS).map((type) => ({
      slot: 'settings' as const,
      type: type as WidgetType,
    })),
    ...Object.keys(WIDGET_APPEARANCE_COMPONENTS).map((type) => ({
      slot: 'appearance' as const,
      type: type as WidgetType,
    })),
  ];
  const cases = allCases.filter(({ slot, type }) => !SKIPPED[slot]?.[type]);
  const skippedCases = allCases.filter(
    ({ slot, type }) => SKIPPED[slot]?.[type]
  );

  it.each(cases)(
    '$slot slot for $type',
    async ({ slot, type }) => {
      const container = await renderLegacySettings(type, slot);
      expect(normalizeGeneratedIds(container.innerHTML)).toMatchSnapshot();
      // Large panels pull deep lazy import graphs; the default 5s is too tight.
    },
    30000
  );

  it.skip.each(skippedCases)('$slot slot for $type', () => undefined);

  // Keeps the suite non-empty now that every widget renders through a settings schema.
  it('never registers a legacy panel for a schema-owned widget', () => {
    expect(
      allCases.filter(({ type }) => WIDGET_SETTINGS_SCHEMAS[type])
    ).toEqual([]);
  });
});
