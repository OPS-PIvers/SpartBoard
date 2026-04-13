import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { useState, useCallback } from 'react';
import { useNutrislice } from './useNutrislice';
import { LunchCountConfig, WidgetData } from '@/types';

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
  getFunctions: vi.fn(),
}));
import { httpsCallable } from 'firebase/functions';

describe('useNutrislice', () => {
  const mockUpdateWidget = vi.fn((id: string, updates: Partial<WidgetData>) => {
    return { id, updates };
  });
  const mockAddToast = vi.fn(
    (message: string, type?: 'info' | 'success' | 'error') => {
      return { message, type };
    }
  );
  const mockWidgetId = 'test-widget-id';
  const mockConfig: LunchCountConfig = {
    schoolSite: 'schumann-elementary',
    isManualMode: false,
    cachedMenu: undefined,
    lastSyncDate: undefined,
    syncError: null,
    manualHotLunch: '',
    manualBentoBox: '',
    roster: [],
    assignments: {},
  };

  const mockMenuData = {
    days: [
      {
        date: '2023-10-27',
        menu_items: [
          {
            section_name: 'Entrees',
            food: { name: 'Cheese Pizza' },
            text: 'Cheese Pizza',
          },
          {
            section_name: 'Sides',
            food: { name: 'Veggie Bento Box' },
            text: 'Veggie Bento Box',
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2023-10-27T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const TestComponent = ({
    initialConfig = mockConfig,
  }: {
    initialConfig?: LunchCountConfig;
  }) => {
    const [config, setConfig] = useState(initialConfig);
    const updateWidget = useCallback(
      (id: string, updates: Partial<WidgetData>) => {
        mockUpdateWidget(id, updates);
        if (updates.config) {
          setConfig((prev) => ({
            ...prev,
            ...(updates.config as unknown as Partial<LunchCountConfig>),
          }));
        }
      },
      []
    );

    useNutrislice({
      widgetId: mockWidgetId,
      config,
      updateWidget,
      addToast: mockAddToast,
    });
    return null;
  };

  it('should sync menu when data is missing or outdated', async () => {
    const mockProxy = vi.fn().mockResolvedValue({ data: mockMenuData });
    (httpsCallable as Mock).mockReturnValue(mockProxy);

    render(<TestComponent />);

    await waitFor(() => {
      expect(mockProxy).toHaveBeenCalledTimes(1);
    });

    const lastCall = mockProxy.mock.calls[0][0] as { url: string };
    const fetchUrl = lastCall.url;
    expect(fetchUrl).toContain('schumann-elementary');
    expect(fetchUrl).toContain('2023');
    expect(fetchUrl).toContain('10');
    expect(fetchUrl).toContain('27');

    await waitFor(() => {
      expect(mockUpdateWidget).toHaveBeenCalledWith(
        mockWidgetId,
        expect.objectContaining({
          config: expect.objectContaining({
            cachedMenu: {
              hotLunch: 'Cheese Pizza',
              bentoBox: 'Veggie Bento Box',
              date: expect.any(String) as string,
            },
            syncError: null,
          }) as unknown,
        })
      );
    });

    expect(mockAddToast).toHaveBeenCalledWith(
      'Menu synced from Nutrislice',
      'success'
    );
  });

  it('should handle proxy failure', async () => {
    const mockProxy = vi.fn().mockRejectedValue(new Error('Fail'));
    (httpsCallable as Mock).mockReturnValue(mockProxy);

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    render(<TestComponent />);

    await waitFor(() => {
      expect(mockProxy).toHaveBeenCalledTimes(1);
    });

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      mockWidgetId,
      expect.objectContaining({
        config: expect.objectContaining({
          syncError: 'E-SYNC-404',
          lastSyncDate: expect.any(String) as string,
        }) as unknown,
      })
    );

    expect(mockAddToast).toHaveBeenCalledWith('Failed to sync menu', 'error');

    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('should not sync if data is up-to-date', async () => {
    const freshConfig: LunchCountConfig = {
      ...mockConfig,
      lastSyncDate: new Date().toISOString(),
      cachedMenu: {
        hotLunch: 'Old Lunch',
        bentoBox: 'Old Bento',
        date: new Date().toISOString(),
      },
    };

    const mockProxy = vi.fn().mockResolvedValue({ data: mockMenuData });
    (httpsCallable as Mock).mockReturnValue(mockProxy);

    render(<TestComponent initialConfig={freshConfig} />);

    await vi.advanceTimersByTimeAsync(100);

    expect(mockProxy).not.toHaveBeenCalled();
  });

  it('should parse Bento Box correctly', async () => {
    const bentoData = {
      days: [
        {
          date: '2023-10-27',
          menu_items: [
            {
              section_name: 'Entrees',
              food: { name: 'Chicken Nuggets' },
            },
            {
              section_name: 'Special',
              food: { name: 'Teriyaki Bento' },
            },
          ],
        },
      ],
    };

    const mockProxy = vi.fn().mockResolvedValue({ data: bentoData });
    (httpsCallable as Mock).mockReturnValue(mockProxy);

    render(<TestComponent />);

    await waitFor(() => {
      expect(mockUpdateWidget).toHaveBeenCalledWith(
        mockWidgetId,
        expect.objectContaining({
          config: expect.objectContaining({
            cachedMenu: {
              hotLunch: 'Chicken Nuggets',
              bentoBox: 'Teriyaki Bento',
              date: expect.any(String) as string,
            },
          }) as unknown,
        })
      );
    });
  });
});
