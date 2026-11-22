import { describe, expect, it, vi } from 'vitest';
import { runBulkPublish, sharedVisibility } from './bulkPublish';

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

describe('runBulkPublish', () => {
  it('mints one token, publishes each target and reports once', async () => {
    const addToast = vi.fn();
    const mintToken = vi.fn(() => Promise.resolve('tok'));
    const publishOne = vi.fn((t: { id: string }, token: string | null) =>
      t.id === 'bad'
        ? Promise.reject(new Error('x'))
        : Promise.resolve(token === 'tok')
    );
    const ok = await runBulkPublish({
      targets: [{ id: 'a' }, { id: 'b' }, { id: 'bad' }],
      unpublish: false,
      mintToken,
      publishOne,
      addToast,
      logKey: 'test',
    });
    expect(ok).toBe(2);
    expect(mintToken).toHaveBeenCalledTimes(1);
    expect(addToast).toHaveBeenCalledWith(
      'Scores published for 2 assignments.',
      'success'
    );
    expect(addToast).toHaveBeenCalledWith(
      'Scores could not be published for 1 assignment.',
      'error'
    );
  });

  it('does not count a target that reported its own skip', async () => {
    const addToast = vi.fn();
    await runBulkPublish({
      targets: [{ id: 'a' }, { id: 'b' }],
      unpublish: false,
      publishOne: (t) => Promise.resolve(t.id === 'a'),
      addToast,
      logKey: 'test',
    });
    expect(addToast).toHaveBeenCalledTimes(1);
    expect(addToast).toHaveBeenCalledWith(
      'Scores published for 1 assignment.',
      'success'
    );
  });

  it('shows a repeated per-target note once', async () => {
    const addToast = vi.fn();
    await runBulkPublish({
      targets: [{ id: 'a' }, { id: 'b' }],
      unpublish: false,
      publishOne: (_t, _token, toast) => {
        toast('Classroom skipped.', 'info');
        return Promise.resolve(true);
      },
      addToast,
      logKey: 'test',
    });
    expect(
      addToast.mock.calls.filter((c) => c[0] === 'Classroom skipped.')
    ).toHaveLength(1);
  });

  it('skips the token when unpublishing', async () => {
    const addToast = vi.fn();
    const mintToken = vi.fn(() => Promise.resolve('tok'));
    await runBulkPublish({
      targets: [{ id: 'a' }],
      unpublish: true,
      mintToken,
      publishOne: () => Promise.resolve(true),
      addToast,
      logKey: 'test',
    });
    expect(mintToken).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith(
      'Scores unpublished for 1 assignment.',
      'success'
    );
  });
});

describe('sharedVisibility', () => {
  it('returns the level only when every target shares it', () => {
    expect(
      sharedVisibility([{ scoreVisibility: 'a' }, { scoreVisibility: 'a' }])
    ).toBe('a');
    expect(
      sharedVisibility([{ scoreVisibility: 'a' }, { scoreVisibility: 'b' }])
    ).toBeUndefined();
  });
});
