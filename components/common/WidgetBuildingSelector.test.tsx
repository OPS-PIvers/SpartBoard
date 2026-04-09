import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WidgetBuildingSelector } from './WidgetBuildingSelector';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData } from '@/types';

vi.mock('@/context/useAuth');
vi.mock('@/context/useDashboard');

vi.mock('lucide-react', () => ({
  Building2: () => <span data-testid="building-icon" />,
}));

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

describe('WidgetBuildingSelector', () => {
  beforeEach(() => {
    mockUpdateWidget.mockClear();
    (useDashboard as unknown as Mock).mockReturnValue({
      updateWidget: mockUpdateWidget,
    });
  });

  it('returns null when user has fewer than 2 buildings', () => {
    (useAuth as unknown as Mock).mockReturnValue({
      selectedBuildings: ['schumann-elementary'],
    });

    const { container } = render(
      <WidgetBuildingSelector widget={makeWidget()} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('returns null when selectedBuildings is empty', () => {
    (useAuth as unknown as Mock).mockReturnValue({
      selectedBuildings: [],
    });

    const { container } = render(
      <WidgetBuildingSelector widget={makeWidget()} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders building options when user has 2+ buildings', () => {
    (useAuth as unknown as Mock).mockReturnValue({
      selectedBuildings: ['schumann-elementary', 'orono-intermediate-school'],
    });

    render(<WidgetBuildingSelector widget={makeWidget()} />);

    expect(screen.getByText('Schumann Elementary')).toBeTruthy();
    expect(screen.getByText('Orono Intermediate')).toBeTruthy();
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('marks the effective building as checked', () => {
    (useAuth as unknown as Mock).mockReturnValue({
      selectedBuildings: ['schumann-elementary', 'orono-intermediate-school'],
    });

    render(
      <WidgetBuildingSelector
        widget={makeWidget({ buildingId: 'orono-intermediate-school' })}
      />
    );

    const radios = screen.getAllByRole('radio');
    const schumann = radios.find((r) =>
      r.textContent?.includes('Schumann Elementary')
    );
    const orono = radios.find((r) =>
      r.textContent?.includes('Orono Intermediate')
    );

    expect(schumann?.getAttribute('aria-checked')).toBe('false');
    expect(orono?.getAttribute('aria-checked')).toBe('true');
  });

  it('calls updateWidget with the selected buildingId on click', () => {
    (useAuth as unknown as Mock).mockReturnValue({
      selectedBuildings: ['schumann-elementary', 'orono-intermediate-school'],
    });

    render(<WidgetBuildingSelector widget={makeWidget()} />);

    const oronoText = screen.getByText('Orono Intermediate');
    const oronoButton = oronoText.closest('button');
    expect(oronoButton).toBeTruthy();
    fireEvent.click(oronoButton as HTMLElement);

    expect(mockUpdateWidget).toHaveBeenCalledWith('w1', {
      buildingId: 'orono-intermediate-school',
    });
  });

  it('falls back to selectedBuildings[0] when widget.buildingId is no longer valid', () => {
    (useAuth as unknown as Mock).mockReturnValue({
      selectedBuildings: ['schumann-elementary', 'orono-intermediate-school'],
    });

    // Widget has a buildingId that's not in the user's selection
    render(
      <WidgetBuildingSelector
        widget={makeWidget({ buildingId: 'orono-high-school' })}
      />
    );

    const radios = screen.getAllByRole('radio');
    const schumann = radios.find((r) =>
      r.textContent?.includes('Schumann Elementary')
    );
    // Falls back to first selected building
    expect(schumann?.getAttribute('aria-checked')).toBe('true');
  });
});
