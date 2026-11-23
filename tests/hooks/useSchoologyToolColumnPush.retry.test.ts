import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@/config/firebase', () => ({ functions: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const { pushMock, categoriesMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  categoriesMock: vi.fn(),
}));
vi.mock('@/utils/schoologyToolColumns', async (orig) => ({
  ...(await orig<typeof import('@/utils/schoologyToolColumns')>()),
  pushToolColumn: pushMock,
  fetchToolColumnCategories: categoriesMock,
}));

import { useSchoologyToolColumnPush } from '@/hooks/useSchoologyToolColumnPush';

const grades = [
  { pseudonymUid: 'a', pointsEarned: 5 },
  { pseudonymUid: 'b', pointsEarned: 4 },
  { pseudonymUid: 'c', pointsEarned: 3 },
];

const renderPush = (onDone: (m: string, ok: boolean, r?: () => void) => void) =>
  renderHook(() =>
    useSchoologyToolColumnPush({
      sessionId: 'sess-1',
      kind: 'quiz',
      title: 'Quiz',
      buildPayload: () => Promise.resolve({ maxPoints: 5, grades }),
      onDone,
    })
  );

describe('useSchoologyToolColumnPush retry', () => {
  beforeEach(() => {
    pushMock.mockReset();
    categoriesMock.mockReset();
    categoriesMock.mockResolvedValue({
      sections: [
        {
          contextId: 's1',
          title: 'P1',
          hasColumn: true,
          needsCategory: false,
          categories: null,
          defaultCategoryId: null,
        },
      ],
      recommended: [],
    });
  });

  it('offers a retry that resends only the grades that failed', async () => {
    pushMock.mockResolvedValueOnce({
      results: [
        { pseudonymUid: 'a', ok: true },
        { pseudonymUid: 'b', ok: false, status: 429 },
        { pseudonymUid: 'c', ok: false, reason: 'unchanged' },
      ],
      pushed: 1,
      total: 3,
      sections: [],
    });
    const onDone = vi.fn();
    const { result } = renderPush(onDone);
    await act(() => result.current.start());

    const [message, ok, retry] = onDone.mock.calls[0] as [
      string,
      boolean,
      (() => void) | undefined,
    ];
    expect(message).toBe(
      'Pushed 1 grade to Schoology. 1 unchanged. 1 not sent.'
    );
    expect(ok).toBe(false);
    expect(retry).toBeTypeOf('function');

    pushMock.mockResolvedValueOnce({
      results: [{ pseudonymUid: 'b', ok: true }],
      pushed: 1,
      total: 1,
      sections: [],
    });
    await act(async () => {
      retry?.();
      await vi.waitFor(() => expect(pushMock).toHaveBeenCalledTimes(2));
    });
    expect((pushMock.mock.calls[1][1] as { grades: unknown }).grades).toEqual([
      { pseudonymUid: 'b', pointsEarned: 4 },
    ]);
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledTimes(2));
    expect(onDone.mock.calls[1][1]).toBe(true);
    expect(onDone.mock.calls[1][2]).toBeUndefined();
  });

  it('offers a retry of the whole push when the call itself fails', async () => {
    pushMock.mockRejectedValueOnce(new Error('network changed'));
    const onDone = vi.fn();
    const { result } = renderPush(onDone);
    await act(() => result.current.start());
    expect(onDone.mock.calls[0][1]).toBe(false);
    pushMock.mockResolvedValueOnce({
      results: grades.map((g) => ({ pseudonymUid: g.pseudonymUid, ok: true })),
      pushed: 3,
      total: 3,
      sections: [],
    });
    await act(async () => {
      (onDone.mock.calls[0][2] as () => void)();
      await vi.waitFor(() => expect(pushMock).toHaveBeenCalledTimes(2));
    });
    expect((pushMock.mock.calls[1][1] as { grades: unknown }).grades).toEqual(
      grades
    );
  });

  it('sends the current score on Retry and offers no Retry for a refusal', async () => {
    pushMock.mockResolvedValueOnce({
      results: [
        { pseudonymUid: 'a', ok: false, status: 404 },
        { pseudonymUid: 'b', ok: false, status: 503 },
        { pseudonymUid: 'c', ok: true },
      ],
      pushed: 1,
      total: 3,
      sections: [],
    });
    let current = grades;
    const onDone = vi.fn();
    const { result } = renderHook(() =>
      useSchoologyToolColumnPush({
        sessionId: 'sess-2',
        kind: 'quiz',
        title: 'Quiz',
        buildPayload: () => Promise.resolve({ maxPoints: 5, grades: current }),
        onDone,
      })
    );
    await act(() => result.current.start());
    expect(onDone.mock.calls[0][0]).toContain('2 not sent.');
    current = [
      { pseudonymUid: 'a', pointsEarned: 5 },
      { pseudonymUid: 'b', pointsEarned: 1 },
      { pseudonymUid: 'c', pointsEarned: 3 },
    ];
    pushMock.mockResolvedValueOnce({
      results: [{ pseudonymUid: 'b', ok: true }],
      pushed: 1,
      total: 1,
      sections: [],
    });
    await act(async () => {
      (onDone.mock.calls[0][2] as () => void)();
      await vi.waitFor(() => expect(pushMock).toHaveBeenCalledTimes(2));
    });
    expect((pushMock.mock.calls[1][1] as { grades: unknown }).grades).toEqual([
      { pseudonymUid: 'b', pointsEarned: 1 },
    ]);
  });

  it('offers no Retry when every failure would fail again', async () => {
    pushMock.mockResolvedValueOnce({
      results: grades.map((g) => ({
        pseudonymUid: g.pseudonymUid,
        ok: false,
        reason: 'not a teacher of the Schoology section',
      })),
      pushed: 0,
      total: 3,
      sections: [],
    });
    const onDone = vi.fn();
    const { result } = renderPush(onDone);
    await act(() => result.current.start());
    expect(onDone.mock.calls[0][2]).toBeUndefined();
  });
});
