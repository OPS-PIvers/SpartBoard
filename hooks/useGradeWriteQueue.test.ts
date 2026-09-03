import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  useGradeWriteQueue,
  SAVED_STATUS_MS,
} from '@/hooks/useGradeWriteQueue';
import type { WrittenAnswerGrade } from '@/types';

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const grade = (points: number): WrittenAnswerGrade => ({
  pointsAwarded: points,
  gradedBy: 't1',
  gradedAt: 1,
});

const flush = () =>
  act(async () => {
    await Promise.resolve();
  });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useGradeWriteQueue', () => {
  it('reports saving, then saved, then fades back to idle', async () => {
    const write = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useGradeWriteQueue(write, [10, 20]));
    void act(() => result.current.enqueue('r1', 'q1', grade(3), 'Ada'));
    expect(result.current.status).toBe('saving');
    await flush();
    expect(result.current.status).toBe('saved');
    void act(() => vi.advanceTimersByTime(SAVED_STATUS_MS));
    expect(result.current.status).toBe('idle');
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('retries with backoff and parks the failure after the last attempt', async () => {
    const write = vi.fn(() => Promise.reject(new Error('offline')));
    const { result } = renderHook(() => useGradeWriteQueue(write, [10, 20]));
    void act(() => result.current.enqueue('r1', 'q1', grade(3), 'Ada'));
    await flush();
    expect(write).toHaveBeenCalledTimes(1);
    void act(() => vi.advanceTimersByTime(10));
    await flush();
    expect(write).toHaveBeenCalledTimes(2);
    void act(() => vi.advanceTimersByTime(20));
    await flush();
    expect(write).toHaveBeenCalledTimes(3);
    expect(result.current.status).toBe('error');
    expect(result.current.failed).toEqual([
      expect.objectContaining({
        responseKey: 'r1',
        targetKey: 'q1',
        studentName: 'Ada',
      }),
    ]);
  });

  it('retryAll resends a parked failure and clears it on success', async () => {
    let fail = true;
    const write = vi.fn(() =>
      fail ? Promise.reject(new Error('x')) : Promise.resolve()
    );
    const { result } = renderHook(() => useGradeWriteQueue(write, []));
    void act(() => result.current.enqueue('r1', 'q1', grade(3), 'Ada'));
    await flush();
    expect(result.current.failed).toHaveLength(1);
    fail = false;
    void act(() => result.current.retryAll());
    await flush();
    expect(result.current.failed).toHaveLength(0);
    expect(result.current.status).toBe('saved');
  });

  it('sends the latest grade once an in-flight write finishes', async () => {
    let release: () => void = () => undefined;
    const write = vi
      .fn<(rk: string, tk: string, g: WrittenAnswerGrade) => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
      .mockImplementation(() => Promise.resolve());
    const { result } = renderHook(() => useGradeWriteQueue(write, []));
    void act(() => result.current.enqueue('r1', 'q1', grade(1), 'Ada'));
    void act(() => result.current.enqueue('r1', 'q1', grade(2), 'Ada'));
    void act(() => result.current.enqueue('r1', 'q1', grade(3), 'Ada'));
    expect(write).toHaveBeenCalledTimes(1);
    void act(() => release());
    await flush();
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1][2].pointsAwarded).toBe(3);
  });

  it('flushAll sends pending retries at once and returns what still failed', async () => {
    const write = vi.fn(() => Promise.reject(new Error('offline')));
    const { result } = renderHook(() => useGradeWriteQueue(write, [60_000]));
    void act(() => result.current.enqueue('r1', 'q1', grade(3), 'Ada'));
    await flush();
    expect(write).toHaveBeenCalledTimes(1);
    let failures: unknown[] = [];
    await act(async () => {
      failures = await result.current.flushAll();
    });
    expect(write).toHaveBeenCalledTimes(2);
    expect(failures).toHaveLength(1);
  });
});
