import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GlobalPermissionsManager } from './GlobalPermissionsManager';
import { AccessSearchProvider } from './access/AccessSearchProvider';

// Minimal lucide-react stub — avoids loading the full ~25,000-line bundle.
vi.mock('lucide-react', () => {
  function icon(name: string) {
    const Stub = (props: React.HTMLAttributes<HTMLSpanElement>) =>
      React.createElement('span', { 'data-icon': name, ...props });
    Stub.displayName = name;
    return Stub;
  }
  const mocks: Record<string, unknown> = {};
  return new Proxy(mocks, {
    get(target, prop) {
      if (prop === '__esModule') return true;
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && !(prop in target)) {
        target[prop] = icon(prop);
      }
      return target[prop as string];
    },
  });
});

vi.mock('@/config/firebase', () => ({ db: {} }));

const existingPermission = {
  featureId: 'live-session',
  accessLevel: 'beta',
  betaUsers: ['Teacher@School.ORG'],
  enabled: true,
  buildings: [],
  config: {},
};

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  getDocs: vi.fn(() => ({
    forEach: (cb: (doc: { data: () => unknown }) => void) => {
      cb({ data: () => existingPermission });
    },
  })),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { email: 'admin@test.com' },
    appSettings: {},
    updateAppSettings: vi.fn(),
  }),
}));

vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    uploadAdminLogo: vi.fn(),
    deleteAdminLogo: vi.fn(),
    uploading: false,
  }),
}));

vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));

describe('GlobalPermissionsManager', () => {
  afterEach(() => {
    cleanup();
  });

  // A pre-existing legacy mixed-case entry must not produce a duplicate on re-add.
  it('does not re-add a beta user whose email differs only by case from an existing entry', async () => {
    render(<GlobalPermissionsManager />);

    await waitFor(() => {
      expect(screen.getByText('Live Sessions')).toBeInTheDocument();
    });

    expect(screen.getByText('Teacher@School.ORG')).toBeInTheDocument();

    const input = screen.getByPlaceholderText('user@example.com');
    fireEvent.change(input, { target: { value: 'teacher@school.org' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Still exactly one chip for this user — no duplicate was added.
    expect(screen.getAllByText(/teacher@school\.org/i)).toHaveLength(1);
  });

  it('filters rows by search and links to the tab that matches', async () => {
    const goToTab = vi.fn();
    render(
      <AccessSearchProvider goToTab={goToTab}>
        <GlobalPermissionsManager />
      </AccessSearchProvider>
    );
    await waitFor(() => {
      expect(screen.getByText('Live Sessions')).toBeInTheDocument();
    });

    const search = screen.getByTestId('access-search-global');
    fireEvent.change(search, { target: { value: 'read aloud' } });
    expect(screen.queryByText('Live Sessions')).not.toBeInTheDocument();
    expect(
      screen.getByText('Quiz read-aloud (text-to-speech)')
    ).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'stickers' } });
    fireEvent.click(
      screen.getByRole('button', { name: /Found on Feature Permissions/ })
    );
    expect(goToTab).toHaveBeenCalledWith('features');
  });
});
