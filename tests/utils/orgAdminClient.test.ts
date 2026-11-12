import { beforeEach, describe, expect, it, vi } from 'vitest';

const callable = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: () => callable,
}));
vi.mock('@/config/firebase', () => ({ functions: {} }));

import { callOrgAdmin, orgAdminErrorMessage } from '@/utils/orgAdminClient';

describe('orgAdminErrorMessage', () => {
  it('maps server reasons to the old Firestore wording', () => {
    expect(orgAdminErrorMessage({ details: { reason: 'notAllowed' } })).toBe(
      'Missing or insufficient permissions.'
    );
    expect(orgAdminErrorMessage({ details: { reason: 'other' } })).toBeNull();
    expect(orgAdminErrorMessage(new Error('x'))).toBeNull();
  });
});

describe('callOrgAdmin', () => {
  beforeEach(() => {
    callable.mockReset();
  });

  it('rethrows a refusal with the mapped message and code', async () => {
    callable.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('notAllowed'), {
          code: 'functions/permission-denied',
          details: { reason: 'notAllowed' },
        })
      )
    );
    const err: unknown = await callOrgAdmin({
      action: 'removeDomain',
      orgId: 'o',
      id: 'd',
    }).catch((e: unknown) => e);
    expect((err as Error).message).toBe('Missing or insufficient permissions.');
    expect((err as { code?: unknown }).code).toBe(
      'functions/permission-denied'
    );
  });

  it('sends calls one at a time, in order, even after a failure', async () => {
    const order: string[] = [];
    let release: () => void = () => undefined;
    callable
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = () => {
              order.push('first');
              resolve();
            };
          })
      )
      .mockImplementationOnce(() => {
        order.push('second');
        return Promise.reject(new Error('boom'));
      })
      .mockImplementationOnce(() => {
        order.push('third');
        return Promise.resolve({ data: { changed: 1 } });
      });
    const patch = (name: string) =>
      callOrgAdmin({ action: 'updateOrg', orgId: 'o', patch: { name } });
    const a = patch('a');
    const b = patch('ab');
    const c = patch('abc');
    await vi.waitFor(() => expect(callable).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(callable).toHaveBeenCalledTimes(1);
    release();
    await a;
    await expect(b).rejects.toThrow('boom');
    await c;
    expect(order).toEqual(['first', 'second', 'third']);
    expect(
      callable.mock.calls.map(
        (x: unknown[]) => (x[0] as { patch: { name: string } }).patch.name
      )
    ).toEqual(['a', 'ab', 'abc']);
  });
});
