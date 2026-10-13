import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('lucide-react', () => {
  function icon(name: string) {
    const Stub = (props: React.HTMLAttributes<HTMLSpanElement>) =>
      React.createElement('span', { 'data-icon': name, ...props });
    Stub.displayName = name;
    return Stub;
  }
  return new Proxy(
    {},
    {
      get(target: Record<string, unknown>, prop) {
        if (prop === '__esModule') return true;
        if (prop === 'then') return undefined;
        if (typeof prop === 'string' && !(prop in target)) {
          target[prop] = icon(prop);
        }
        return target[prop as string];
      },
    }
  );
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? _key,
  }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    shareDashboard: vi.fn(),
    addToast: vi.fn(),
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature: () => true }),
}));

vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({ plcs: [] }),
}));

import { ShareLinkCreatorModal } from '@/components/share/ShareLinkCreatorModal';
import type { Dashboard } from '@/types';

const dashboard: Dashboard = {
  id: 'dash-1',
  name: 'Test Dashboard',
  background: 'bg-slate-900',
  widgets: [],
  createdAt: Date.now(),
};

describe('ShareLinkCreatorModal — Share with a sub entry', () => {
  afterEach(() => {
    cleanup();
  });

  it('offers Share with a sub and opens it', () => {
    const onShareWithSub = vi.fn();
    render(
      <ShareLinkCreatorModal
        dashboard={dashboard}
        isOpen
        onClose={vi.fn()}
        onShareWithSub={onShareWithSub}
      />
    );
    expect(
      screen.queryByRole('button', { name: /Substitute \(View-Only\)/ })
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Share with a sub/ }));
    expect(onShareWithSub).toHaveBeenCalledTimes(1);
  });
});
