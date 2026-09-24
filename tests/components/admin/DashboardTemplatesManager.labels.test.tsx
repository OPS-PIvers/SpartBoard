// Pins each template row's "Enabled" Toggle to an accessible name; without
// a label prop every row's switch shares the same unnamed role="switch".

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'col'),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  addDoc: vi.fn().mockResolvedValue(undefined),
  query: vi.fn(() => 'query'),
  orderBy: vi.fn(() => 'orderBy'),
  onSnapshot: vi.fn((_q: unknown, onNext: (snap: unknown) => void) => {
    onNext({
      docs: [
        {
          id: 'tpl-1',
          data: () => ({
            type: 'board',
            name: 'Morning Routine',
            description: '',
            widgets: [],
            tags: [],
            targetGradeLevels: [],
            targetBuildings: [],
            enabled: true,
            accessLevel: 'public',
            createdAt: 1,
            updatedAt: 1,
            createdBy: 'admin@example.com',
          }),
        },
      ],
    });
    return vi.fn();
  }),
}));

vi.mock('@/hooks/useTemplateStore', () => ({
  mockTemplateStore: { save: vi.fn(), remove: vi.fn() },
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [],
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { email: 'admin@example.com' } }),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));

import { DashboardTemplatesManager } from '@/components/admin/DashboardTemplatesManager';

afterEach(cleanup);

describe('DashboardTemplatesManager — label associations', () => {
  it('names the Enabled toggle from the template name', async () => {
    render(<DashboardTemplatesManager />);

    expect(
      await screen.findByRole('switch', { name: 'Morning Routine enabled' })
    ).toBeInTheDocument();
  });
});
