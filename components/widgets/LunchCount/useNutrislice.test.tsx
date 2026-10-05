import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { useState, useCallback } from 'react';
import { useNutrislice } from './useNutrislice';
import { LunchCountConfig, WidgetData } from '@/types';

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...path: string[]) => path.join('/')),
  getDoc: vi.fn(),
}));
import { doc, getDoc } from 'firebase/firestore';

interface WeekFixture {
  days: { date: string; menu_items?: unknown[] }[];
}

// Stores a Nutrislice week the way scripts/sync-lunch-menus.mjs writes it: items keyed by date.
const mockStoredMenu = (week: WeekFixture | null) => {
  (getDoc as Mock).mockResolvedValue({
    exists: () => week !== null,
    data: () => ({
      days: Object.fromEntries(
        (week?.days ?? []).map((d) => [d.date, d.menu_items ?? []])
      ),
    }),
  });
  return getDoc as Mock;
};

const mockStoredMenuFailure = () => {
  (getDoc as Mock).mockRejectedValue(new Error('Fail'));
  return getDoc as Mock;
};

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
            is_section_title: true,
            section_name: 'Entrees',
          },
          {
            section_name: 'Entrees',
            food: { name: 'Cheese Pizza', image_url: 'https://cdn/pizza.jpg' },
          },
          {
            is_section_title: true,
            section_name: 'Sides',
          },
          {
            section_name: 'Sides',
            food: { name: 'Marinara', image_url: 'https://cdn/marinara.jpg' },
          },
          {
            section_name: 'Sides',
            food: { name: 'Steamed Peas' },
          },
          {
            is_section_title: true,
            section_name: 'PB Jammin Bento Box',
          },
          {
            section_name: 'PB Jammin Bento Box',
            food: {
              name: 'Veggie Bento Box',
              image_url: 'https://cdn/bento.jpg',
            },
          },
          {
            section_name: 'PB Jammin Bento Box',
            food: { name: 'Pretzel' },
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

  it('parses entree, sides, and bento with image URLs', async () => {
    const mockProxy = mockStoredMenu(mockMenuData);

    render(<TestComponent />);

    await waitFor(() => {
      expect(mockProxy).toHaveBeenCalledTimes(1);
    });

    expect(doc).toHaveBeenCalledWith({}, 'lunch_menus', 'schumann-elementary');

    await waitFor(() => {
      expect(mockUpdateWidget).toHaveBeenCalledWith(
        mockWidgetId,
        expect.objectContaining({
          config: expect.objectContaining({
            cachedMenu: {
              hotLunch: {
                name: 'Cheese Pizza',
                imageUrl: 'https://cdn/pizza.jpg',
              },
              hotLunchSides: [
                {
                  name: 'Marinara',
                  imageUrl: 'https://cdn/marinara.jpg',
                },
                {
                  name: 'Steamed Peas',
                  imageUrl: undefined,
                },
              ],
              bentoBox: {
                name: 'Veggie Bento Box',
                imageUrl: 'https://cdn/bento.jpg',
              },
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

  it('handles proxy failure', async () => {
    const mockProxy = mockStoredMenuFailure();

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

  it('does not sync when current-shape data is up-to-date', async () => {
    const freshConfig: LunchCountConfig = {
      ...mockConfig,
      lastSyncDate: new Date().toISOString(),
      cachedMenu: {
        hotLunch: { name: 'Old Lunch' },
        hotLunchSides: [],
        bentoBox: { name: 'Old Bento' },
        date: new Date().toISOString(),
      },
    };

    const mockProxy = mockStoredMenu(mockMenuData);

    render(<TestComponent initialConfig={freshConfig} />);

    await vi.advanceTimersByTimeAsync(100);

    expect(mockProxy).not.toHaveBeenCalled();
  });

  it('re-fetches when cached menu is in legacy string shape', async () => {
    // Simulate a config saved before this change: hotLunch/bentoBox are
    // strings instead of LunchMenuItem objects. Even though it was synced
    // today, the widget should detect the legacy shape and re-fetch so it
    // can populate sides + images.
    const legacyConfig = {
      ...mockConfig,
      lastSyncDate: new Date().toISOString(),
      cachedMenu: {
        hotLunch: 'Old Lunch',
        bentoBox: 'Old Bento',
        date: new Date().toISOString(),
      } as unknown as LunchCountConfig['cachedMenu'],
    };

    const mockProxy = mockStoredMenu(mockMenuData);

    render(<TestComponent initialConfig={legacyConfig} />);

    await waitFor(() => {
      expect(mockProxy).toHaveBeenCalledTimes(1);
    });
  });

  it('does not loop when fetch fails on a legacy-shape config', async () => {
    // P1 regression guard: a legacy cachedMenu plus a failing proxy used to
    // pin hasLegacyShape=true forever, since the catch block didn't replace
    // the menu. Each render would re-fire fetchNutrislice. Now the catch
    // installs a non-legacy stub so the migration check flips to false after
    // the first attempt.
    const legacyConfig = {
      ...mockConfig,
      cachedMenu: {
        hotLunch: 'Old Lunch',
        bentoBox: 'Old Bento',
        date: new Date().toISOString(),
      } as unknown as LunchCountConfig['cachedMenu'],
    };

    const mockProxy = mockStoredMenuFailure();

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    render(<TestComponent initialConfig={legacyConfig} />);

    await waitFor(() => {
      expect(mockProxy).toHaveBeenCalledTimes(1);
    });

    // Give React several ticks to re-render and re-evaluate the migration
    // effect. With the bug present, this would queue many more calls.
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockProxy).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('falls back to first food item when no Entrees/Main section exists', async () => {
    const noEntreeData = {
      days: [
        {
          date: '2023-10-27',
          menu_items: [
            { is_section_title: true, section_name: 'Specials' },
            {
              section_name: 'Specials',
              food: { name: 'Mystery Meat', image_url: 'https://cdn/mm.jpg' },
            },
            { section_name: 'Specials', food: { name: 'Mystery Sauce' } },
          ],
        },
      ],
    };

    mockStoredMenu(noEntreeData);

    render(<TestComponent />);

    await waitFor(() => {
      expect(mockUpdateWidget).toHaveBeenCalledWith(
        mockWidgetId,
        expect.objectContaining({
          config: expect.objectContaining({
            cachedMenu: expect.objectContaining({
              hotLunch: {
                name: 'Mystery Meat',
                imageUrl: 'https://cdn/mm.jpg',
              },
              hotLunchSides: [{ name: 'Mystery Sauce', imageUrl: undefined }],
            }) as unknown,
          }) as unknown,
        })
      );
    });
  });

  it('does not duplicate a bento-only item as the hot lunch entree', async () => {
    // No Entree/Main section anywhere; the only food item is the bento item.
    const bentoOnlyData = {
      days: [
        {
          date: '2023-10-27',
          menu_items: [
            { is_section_title: true, section_name: 'PB Jammin Bento Box' },
            {
              section_name: 'PB Jammin Bento Box',
              food: { name: 'Turkey Bento', image_url: 'https://cdn/t.jpg' },
            },
          ],
        },
      ],
    };

    mockStoredMenu(bentoOnlyData);

    render(<TestComponent />);

    await waitFor(() => {
      expect(mockUpdateWidget).toHaveBeenCalledWith(
        mockWidgetId,
        expect.objectContaining({
          config: expect.objectContaining({
            cachedMenu: expect.objectContaining({
              hotLunch: { name: 'No Hot Lunch Listed' },
              bentoBox: { name: 'Turkey Bento', imageUrl: 'https://cdn/t.jpg' },
            }) as unknown,
          }) as unknown,
        })
      );
    });
  });

  it('does not duplicate the item as hotLunch when a section name matches both the entree and alt-meal patterns (e.g. "Alt Entree")', async () => {
    // A section literally named "Alt Entree" satisfies both the entree
    // section check (contains "entree") and the alt-meal check (contains
    // "alt"), so the same index was picked as both entreeIndex and
    // bentoIndex before the section-match path also excluded bentoIndex.
    const altEntreeData = {
      days: [
        {
          date: '2023-10-27',
          menu_items: [
            { is_section_title: true, section_name: 'Alt Entree' },
            {
              section_name: 'Alt Entree',
              food: { name: 'Turkey Bento', image_url: 'https://cdn/t.jpg' },
            },
          ],
        },
      ],
    };

    mockStoredMenu(altEntreeData);

    render(<TestComponent />);

    await waitFor(() => {
      expect(mockUpdateWidget).toHaveBeenCalledWith(
        mockWidgetId,
        expect.objectContaining({
          config: expect.objectContaining({
            cachedMenu: expect.objectContaining({
              hotLunch: { name: 'No Hot Lunch Listed' },
              bentoBox: { name: 'Turkey Bento', imageUrl: 'https://cdn/t.jpg' },
            }) as unknown,
          }) as unknown,
        })
      );
    });
  });

  it('does not promote a second alt-meal item to hotLunch when the alt section holds more than one item', async () => {
    // The collision re-derivation skips bentoIndex, so with two items in the
    // alt section the second one would otherwise become the hot lunch.
    const twoItemAltSectionData = {
      days: [
        {
          date: '2023-10-27',
          menu_items: [
            { is_section_title: true, section_name: 'Alt Entree' },
            {
              section_name: 'Alt Entree',
              food: { name: 'Turkey Bento', image_url: 'https://cdn/t.jpg' },
            },
            {
              section_name: 'Alt Entree',
              food: { name: 'Veggie Bento', image_url: 'https://cdn/v.jpg' },
            },
          ],
        },
      ],
    };

    mockStoredMenu(twoItemAltSectionData);

    render(<TestComponent />);

    await waitFor(() => {
      expect(mockUpdateWidget).toHaveBeenCalledWith(
        mockWidgetId,
        expect.objectContaining({
          config: expect.objectContaining({
            cachedMenu: expect.objectContaining({
              hotLunch: { name: 'No Hot Lunch Listed' },
              hotLunchSides: [],
              bentoBox: { name: 'Turkey Bento', imageUrl: 'https://cdn/t.jpg' },
            }) as unknown,
          }) as unknown,
        })
      );
    });
  });

  it('does not duplicate the item as hotLunch when an entree-section item name itself matches the bento name pattern', async () => {
    // The only item that day sits in an "Entrees" section (so entreeIndex
    // is set via the section match) but its own name contains "bento", and
    // no alt-meal section title was ever observed, so bentoIndexByName also
    // resolves to the same index.
    const soleEntreeNamedBentoData = {
      days: [
        {
          date: '2023-10-27',
          menu_items: [
            {
              section_name: 'Entrees',
              food: { name: 'Chicken Bento', image_url: 'https://cdn/c.jpg' },
            },
          ],
        },
      ],
    };

    mockStoredMenu(soleEntreeNamedBentoData);

    render(<TestComponent />);

    await waitFor(() => {
      expect(mockUpdateWidget).toHaveBeenCalledWith(
        mockWidgetId,
        expect.objectContaining({
          config: expect.objectContaining({
            cachedMenu: expect.objectContaining({
              hotLunch: { name: 'No Hot Lunch Listed' },
              bentoBox: {
                name: 'Chicken Bento',
                imageUrl: 'https://cdn/c.jpg',
              },
            }) as unknown,
          }) as unknown,
        })
      );
    });
  });

  it('parses bento via name match across any section', async () => {
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

    mockStoredMenu(bentoData);

    render(<TestComponent />);

    await waitFor(() => {
      expect(mockUpdateWidget).toHaveBeenCalledWith(
        mockWidgetId,
        expect.objectContaining({
          config: expect.objectContaining({
            cachedMenu: {
              hotLunch: { name: 'Chicken Nuggets', imageUrl: undefined },
              hotLunchSides: [],
              bentoBox: { name: 'Teriyaki Bento', imageUrl: undefined },
              date: expect.any(String) as string,
            },
          }) as unknown,
        })
      );
    });
  });
  it.each([
    ['no menu doc exists for the site', null],
    [
      'the stored menu has no entry for today',
      {
        days: [
          { date: '2023-10-30', menu_items: mockMenuData.days[0].menu_items },
        ],
      },
    ],
  ])('shows an empty menu without an error when %s', async (_label, week) => {
    mockStoredMenu(week);

    render(<TestComponent />);

    await waitFor(() => {
      expect(mockUpdateWidget).toHaveBeenCalledWith(
        mockWidgetId,
        expect.objectContaining({
          config: expect.objectContaining({
            cachedMenu: expect.objectContaining({
              hotLunch: { name: 'No Hot Lunch Listed' },
              hotLunchSides: [],
            }) as unknown,
            syncError: null,
          }) as unknown,
        })
      );
    });
    expect(mockAddToast).not.toHaveBeenCalledWith(
      'Failed to sync menu',
      'error'
    );
  });
  it('retries once on load when an earlier sync today failed and left no menu', async () => {
    const getDocMock = mockStoredMenuFailure();
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    render(
      <TestComponent
        initialConfig={{
          ...mockConfig,
          cachedMenu: null,
          lastSyncDate: new Date().toISOString(),
          syncError: 'E-SYNC-404',
        }}
      />
    );

    await waitFor(() => {
      expect(getDocMock).toHaveBeenCalledTimes(1);
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(getDocMock).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });

  it('loads the stored menu on load after an earlier failed sync today', async () => {
    mockStoredMenu(mockMenuData);

    render(
      <TestComponent
        initialConfig={{
          ...mockConfig,
          cachedMenu: null,
          lastSyncDate: new Date().toISOString(),
          syncError: 'E-SYNC-404',
        }}
      />
    );

    await waitFor(() => {
      expect(mockUpdateWidget).toHaveBeenCalledWith(
        mockWidgetId,
        expect.objectContaining({
          config: expect.objectContaining({
            cachedMenu: expect.objectContaining({
              hotLunch: {
                name: 'Cheese Pizza',
                imageUrl: 'https://cdn/pizza.jpg',
              },
            }) as unknown,
            syncError: null,
          }) as unknown,
        })
      );
    });
  });
});
