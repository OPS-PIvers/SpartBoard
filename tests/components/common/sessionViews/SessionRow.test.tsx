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
    const row = screen.getByTestId('session-row').className;
    expect(row).toContain('bg-emerald-50/60');
    // Tinted rows still get a hover affordance.
    expect(row).toContain('hover:brightness-95');
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

  it('is keyboard-activatable (role/tabindex + Enter/Space) when onClick is set', () => {
    const onClick = vi.fn();
    render(
      <SessionRow onClick={onClick}>
        <span>x</span>
      </SessionRow>
    );
    const row = screen.getByTestId('session-row');
    expect(row).toHaveAttribute('role', 'button');
    expect(row).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('is not interactive (no role/tabindex) without onClick', () => {
    render(
      <SessionRow>
        <span>x</span>
      </SessionRow>
    );
    const row = screen.getByTestId('session-row');
    expect(row).not.toHaveAttribute('role');
    expect(row).not.toHaveAttribute('tabindex');
  });
});
