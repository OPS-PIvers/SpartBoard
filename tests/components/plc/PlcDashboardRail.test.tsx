import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PlcDashboardRail } from '@/components/plc/PlcDashboardRail';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

describe('PlcDashboardRail', () => {
  it('renders a tab per visible section and marks the active one', () => {
    const onSelect = vi.fn();
    render(
      <PlcDashboardRail
        activeSection="home"
        onSelect={onSelect}
        visibleSections={[
          { id: 'home', label: 'Home', icon: () => null },
          { id: 'quizzes', label: 'Quizzes', icon: () => null },
        ]}
      />
    );
    const home = screen.getByRole('tab', { name: 'Home' });
    expect(home).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Quizzes' }));
    expect(onSelect).toHaveBeenCalledWith('quizzes');
  });
});
