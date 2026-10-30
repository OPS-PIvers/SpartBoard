import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const bell = vi.hoisted(() => ({
  options: [] as { buildingId: string; id: string; label: string }[],
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ selectedBuildings: ['oms'], featurePermissions: [] }),
}));
vi.mock('@/hooks/useAdminBuildings', () => ({ useAdminBuildings: () => [] }));
vi.mock('@/utils/bellSchedule', () => ({
  listTeacherBellPeriods: () => bell.options,
  readBuildingScheduleDefaults: () => undefined,
  resolveBellWindow: () => null,
}));

import { useAssignPeriodAccess } from './useTeacherBellPeriods';

const updateRoster = () => Promise.resolve();

describe('useAssignPeriodAccess', () => {
  it('offers no per-period context when the buildings list no class periods', () => {
    bell.options = [];
    const { result } = renderHook(() => useAssignPeriodAccess(updateRoster));
    expect(result.current).toBeUndefined();
  });

  it('offers the context once a building lists class periods', () => {
    bell.options = [{ buildingId: 'oms', id: 'p1', label: 'Period 1' }];
    const { result } = renderHook(() => useAssignPeriodAccess(updateRoster));
    expect(result.current?.bellOptions).toHaveLength(1);
    expect(typeof result.current?.bellWindow).toBe('function');
  });
});
