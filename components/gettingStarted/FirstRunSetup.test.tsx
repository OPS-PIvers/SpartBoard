import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const h = vi.hoisted(() => ({
  order: [] as string[],
  setDoc: vi.fn((..._args: unknown[]) => Promise.resolve()),
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/utils/viewAsTab', () => ({ viewAsBlocksWrite: () => false }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  setDoc: (...args: unknown[]) => {
    h.order.push('write');
    return h.setDoc(...args);
  },
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1' },
    canAccessWidget: (type: string) => type !== 'weather',
    completeSetup: () => {
      h.order.push('complete');
      return Promise.resolve();
    },
  }),
}));
vi.mock('@/context/useToolVisibility', () => ({
  useToolVisibility: () => ({
    reorderDockItems: () => h.order.push('dock'),
  }),
}));

const { FirstRunSetup } = await import('./FirstRunSetup');

describe('FirstRunSetup', () => {
  it('saves the default dock with setup done, then finishes setup, behind the loader', async () => {
    render(<FirstRunSetup fallback={<p>Loading</p>} />);
    expect(screen.getByText('Loading')).toBeInTheDocument();
    await waitFor(() => expect(h.order).toContain('complete'));
    expect(h.order.slice(0, 3)).toEqual(['write', 'dock', 'complete']);
    const written = h.setDoc.mock.calls[0]?.[1] as {
      dockItems: { toolType: string }[];
      setupCompleted: boolean;
      dockInitialized: boolean;
    };
    expect(written.setupCompleted).toBe(true);
    expect(written.dockInitialized).toBe(true);
    // A widget this teacher can't use is left out, as the wizard does.
    expect(written.dockItems.map((i) => i.toolType)).not.toContain('weather');
    expect(written.dockItems.map((i) => i.toolType)).toContain('clock');
  });
});
