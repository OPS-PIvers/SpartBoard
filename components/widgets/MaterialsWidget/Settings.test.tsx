import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MaterialsSettings } from './Settings';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import { WidgetData } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));
vi.mock('@/hooks/useWidgetBuildingId', () => ({
  useWidgetBuildingId: vi.fn(),
}));

const widget: WidgetData = {
  id: 'materials-test-1',
  type: 'materials',
  x: 0,
  y: 0,
  w: 400,
  h: 400,
  z: 1,
  flipped: true,
  config: { selectedItems: [], activeItems: [] },
};

describe('MaterialsSettings — group heading associations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget: vi.fn(),
    });
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      featurePermissions: [],
    });
    (
      useWidgetBuildingId as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue(undefined);
  });

  // These headings render as <span> (a bare <label> labelling nothing is
  // ignored by screen readers), so the role=group + aria-labelledby pairing is
  // the only thing giving each button group an accessible name.
  it.each([['Typography'], ['Title Color'], ['Available Materials']])(
    'names the %s button group from its heading',
    (name) => {
      render(<MaterialsSettings widget={widget} />);

      expect(screen.getByRole('group', { name })).toBeInTheDocument();
    }
  );

  it('names the title text input from its label', () => {
    render(<MaterialsSettings widget={widget} />);

    expect(screen.getByLabelText('Title Text')).toHaveAttribute('type', 'text');
  });

  it('renders the headings as spans, not orphaned labels', () => {
    const { container } = render(<MaterialsSettings widget={widget} />);

    const orphanedLabels = Array.from(
      container.querySelectorAll('label')
    ).filter((el) => !el.getAttribute('for') && !el.querySelector('input'));
    expect(orphanedLabels).toHaveLength(0);
  });
});
