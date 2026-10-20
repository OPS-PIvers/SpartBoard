import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NewUserSetup } from './NewUserSetup';

const reorderDockItems = vi.fn();
const completeSetup = vi.fn().mockResolvedValue(undefined);
let displayName: string | null = 'Ada Lovelace';

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: true }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), setDoc: vi.fn() }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1', displayName },
    setSelectedBuildings: vi.fn().mockResolvedValue(undefined),
    completeSetup,
    orgId: null,
    orgBuildings: [],
    orgBuildingsLoaded: true,
    canAccessWidget: (type: string) => type !== 'quiz',
  }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ setGlobalStyle: vi.fn() }),
}));
vi.mock('@/context/useToolVisibility', () => ({
  useToolVisibility: () => ({ reorderDockItems }),
}));
vi.mock('@/hooks/useAdminBuildings', () => ({ useAdminBuildings: () => [] }));
vi.mock('@/components/sparty/useShowSparty', () => ({
  useShowSparty: () => false,
}));

describe('NewUserSetup dock step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    displayName = 'Ada Lovelace';
  });

  it.each([[''], ['   '], [null]])(
    'greets without a dangling comma for display name %j',
    (name) => {
      displayName = name;
      render(<NewUserSetup />);
      expect(
        screen.getByRole('heading', { name: 'Welcome, there!' })
      ).toBeInTheDocument();
    }
  );

  it('greets by first name, ignoring leading whitespace', () => {
    displayName = '  Ada Lovelace';
    render(<NewUserSetup />);
    expect(
      screen.getByRole('heading', { name: 'Welcome, Ada!' })
    ).toBeInTheDocument();
  });

  it('counts and saves only tools the user can access', async () => {
    render(<NewUserSetup />);
    fireEvent.click(screen.getByRole('button', { name: /next|continue/i }));
    // 12 defaults, one of which (quiz) is hidden from this user
    expect(screen.getByText(/^11 tools selected/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /finish|done|start/i }));
    await waitFor(() => expect(reorderDockItems).toHaveBeenCalled());
    const saved = reorderDockItems.mock.calls[0][0] as { toolType: string }[];
    expect(saved).toHaveLength(11);
    expect(saved.map((i) => i.toolType)).not.toContain('quiz');
  });
});
