import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';
import { WidgetBuildingOverrideContext } from '@/context/WidgetBuildingContextValue';
import type { WidgetData } from '@/types';

const selectedBuildings = vi.fn<() => string[]>(() => []);

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ selectedBuildings: selectedBuildings() }),
}));

import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';

const widget = (buildingId?: string) =>
  ({
    id: 'w1',
    type: 'schedule',
    ...(buildingId && { buildingId }),
  }) as WidgetData;

function inOverride(building: string | null) {
  function Override({ children }: { children: React.ReactNode }) {
    return (
      <WidgetBuildingOverrideContext.Provider value={building}>
        {children}
      </WidgetBuildingOverrideContext.Provider>
    );
  }
  return Override;
}

describe('useWidgetBuildingId', () => {
  it('keeps the widget’s building when the viewer is in it', () => {
    selectedBuildings.mockReturnValue(['high', 'middle']);
    const { result } = renderHook(() => useWidgetBuildingId(widget('middle')));
    expect(result.current).toBe('middle');
  });

  it('falls back to the viewer’s first building otherwise', () => {
    selectedBuildings.mockReturnValue(['high']);
    const { result } = renderHook(() => useWidgetBuildingId(widget('middle')));
    expect(result.current).toBe('high');
  });

  // A sub belongs to none of the teacher's buildings, so their own list would
  // point a schedule or soundboard at the wrong school — or at nothing.
  it('takes the shared board’s building inside an override', () => {
    selectedBuildings.mockReturnValue([]);
    const { result } = renderHook(() => useWidgetBuildingId(widget()), {
      wrapper: inOverride('schumann-elementary'),
    });
    expect(result.current).toBe('schumann');
  });

  it('still honours a widget’s own building inside an override', () => {
    selectedBuildings.mockReturnValue([]);
    const { result } = renderHook(
      () => useWidgetBuildingId(widget('orono-middle-school')),
      { wrapper: inOverride('high') }
    );
    expect(result.current).toBe('middle');
  });

  // An empty override must not shadow the ordinary path.
  it('ignores an override of null', () => {
    selectedBuildings.mockReturnValue(['high']);
    const { result } = renderHook(() => useWidgetBuildingId(widget()), {
      wrapper: inOverride(null),
    });
    expect(result.current).toBe('high');
  });
});
