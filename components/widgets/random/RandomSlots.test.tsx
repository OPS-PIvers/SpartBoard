import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { RandomSlots } from './RandomSlots';
import { useDashboard } from '@/context/useDashboard';
import { DEFAULT_GLOBAL_STYLE } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

describe('RandomSlots Component', () => {
  beforeEach(() => {
    (useDashboard as Mock).mockReturnValue({
      activeDashboard: { globalStyle: DEFAULT_GLOBAL_STYLE },
    });
  });

  it('renders correctly with default props', () => {
    render(<RandomSlots displayResult={null} fontSize={32} slotHeight={100} />);

    expect(screen.getByText('Ready?')).toBeInTheDocument();
  });

  it('renders correctly with a display result', () => {
    render(
      <RandomSlots displayResult="Winner!" fontSize={32} slotHeight={100} />
    );

    expect(screen.getByText('Winner!')).toBeInTheDocument();
  });
});
