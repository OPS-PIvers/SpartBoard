import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { useState, useCallback } from 'react';
import { useNutrislice } from './useNutrislice';
import { LunchCountConfig, WidgetData } from '@/types';

describe('useNutrislice', () => {
  const mockUpdateWidget = vi.fn((id: string, updates: Partial<WidgetData>) => {
    // Mock implementation
    return { id, updates };
  });
  const mockAddToast = vi.fn(
    (message: string, type?: 'info' | 'success' | 'error') => {
      // Mock implementation
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
    global.fetch = vi.fn();
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
    (global.fetch as Mock).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return {
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockMenuData)),
      };
    });

    render(<TestComponent />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    const fetchUrl = (global.fetch as Mock).mock.calls[0][0] as string;
    expect(fetchUrl).toContain('schumann-elementary');
    // URL is encoded, so we check for encoded date parts or just verify logic
    expect(fetchUrl).toContain('2023');
    expect(fetchUrl).toContain('10');
    expect(fetchUrl).toContain('27');

    await waitFor(() => {
      expect(mockUpdateWidget).toHaveBeenCalledWith(
        mockWidgetId,
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          config: expect.objectContaining({
            cachedMenu: {
              hotLunch: 'Cheese Pizza',
              bentoBox: 'Veggie Bento Box',
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              date: expect.any(String),
            },
            syncError: null,
          }),
        })
      );
    });

    expect(mockAddToast).toHaveBeenCalledWith(
      'Menu synced from Nutrislice',
      'success'
    );
  });

  it('should try fallback proxies if first one fails', async () => {
    // First proxy fails, then success
    let callCount = 0;
    (global.fetch as Mock).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      callCount++;
      if (callCount === 1) {
        throw new Error('Network Error');
      }
      return {
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockMenuData)),
      };
    });

    render(<TestComponent />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(mockUpdateWidget).toHaveBeenCalledWith(
        mockWidgetId,
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          config: expect.objectContaining({
            cachedMenu: {
              hotLunch: 'Cheese Pizza',
              bentoBox: 'Veggie Bento Box',
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              date: expect.any(String),
            },
          }),
        })
      );
    });
  });

  it('should handle all proxies failing', async () => {
    // All proxies fail
    (global.fetch as Mock).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      throw new Error('Fail');
    });

    // Mock console.error to suppress expected error output
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    render(<TestComponent />);

    await waitFor(() => {
      // Should try 3 proxies and then stop because syncError is set
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      mockWidgetId,
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        config: expect.objectContaining({
          syncError: 'E-SYNC-404',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          lastSyncDate: expect.any(String),
        }),
      })
    );

    expect(mockAddToast).toHaveBeenCalledWith('Failed to sync menu', 'error');

    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('should not sync if data is up-to-date', async () => {
    const freshConfig: LunchCountConfig = {
      ...mockConfig,
      lastSyncDate: new Date().toISOString(), // Same as mocked system time
      cachedMenu: {
        hotLunch: 'Old Lunch',
        bentoBox: 'Old Bento',
        date: new Date().toISOString(),
      },
    };

    render(<TestComponent initialConfig={freshConfig} />);

    // Advance fake timers a bit to ensure no async calls happen
    await vi.advanceTimersByTimeAsync(100);

    expect(global.fetch).not.toHaveBeenCalled();
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
              food: { name: 'Teriyaki Bento' }, // Should be picked up
            },
          ],
        },
      ],
    };

    (global.fetch as Mock).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return {
        ok: true,
        text: () => Promise.resolve(JSON.stringify(bentoData)),
      };
    });

    render(<TestComponent />);

    await waitFor(() => {
      expect(mockUpdateWidget).toHaveBeenCalledWith(
        mockWidgetId,
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          config: expect.objectContaining({
            cachedMenu: {
              hotLunch: 'Chicken Nuggets',
              bentoBox: 'Teriyaki Bento',
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              date: expect.any(String),
            },
          }),
        })
      );
    });
  });
});
