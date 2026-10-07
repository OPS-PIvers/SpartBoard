import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Plc } from '@/types';
import { useMeetingStrip } from './useDataOverview';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1' } }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/usePlcNotes', () => ({
  usePlcNotes: () => ({
    notes: [
      {
        actionItems: [
          { done: false, assigneeUid: 'u1' },
          { done: true, assigneeUid: 'u1' },
        ],
      },
    ],
  }),
}));
vi.mock('@/hooks/usePlcDocs', () => ({
  usePlcDocs: () => ({
    docs: [
      {
        actionItems: [
          { done: false, assigneeUid: 'u2' },
          { done: false, assigneeUid: 'u1' },
        ],
      },
      { deletedAt: 5, actionItems: [{ done: false, assigneeUid: 'u1' }] },
    ],
  }),
}));

describe('useMeetingStrip', () => {
  it('counts open items on notes and linked docs', () => {
    const { result } = renderHook(() => useMeetingStrip({ id: 'p1' } as Plc));
    expect(result.current.openItems).toEqual({ total: 3, mine: 2 });
  });
});
