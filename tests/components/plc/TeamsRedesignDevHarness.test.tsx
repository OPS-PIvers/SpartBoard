import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  SCREENS,
  TeamsRedesignDevHarness,
} from '@/components/plc/redesignMockup/TeamsRedesignDevHarness';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
    i18n: { language: 'en' },
  }),
}));

describe('TeamsRedesignDevHarness', () => {
  it('renders every screen from the switcher', () => {
    render(<TeamsRedesignDevHarness />);
    const picker = screen.getByRole('combobox', { name: 'Screen' });
    for (const [id] of SCREENS) {
      fireEvent.change(picker, { target: { value: id } });
      expect(picker).toHaveValue(id);
    }
    fireEvent.change(picker, { target: { value: 'plc' } });
    expect(
      screen.getByRole('heading', { name: 'Unit 3 Ratios CFA' })
    ).toBeInTheDocument();
    expect(screen.getByText('Item analysis')).toBeInTheDocument();
  });

  it('shows the quiet tagging prompt to a lead when nothing is tagged', () => {
    render(<TeamsRedesignDevHarness />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Questions tagged' }));
    expect(
      screen.getByText(
        'Tag questions to learning targets to see mastery by target.'
      )
    ).toBeInTheDocument();
  });
});
