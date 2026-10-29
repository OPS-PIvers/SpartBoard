import { describe, expect, it } from 'vitest';
import type { WidgetData } from '@/types';
import { resolveSyncedTimer } from './linkedTimer';

const w = (id: string, type: WidgetData['type']) =>
  ({ id, type, config: {} }) as unknown as WidgetData;

describe('resolveSyncedTimer', () => {
  const board = [w('m1', 'music'), w('t1', 'time-tool'), w('t2', 'time-tool')];

  it('follows the linked Timer', () => {
    expect(resolveSyncedTimer(board, 't2')?.id).toBe('t2');
  });

  it('falls back to the first Timer when nothing is linked', () => {
    expect(resolveSyncedTimer(board, undefined)?.id).toBe('t1');
  });

  it('falls back to the first Timer when the linked one is gone', () => {
    expect(resolveSyncedTimer(board, 'gone')?.id).toBe('t1');
  });

  it('ignores a linked id that is not a Timer', () => {
    expect(resolveSyncedTimer(board, 'm1')?.id).toBe('t1');
  });

  it('returns nothing on a board without a Timer', () => {
    expect(resolveSyncedTimer([w('m1', 'music')], 't1')).toBeUndefined();
  });
});
