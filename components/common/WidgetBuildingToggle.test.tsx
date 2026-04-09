import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { WidgetBuildingToggle } from './WidgetBuildingToggle';
import { AuthContext, AuthContextType } from '@/context/AuthContextValue';
import { WidgetData } from '@/types';

const makeWidget = (overrides: Partial<WidgetData> = {}): WidgetData =>
  ({
    id: 'w1',
    type: 'schedule',
    x: 0,
    y: 0,
    w: 300,
    h: 200,
    z: 1,
    flipped: false,
    config: {},
    ...overrides,
  }) as WidgetData;

const mockUpdateWidget = vi.fn();

/** Minimal AuthContext value with only the fields the toggle reads. */
const makeAuth = (selectedBuildings: string[]): AuthContextType =>
  ({
    selectedBuildings,
  }) as unknown as AuthContextType;

const renderToggle = (
  selectedBuildings: string[],
  widget: WidgetData = makeWidget()
) =>
  render(
    <AuthContext.Provider value={makeAuth(selectedBuildings)}>
      <WidgetBuildingToggle widget={widget} updateWidget={mockUpdateWidget} />
    </AuthContext.Provider>
  );

describe('WidgetBuildingToggle', () => {
  beforeEach(() => {
    mockUpdateWidget.mockClear();
  });

  it('returns null when user has fewer than 2 buildings', () => {
    const { container } = renderToggle(['schumann-elementary']);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when selectedBuildings is empty', () => {
    const { container } = renderToggle([]);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when no AuthProvider is present', () => {
    const { container } = render(
      <WidgetBuildingToggle
        widget={makeWidget()}
        updateWidget={mockUpdateWidget}
      />
    );
    expect(container.innerHTML).toBe('');
  });

  it('returns null when selectedBuildings contains unknown IDs', () => {
    const { container } = renderToggle(['unknown-a', 'unknown-b']);
    expect(container.innerHTML).toBe('');
  });

  it('renders grade labels when user has 2+ valid buildings', () => {
    renderToggle(['schumann-elementary', 'orono-intermediate-school']);

    expect(screen.getByText('K-2')).toBeTruthy();
    expect(screen.getByText('3-5')).toBeTruthy();
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('marks the effective building as checked', () => {
    renderToggle(
      ['schumann-elementary', 'orono-intermediate-school'],
      makeWidget({ buildingId: 'orono-intermediate-school' })
    );

    const radios = screen.getAllByRole('radio');
    const k2 = radios.find((r) => r.textContent?.includes('K-2'));
    const three5 = radios.find((r) => r.textContent?.includes('3-5'));

    expect(k2?.getAttribute('aria-checked')).toBe('false');
    expect(three5?.getAttribute('aria-checked')).toBe('true');
  });

  it('calls updateWidget with the selected buildingId on click', () => {
    renderToggle(['schumann-elementary', 'orono-intermediate-school']);

    const btn = screen.getByText('3-5').closest('button');
    expect(btn).toBeTruthy();
    fireEvent.click(btn as HTMLElement);

    expect(mockUpdateWidget).toHaveBeenCalledWith('w1', {
      buildingId: 'orono-intermediate-school',
    });
  });

  it('does not call updateWidget when clicking the already-active building', () => {
    renderToggle(['schumann-elementary', 'orono-intermediate-school']);

    // First building is active by default (fallback)
    const btn = screen.getByText('K-2').closest('button');
    fireEvent.click(btn as HTMLElement);

    expect(mockUpdateWidget).not.toHaveBeenCalled();
  });

  it('falls back to userBuildings[0] when widget.buildingId is invalid', () => {
    renderToggle(
      ['schumann-elementary', 'orono-intermediate-school'],
      makeWidget({ buildingId: 'orono-high-school' })
    );

    const radios = screen.getAllByRole('radio');
    const k2 = radios.find((r) => r.textContent?.includes('K-2'));
    expect(k2?.getAttribute('aria-checked')).toBe('true');
  });

  it('includes grade label and building name in aria-label', () => {
    renderToggle(['schumann-elementary', 'orono-intermediate-school']);

    expect(screen.getByLabelText('K-2 – Schumann Elementary')).toBeTruthy();
    expect(screen.getByLabelText('3-5 – Orono Intermediate')).toBeTruthy();
  });
});
