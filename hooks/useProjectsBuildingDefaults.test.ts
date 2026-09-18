import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAuth } from '@/context/useAuth';
import { useProjectsBuildingDefaults } from './useProjectsBuildingDefaults';

vi.mock('@/context/useAuth');

const mockAuth = (value: unknown) =>
  (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue(value);

describe('useProjectsBuildingDefaults', () => {
  it('reads the selected building’s entry, legacy key and all', () => {
    mockAuth({
      featurePermissions: [
        {
          widgetType: 'projects',
          config: {
            buildingDefaults: {
              'orono-high-school': {
                buildingId: 'high',
                defaultShowStatusToStudents: false,
              },
            },
          },
        },
      ],
    });
    const { result } = renderHook(() => useProjectsBuildingDefaults('high'));
    expect(result.current.defaultShowStatusToStudents).toBe(false);
  });

  it('returns an empty entry with no building or no configured default', () => {
    mockAuth({ featurePermissions: [] });
    expect(
      renderHook(() => useProjectsBuildingDefaults(undefined)).result.current
        .defaultShowStatusToStudents
    ).toBeUndefined();
    expect(
      renderHook(() => useProjectsBuildingDefaults('high')).result.current
        .defaultShowStatusToStudents
    ).toBeUndefined();
  });
});
