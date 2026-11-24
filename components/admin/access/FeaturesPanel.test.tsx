import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FeaturesPanel } from './FeaturesPanel';
import { AccessSearchProvider } from './AccessSearchProvider';

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

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

const existingPermission = {
  featureId: 'live-session',
  accessLevel: 'beta',
  betaUsers: ['Teacher@School.ORG'],
  enabled: true,
  buildings: [],
  config: {},
};

let extraPermissions: Record<string, unknown>[] = [];

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  onSnapshot: vi.fn(
    (_ref: unknown, next: (snap: { data: () => unknown }) => void) => {
      next({ data: () => undefined });
      return () => undefined;
    }
  ),
  serverTimestamp: vi.fn(),
  getDocs: vi.fn(() =>
    Promise.resolve({
      forEach: (cb: (doc: { data: () => unknown }) => void) => {
        cb({ data: () => existingPermission });
        extraPermissions.forEach((p) => cb({ data: () => p }));
      },
    })
  ),
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

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));

describe('FeaturesPanel', () => {
  afterEach(() => {
    cleanup();
    extraPermissions = [];
  });

  it('lists a graduated preview under Other with a Retire link', async () => {
    extraPermissions = [
      {
        featureId: 'plc-docs-toolbar',
        accessLevel: 'public',
        betaUsers: [],
        enabled: true,
        buildings: ['schumann'],
        graduated: true,
      },
    ];
    render(<FeaturesPanel />);
    fireEvent.click(await screen.findByTestId('wrap-up-plc-docs-toolbar'));
    const link = screen.getByTestId('retire-plc-docs-toolbar');
    expect(screen.getByText('Other')).toBeInTheDocument();
    const body =
      new URL(link.getAttribute('href') ?? '').searchParams.get('body') ?? '';
    expect(body).toContain('Schumann Elementary');
    expect(screen.queryByTestId('wrap-up-live-session')).toBeNull();
  });

  // A pre-existing legacy mixed-case entry must not produce a duplicate on re-add.
  it('does not re-add a beta user whose email differs only by case from an existing entry', async () => {
    render(<FeaturesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Live Sessions')).toBeInTheDocument();
    });

    fireEvent.click(
      document.querySelector(
        '[aria-controls="access-row-live-session"]'
      ) as Element
    );
    expect(screen.getByText('Teacher@School.ORG')).toBeInTheDocument();

    const input = screen.getByLabelText('Add beta user email');
    fireEvent.change(input, { target: { value: 'teacher@school.org' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Still exactly one chip for this user — no duplicate was added.
    expect(screen.getAllByText(/teacher@school\.org/i)).toHaveLength(1);
  });

  it('filters rows by search and links to the tab that matches', async () => {
    const goToTab = vi.fn();
    render(
      <AccessSearchProvider goToTab={goToTab}>
        <FeaturesPanel />
      </AccessSearchProvider>
    );
    await waitFor(() => {
      expect(screen.getByText('Live Sessions')).toBeInTheDocument();
    });

    const search = screen.getByTestId('access-search-features');
    fireEvent.change(search, { target: { value: 'classroom' } });
    expect(screen.queryByText('Live Sessions')).not.toBeInTheDocument();
    expect(
      screen.getByText('Google Classroom integration')
    ).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'stickers' } });
    fireEvent.click(screen.getByRole('button', { name: /Found on Widgets/ }));
    expect(goToTab).toHaveBeenCalledWith('widgets');

    fireEvent.change(search, { target: { value: 'read aloud' } });
    fireEvent.click(screen.getByRole('button', { name: /Found on Previews/ }));
    expect(goToTab).toHaveBeenCalledWith('previews');
  });

  it('groups features into category sections', async () => {
    render(<FeaturesPanel />);
    await waitFor(() => {
      expect(screen.getByText('Live Sessions')).toBeInTheDocument();
    });
    expect(screen.getByText('Sharing & sessions')).toBeInTheDocument();
    expect(screen.queryByText('Custom Logo')).toBeNull();
  });
});
