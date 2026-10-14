import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { OverflowMenu } from '@/components/common/sessionViews/OverflowMenu';
import { Z_INDEX } from '@/config/zIndex';

describe('OverflowMenu stacking', () => {
  it('opens above a maximized widget', () => {
    render(
      <OverflowMenu
        ariaLabel="New"
        items={[{ id: 'create', label: 'Create quiz', onClick: vi.fn() }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    const menu = screen.getByRole('menu');
    expect(Number(menu.style.zIndex)).toBeGreaterThan(Z_INDEX.maximized);
  });
});
