import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import {
  EMPTY_MEDIA_FILTERS,
  MAX_DELETE_TARGETS,
  useOrgMediaResponses,
} from './useOrgMediaResponses';

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('@/config/firebase', () => ({ functions: {} }));

const target = (i: number) => ({
  sessionId: 's1',
  responseKey: `r${i}`,
  questionId: 'q1',
});

describe('useOrgMediaResponses delete batching', () => {
  beforeEach(() => vi.clearAllMocks());

  it('matches the callable cap so no batch is rejected outright', () => {
    const source = readFileSync(
      resolve(__dirname, '../functions/src/deleteQuizMediaForOrgAdmin.ts'),
      'utf-8'
    );
    const match = /MAX_DELETE_TARGETS = (\d+)/.exec(source);
    expect(Number(match?.[1])).toBe(MAX_DELETE_TARGETS);
  });

  it('splits a selection larger than the cap into sequential calls', async () => {
    const batches: number[] = [];
    (httpsCallable as unknown as Mock).mockImplementation(
      () => (payload: { targets?: unknown[] }) => {
        if (!payload.targets) {
          return Promise.resolve({
            data: { rows: [], teachers: [], truncated: false },
          });
        }
        batches.push(payload.targets.length);
        return Promise.resolve({ data: { results: [] } });
      }
    );

    const { result } = renderHook(() =>
      useOrgMediaResponses('orono', EMPTY_MEDIA_FILTERS)
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    const targets = Array.from({ length: 250 }, (_, i) => target(i));
    await act(async () => {
      await result.current.deleteMedia(targets);
    });
    expect(batches).toEqual([100, 100, 50]);
  });

  it('merges per-item results and keeps going past a failed batch', async () => {
    let call = 0;
    (httpsCallable as unknown as Mock).mockImplementation(
      () => (payload: { targets?: Array<{ responseKey: string }> }) => {
        if (!payload.targets) {
          return Promise.resolve({
            data: { rows: [], teachers: [], truncated: false },
          });
        }
        call += 1;
        if (call === 1) return Promise.reject(new Error('deadline-exceeded'));
        return Promise.resolve({
          data: {
            results: payload.targets.map((t) => ({
              sessionId: 's1',
              responseKey: t.responseKey,
              questionId: 'q1',
              artifactId: 'a1',
              status: 'deleted' as const,
            })),
          },
        });
      }
    );

    const { result } = renderHook(() =>
      useOrgMediaResponses('orono', EMPTY_MEDIA_FILTERS)
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    const targets = Array.from({ length: 150 }, (_, i) => target(i));
    let results: Awaited<ReturnType<typeof result.current.deleteMedia>> = [];
    await act(async () => {
      results = await result.current.deleteMedia(targets);
    });
    expect(results).toHaveLength(150);
    expect(results.filter((r) => r.status === 'failed')).toHaveLength(100);
    expect(results.filter((r) => r.status === 'deleted')).toHaveLength(50);
  });
});
