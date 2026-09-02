/**
 * The cached take must follow the artifact the teacher pinned (Brief 3.6
 * review): re-pinning `gradedTakeIndex` arrives live, so a cached object URL
 * for the old take would keep playing under the new label.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/config/firebase', () => ({ functions: {} }));

import {
  useQuizArtifactPlayback,
  type PlaybackTarget,
  type FetchPlayback,
} from './useQuizArtifactPlayback';

const target = (artifactId: string): PlaybackTarget => ({
  sessionId: 's1',
  responseKey: 'r1',
  questionId: 'q1',
  slot: 'primary',
  artifactId,
});

const readyFor =
  (id: string): FetchPlayback =>
  () =>
    Promise.resolve({
      status: 'ready',
      artifactId: id,
      takeIndex: 1,
      mimeType: 'audio/mp4',
      data: btoa(id),
      durationMs: 4000,
    });

const revoke = vi.fn();

beforeAll(() => {
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:${++n}`);
  URL.revokeObjectURL = revoke;
});

describe('useQuizArtifactPlayback', () => {
  it('refetches after the pinned take changes, revoking the stale URL', async () => {
    const fetchPlayback = vi.fn(readyFor('artifact-1'));
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useQuizArtifactPlayback(target(id), fetchPlayback),
      { initialProps: { id: 'artifact-1' } }
    );

    act(() => result.current.load());
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));
    const firstUrl =
      result.current.state.phase === 'ready' ? result.current.state.url : '';
    expect(fetchPlayback).toHaveBeenCalledTimes(1);

    rerender({ id: 'artifact-2' });
    expect(result.current.state.phase).toBe('idle');
    expect(revoke).toHaveBeenCalledWith(firstUrl);

    act(() => result.current.load());
    await waitFor(() => expect(fetchPlayback).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));
    const secondUrl =
      result.current.state.phase === 'ready' ? result.current.state.url : '';
    expect(secondUrl).not.toBe(firstUrl);
  });

  it('serves the cached take while the artifact is unchanged', async () => {
    const fetchPlayback = vi.fn(readyFor('artifact-1'));
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useQuizArtifactPlayback(target(id), fetchPlayback),
      { initialProps: { id: 'artifact-1' } }
    );
    act(() => result.current.load());
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));
    rerender({ id: 'artifact-1' });
    act(() => result.current.load());
    expect(fetchPlayback).toHaveBeenCalledTimes(1);
  });
});
