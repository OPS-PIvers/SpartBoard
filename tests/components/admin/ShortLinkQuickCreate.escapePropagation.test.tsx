// Regression test: ShortLinkQuickCreate's Escape handler must stop propagation so it doesn't also reach DashboardView's window-level handler.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('@/hooks/useShortLinks', () => ({
  useShortLinks: () => ({ createShortLink: vi.fn() }),
}));

import { ShortLinkQuickCreate } from '@/components/admin/ShortLinkQuickCreate';

afterEach(cleanup);

describe('ShortLinkQuickCreate — Escape does not leak to window-level handlers', () => {
  it('closes on Escape and stops propagation before it reaches window listeners', () => {
    const onClose = vi.fn();
    render(<ShortLinkQuickCreate onClose={onClose} />);

    expect(screen.getByText('Shorten a URL')).toBeInTheDocument();

    const windowKeydownSpy = vi.fn();
    window.addEventListener('keydown', windowKeydownSpy);

    try {
      fireEvent.keyDown(document, { key: 'Escape', bubbles: true });
      expect(onClose).toHaveBeenCalled();
      expect(windowKeydownSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydownSpy);
    }
  });
});
