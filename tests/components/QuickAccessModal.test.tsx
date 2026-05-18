import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TOOLS } from '@/config/tools';

const noop = vi.fn();
const updateDashboardSettings = vi.fn();
const addToast = vi.fn();
let mockQuickAccessWidgets: string[] = [];

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: {
      id: 'd1',
      settings: { quickAccessWidgets: mockQuickAccessWidgets },
    },
    updateDashboardSettings,
    addToast,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? _k,
  }),
}));

import { QuickAccessModal } from '@/components/quickAccessModal/QuickAccessModal';

describe('QuickAccessModal', () => {
  beforeEach(() => {
    updateDashboardSettings.mockClear();
    mockQuickAccessWidgets = [];
  });

  afterEach(() => {
    mockQuickAccessWidgets = [];
  });

  it('renders title and slot counter', () => {
    render(<QuickAccessModal isOpen={true} onClose={noop} />);
    expect(screen.getByText('Quick Access Widgets')).toBeInTheDocument();
    expect(screen.getByText('0/2')).toBeInTheDocument();
  });

  it('search filters widget tiles', async () => {
    render(<QuickAccessModal isOpen={true} onClose={noop} />);
    const input = screen.getByPlaceholderText('Search widgets…');
    await userEvent.type(input, 'this-will-not-match-any-widget-label');
    expect(screen.getByText('No widgets match.')).toBeInTheDocument();
  });

  it('clicking an unselected tile calls updateDashboardSettings with the type added', async () => {
    render(<QuickAccessModal isOpen={true} onClose={noop} />);
    // Click the first widget tile by finding all buttons and selecting the first widget-like button
    const firstTool = TOOLS[0];
    const buttons = screen.getAllByRole('button');
    const firstTile = buttons.find((btn) =>
      btn.textContent?.includes(firstTool.label)
    );
    if (!firstTile) throw new Error(`Tile for ${firstTool.label} not found`);
    await userEvent.click(firstTile);
    expect(updateDashboardSettings).toHaveBeenCalledWith({
      quickAccessWidgets: [firstTool.type],
    });
  });

  it('clicking a selected tile deselects it', async () => {
    const firstTool = TOOLS[0];
    mockQuickAccessWidgets = [firstTool.type];
    render(<QuickAccessModal isOpen={true} onClose={noop} />);
    const buttons = screen.getAllByRole('button');
    const selectedTile = buttons.find((btn) =>
      btn.textContent?.includes(firstTool.label)
    );
    if (!selectedTile) throw new Error(`Tile for ${firstTool.label} not found`);
    await userEvent.click(selectedTile);
    expect(updateDashboardSettings).toHaveBeenCalledWith({
      quickAccessWidgets: [],
    });
  });

  it('when 2 are selected, an unselected tile is disabled and does not call updateDashboardSettings', async () => {
    const type1 = TOOLS[0].type;
    const type2 = TOOLS[1].type;
    mockQuickAccessWidgets = [type1, type2];
    render(<QuickAccessModal isOpen={true} onClose={noop} />);
    expect(screen.getByText('2/2')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    const unselectedTile = buttons.find((btn) =>
      btn.textContent?.includes(TOOLS[2].label)
    );
    if (!unselectedTile)
      throw new Error(`Tile for ${TOOLS[2].label} not found`);
    expect(unselectedTile).toHaveAttribute('disabled');
    await userEvent.click(unselectedTile);
    expect(updateDashboardSettings).not.toHaveBeenCalled();
  });
});
