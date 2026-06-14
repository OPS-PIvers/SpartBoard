import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionRow } from '@/components/common/sessionViews/SessionRow';

describe('SessionRow', () => {
  it('renders children and a hairline bottom border', () => {
    render(
      <SessionRow trailing={<span>99%</span>}>
        <span>Ada Lovelace</span>
      </SessionRow>
    );
    const row = screen.getByTestId('session-row');
    expect(row).toHaveTextContent('Ada Lovelace');
    expect(row).toHaveTextContent('99%');
    expect(row.className).toContain('border-b');
  });

  it('applies a score-band wash when tintTone is set', () => {
    render(
      <SessionRow tintTone="success">
        <span>x</span>
      </SessionRow>
    );
    expect(screen.getByTestId('session-row').className).toContain(
      'bg-emerald-50/60'
    );
  });

  it('fires onClick', () => {
    const onClick = vi.fn();
    render(
      <SessionRow onClick={onClick}>
        <span>x</span>
      </SessionRow>
    );
    fireEvent.click(screen.getByTestId('session-row'));
    expect(onClick).toHaveBeenCalled();
  });
});
