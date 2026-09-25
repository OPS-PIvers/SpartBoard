import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { WidgetType } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { PartnerCard } from './PartnerCard';

vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/context/useDashboard', () => ({ useDashboard: vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      key === 'widgetSettings.common.partner.add'
        ? `Add ${String(options?.name)} widget`
        : key,
  }),
}));

const addWidget = vi.fn();

const auth = (denied: WidgetType[] = []) =>
  vi.mocked(useAuth).mockReturnValue({
    canAccessWidget: (type: WidgetType) => !denied.includes(type),
    featurePermissions: [
      { widgetType: 'time-tool', displayName: 'Class Timer' },
    ],
  } as unknown as ReturnType<typeof useAuth>);

const boardWith = (...types: WidgetType[]) =>
  vi.mocked(useDashboard).mockReturnValue({
    activeDashboard: { widgets: types.map((type) => ({ type })) },
    addWidget,
  } as unknown as ReturnType<typeof useDashboard>);

const renderCard = () =>
  render(
    <PartnerCard partner="time-tool">
      {(present) => (
        <button type="button" disabled={!present}>
          Inner control
        </button>
      )}
    </PartnerCard>
  );

beforeEach(() => {
  vi.clearAllMocks();
  auth();
  boardWith();
});

describe('PartnerCard (legacy panels)', () => {
  it('titles the card by the Dock name, honouring the admin display name', () => {
    boardWith('time-tool');
    renderCard();
    expect(
      screen.getByRole('group', { name: 'Class Timer' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inner control' })).toBeEnabled();
  });

  it('disables the control and adds the partner on tap while it is missing', () => {
    renderCard();
    expect(
      screen.getByRole('button', { name: 'Inner control' })
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Add Class Timer widget' })
    );
    expect(addWidget).toHaveBeenCalledWith('time-tool');
  });

  it('renders nothing when the partner is permission-hidden', () => {
    auth(['time-tool']);
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });
});
