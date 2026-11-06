import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MagicLayoutModal } from '@/components/layout/dock/MagicLayoutModal';

const generate = vi.hoisted(() => vi.fn());

vi.mock('@/utils/ai', () => ({
  generateDashboardLayout: generate,
  buildPromptWithFileContext: (d: string) => d,
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addWidgets: vi.fn(), addToast: vi.fn() }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: () => false,
    canAccessWidget: () => true,
  }),
}));
vi.mock('@/hooks/useViewAsOutward', () => ({
  useViewAsOutward: () => ({ locked: false, active: false }),
}));

describe('MagicLayoutModal Enter', () => {
  it('does not start a second generation while one is in flight', () => {
    generate.mockReturnValue(new Promise(() => undefined));
    render(<MagicLayoutModal onClose={vi.fn()} />);
    const box = screen.getByPlaceholderText(/Math rotations/);
    fireEvent.change(box, { target: { value: 'Morning meeting' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
