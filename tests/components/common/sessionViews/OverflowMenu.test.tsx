import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OverflowMenu } from '@/components/common/sessionViews/OverflowMenu';

describe('OverflowMenu', () => {
  it('opens on click and shows items', () => {
    render(<OverflowMenu items={[{ label: 'Export', onClick: vi.fn() }]} />);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Export' })
    ).toBeInTheDocument();
  });

  it('fires the item onClick and closes', () => {
    const onClick = vi.fn();
    render(<OverflowMenu items={[{ label: 'Export', onClick }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
