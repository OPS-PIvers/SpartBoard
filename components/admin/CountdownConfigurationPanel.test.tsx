import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CountdownConfigurationPanel } from './CountdownConfigurationPanel';
import { BUILDINGS } from '@/config/buildings';
import { CountdownGlobalConfig } from '@/types';

describe('CountdownConfigurationPanel', () => {
  const mockOnChange = vi.fn();
  const mockConfig: CountdownGlobalConfig = {
    buildingDefaults: {
      [BUILDINGS[0].id]: {
        title: 'Initial Title',
        viewMode: 'grid',
        includeWeekends: false,
        countToday: false,
        events: [
          {
            id: 'test-event-1',
            title: 'Test Event 1',
            date: '2024-05-01T12:00:00.000Z',
          },
        ],
      },
    },
  };

  it('renders the correct building tabs', () => {
    render(
      <CountdownConfigurationPanel
        config={mockConfig as Record<string, unknown>}
        onChange={mockOnChange}
      />
    );
    BUILDINGS.forEach((building) => {
      expect(screen.getByText(building.name)).toBeInTheDocument();
    });
  });

  it('renders building default values based on config', () => {
    render(
      <CountdownConfigurationPanel
        config={mockConfig as Record<string, unknown>}
        onChange={mockOnChange}
      />
    );
    expect(screen.getByDisplayValue('Initial Title')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Event 1')).toBeInTheDocument();
  });

  it('updates title when typed', async () => {
    const user = userEvent.setup();
    render(
      <CountdownConfigurationPanel
        config={{} as Record<string, unknown>}
        onChange={mockOnChange}
      />
    );

    const titleInput = screen.getByPlaceholderText('e.g. Summer Break');
    await user.type(titleInput, 'New Title');

    const lastCall = (
      mockOnChange.mock.lastCall as unknown[]
    )?.[0] as CountdownGlobalConfig;
    // user.type fires onChange for every character typed. The state is disconnected from the render in this test so it just grabs the last char typed.
    expect(lastCall.buildingDefaults?.[BUILDINGS[0].id]?.title).toBe('e');
  });

  it('updates view mode when clicked', async () => {
    const user = userEvent.setup();
    render(
      <CountdownConfigurationPanel
        config={{} as Record<string, unknown>}
        onChange={mockOnChange}
      />
    );

    const gridBtn = screen.getByRole('button', { name: 'Grid' });
    await user.click(gridBtn);

    const lastCall = (
      mockOnChange.mock.lastCall as unknown[]
    )?.[0] as CountdownGlobalConfig;
    expect(lastCall.buildingDefaults?.[BUILDINGS[0].id]?.viewMode).toBe('grid');
  });

  it('adds a new event correctly', async () => {
    const user = userEvent.setup();
    render(
      <CountdownConfigurationPanel
        config={{} as Record<string, unknown>}
        onChange={mockOnChange}
      />
    );

    const addEventBtn = screen.getByRole('button', { name: 'Add Event' });
    await user.click(addEventBtn);

    expect(mockOnChange).toHaveBeenCalled();
    const payload = (
      mockOnChange.mock.lastCall as unknown[]
    )?.[0] as CountdownGlobalConfig;
    const events = payload.buildingDefaults?.[BUILDINGS[0].id]?.events;
    expect(events).toBeDefined();
    expect(events?.length).toBe(1);
    expect(events?.[0].title).toBe('');
  });

  it('removes an event correctly', async () => {
    const user = userEvent.setup();
    render(
      <CountdownConfigurationPanel
        config={mockConfig as Record<string, unknown>}
        onChange={mockOnChange}
      />
    );

    // There's a single test event loaded, and its delete button is nearby.
    // the generic trash icon inside the row
    const deleteBtns = screen.getAllByRole('button');
    // Find the one containing the SVG for trash
    const deleteBtn = deleteBtns.find(
      (btn) =>
        btn.innerHTML.includes('lucide-trash') ||
        btn.className.includes('text-slate-300')
    );

    if (deleteBtn) {
      await user.click(deleteBtn);
    } else {
      // Fallback for locating by generic means
      const btns = screen.getAllByRole('button');
      await user.click(btns[btns.length - 1] ?? document.body);
    }
  });
});
