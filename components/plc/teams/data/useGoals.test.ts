import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Plc } from '@/types';
import { useGoals } from './useDataOverview';

const granted = new Set<string>();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature: (id: string) => granted.has(id) }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/usePlcGoals', () => ({ usePlcGoals: () => ({ goals: [] }) }));
vi.mock('@/hooks/usePlcGoalCoach', () => ({
  usePlcGoalCoach: () => ({ check: vi.fn() }),
}));
vi.mock('@/components/plc/goals/routineOptions', () => ({
  routineFor: () => undefined,
  useGoalRoutineOptions: () => [],
}));

describe('useGoals coach gate', () => {
  it('hides the coach when Gemini functions are closed to the teacher', () => {
    granted.clear();
    granted.add('plc-goal-coach');
    const { result } = renderHook(() => useGoals({ id: 'p1' } as Plc));
    expect(result.current.coach).toBeUndefined();
  });

  it('shows the coach when both gates pass', () => {
    granted.clear();
    granted.add('plc-goal-coach').add('gemini-functions');
    const { result } = renderHook(() => useGoals({ id: 'p1' } as Plc));
    expect(result.current.coach).toBeDefined();
  });
});
