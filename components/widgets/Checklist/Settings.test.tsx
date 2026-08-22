import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChecklistSettings } from './Settings';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

const widget: WidgetData = {
  id: 'checklist-test-1',
  type: 'checklist',
  x: 0,
  y: 0,
  w: 400,
  h: 400,
  z: 1,
  flipped: true,
  config: {
    items: [],
    mode: 'roster',
    rosterMode: 'custom',
    firstNames: '',
    lastNames: '',
  },
};

describe('ChecklistSettings — First/Last Names label associations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget: vi.fn(),
      activeDashboard: undefined,
      addToast: vi.fn(),
      rosters: [],
      activeRosterId: undefined,
    });
  });

  it('names the First Names textarea from its label', () => {
    render(<ChecklistSettings widget={widget} />);

    expect(screen.getByLabelText('First Names')).toBeInstanceOf(
      HTMLTextAreaElement
    );
  });

  it('names the Last Names textarea from its label', () => {
    render(<ChecklistSettings widget={widget} />);

    expect(screen.getByLabelText('Last Names')).toBeInstanceOf(
      HTMLTextAreaElement
    );
  });
});
