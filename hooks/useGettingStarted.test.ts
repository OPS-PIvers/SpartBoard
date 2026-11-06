import { describe, expect, it, vi } from 'vitest';
import type { GettingStartedEntry } from '@/config/gettingStarted';
import type { HelpResourceItem } from '@/types/helpCenter';

vi.mock('@/config/firebase', () => ({ db: {}, isConfigured: false }));

const { resolveGettingStartedTours } = await import('./useGettingStarted');

const item = (id: string, setId?: string) =>
  ({
    id,
    title: id,
    kind: setId ? 'guided-learning' : 'embed',
    setId,
    widgetTypes: [],
  }) as unknown as HelpResourceItem;

const entry = (
  itemId: string,
  doneWhen: GettingStartedEntry['doneWhen'] = 'finished'
): GettingStartedEntry => ({ itemId, tier: 'essentials', doneWhen });

const facts = {
  finished: {},
  hasBuilding: false,
  hasDriveGrant: false,
  hasClass: false,
  isExternalUser: false,
};

describe('resolveGettingStartedTours', () => {
  it('drops a missing item, a non-tour item and a tour that cannot run', () => {
    const tours = resolveGettingStartedTours(
      [entry('gone'), entry('doc'), entry('broken'), entry('ok')],
      [item('doc'), item('broken', 'set-broken'), item('ok', 'set-ok')],
      new Set(['set-ok']),
      facts
    );
    expect(tours.map((t) => t.itemId)).toEqual(['ok']);
  });

  it('checks a learning tour off only when it was finished', () => {
    const run = (finished: Record<string, number>) =>
      resolveGettingStartedTours(
        [entry('ok')],
        [item('ok', 'set-ok')],
        new Set(['set-ok']),
        { ...facts, finished }
      )[0].done;
    expect(run({})).toBe(false);
    expect(run({ 'set-ok': 1 })).toBe(true);
  });

  it('checks a setup tour off on the real thing, however it was done', () => {
    const run = (
      doneWhen: GettingStartedEntry['doneWhen'],
      fact: Partial<typeof facts>
    ) =>
      resolveGettingStartedTours(
        [entry('ok', doneWhen)],
        [item('ok', 'set-ok')],
        new Set(['set-ok']),
        { ...facts, finished: { 'set-ok': 1 }, ...fact }
      )[0].done;
    expect(run('building', {})).toBe(false);
    expect(run('building', { hasBuilding: true })).toBe(true);
    expect(run('drive', {})).toBe(false);
    expect(run('drive', { hasDriveGrant: true })).toBe(true);
    expect(run('classes', {})).toBe(false);
    expect(run('classes', { hasClass: true })).toBe(true);
  });

  it('hides the Drive tour from external users', () => {
    const tours = resolveGettingStartedTours(
      [entry('drive', 'drive'), entry('ok')],
      [item('drive', 'set-drive'), item('ok', 'set-ok')],
      new Set(['set-drive', 'set-ok']),
      { ...facts, isExternalUser: true }
    );
    expect(tours.map((t) => t.itemId)).toEqual(['ok']);
  });
});
