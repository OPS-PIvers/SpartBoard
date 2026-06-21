/**
 * Render / smoke test for PlcRouteHost (Wave 1 — T4 routing, T11 integration).
 *
 * PlcRouteHost is the `/plc...` route entry point: it reads the parsed
 * `{ plcId, section }` from the pathname, subscribes once to the user's live
 * PLC list via `usePlcs()`, and — for a deep-linked `/plc/:plcId/:section` —
 * resolves the live `Plc`, mounts `PlcProvider` (T3) with the resolved plc +
 * activeSection, and renders `PlcDashboard` with that section.
 *
 * This is the wave's integration smoke test (T11 acceptance point 2): it proves
 * that an existing PLC, deep-linked to a specific section, still renders that
 * section's body THROUGH the new PlcProvider + routing host — i.e. the new
 * provider/router did not break the shipped section surfaces.
 *
 * To isolate the host's own resolution logic from Firestore, we mock:
 *   - @/hooks/usePlcs (controllable {plcs, loading} — the list the host resolves
 *     the active PLC from).
 *   - @/context/useAuth (controllable user — drives userUid/userEmail threading).
 *   - react-i18next (t returns its defaultValue, so the loading / not-found
 *     copy is assertable without a real i18next runtime).
 *   - @/utils/plcPath (spaNavigate observed; the rest left real).
 *   - @/context/PlcContext → PlcProvider replaced with a pass-through sentinel
 *     that records the {plcId, plc.id, activeSection} props it was mounted with
 *     and renders its children (no Firestore listeners boot).
 *   - PlcDashboard / PlcIndexHub → section/hub sentinels exposing the props the
 *     host threads down, so we can assert the correct section reached the
 *     dashboard for a deep link.
 *
 * Coverage:
 *   (1) deep link `/plc/:id/:section` → resolves the live Plc, mounts
 *       PlcProvider with that plc + section, and the dashboard renders that
 *       section body (the integration smoke assertion).
 *   (2) the resolved plc + section are threaded into BOTH PlcProvider and
 *       PlcDashboard (provider+routing wiring intact).
 *   (3) bare `/plc` (no plcId) → renders the index hub (not the dashboard),
 *       threading the user's uid/email + the live list.
 *   (4) loading the list (PLC not yet resolved) → renders the loading state.
 *   (5) resolved-but-not-found (stale/bad deep link) → renders the not-found
 *       card and its back-to-board action calls spaNavigate('/').
 *   (6) home deep link (`/plc/:id`, section='home') still mounts the provider +
 *       dashboard at the home section.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PlcRouteHost } from '@/components/plc/PlcRouteHost';
import type { Plc } from '@/types';
import type { PlcSectionId } from '@/components/plc/sections';
import type { ParsedPlcPath } from '@/utils/plcPath';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSpaNavigate = vi.fn<(path: string) => void>();
vi.mock('@/utils/plcPath', async () => {
  const actual =
    await vi.importActual<typeof import('@/utils/plcPath')>('@/utils/plcPath');
  return {
    ...actual,
    spaNavigate: (path: string) => mockSpaNavigate(path),
  };
});

// t returns its defaultValue so loading / not-found copy is assertable.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }): string =>
      o?.defaultValue ?? _k,
  }),
}));

interface MockPlcsResult {
  plcs: Plc[];
  loading: boolean;
}
const mockUsePlcs = vi.fn<() => MockPlcsResult>();
vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => mockUsePlcs(),
}));

interface MockAuth {
  user: { uid: string; displayName: string; email: string } | null;
}
const mockUseAuth = vi.fn<() => MockAuth>();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// PlcProvider pass-through sentinel: records the props it was mounted with and
// renders its children (so PlcDashboard still renders) WITHOUT booting any
// Firestore listeners.
interface ProviderProps {
  plcId: string;
  plc: Plc | null;
  activeSection: PlcSectionId;
  children: React.ReactNode;
}
const providerProps = vi.fn<(p: Omit<ProviderProps, 'children'>) => void>();
vi.mock('@/context/PlcContext', () => ({
  PlcProvider: ({ plcId, plc, activeSection, children }: ProviderProps) => {
    providerProps({ plcId, plc, activeSection });
    return (
      <div
        data-testid="plc-provider"
        data-plc-id={plcId}
        data-resolved-id={plc?.id ?? ''}
        data-active-section={activeSection}
      >
        {children}
      </div>
    );
  },
}));

// PlcDashboard sentinel: surfaces the section it was handed (proves the section
// reached the dashboard through the host + provider).
vi.mock('@/components/plc/PlcDashboard', () => ({
  PlcDashboard: ({
    plc,
    activeSection,
    onClose,
  }: {
    plc: Plc;
    activeSection: PlcSectionId;
    onClose: () => void;
  }) => (
    <div
      data-testid="plc-dashboard"
      data-plc-id={plc.id}
      data-active-section={activeSection}
    >
      <span data-testid={`section-${activeSection}`}>{activeSection} body</span>
      <button type="button" onClick={onClose}>
        close-dashboard
      </button>
    </div>
  ),
}));

// PlcIndexHub sentinel: surfaces the props the host threads into the `/plc` hub.
vi.mock('@/components/plc/PlcIndexHub', () => ({
  PlcIndexHub: ({
    plcs,
    loading,
    userUid,
    userEmail,
    onClose,
  }: {
    plcs: Plc[];
    loading: boolean;
    userUid: string | null;
    userEmail: string | null;
    onClose: () => void;
  }) => (
    <div
      data-testid="plc-index-hub"
      data-count={plcs.length}
      data-loading={String(loading)}
      data-uid={userUid ?? ''}
      data-email={userEmail ?? ''}
    >
      <button type="button" onClick={onClose}>
        close-hub
      </button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakePlc: Plc = {
  id: 'plc-42',
  name: 'Grade 6 Science',
  leadUid: 'uid-a',
  members: {},
  memberUids: ['uid-a', 'uid-b'],
  memberEmails: {
    'uid-a': 'alice@school.edu',
    'uid-b': 'bob@school.edu',
  },
  createdAt: 1000,
  updatedAt: 2000,
};

function parsed(over: Partial<ParsedPlcPath> = {}): ParsedPlcPath {
  return { plcId: 'plc-42', section: 'home', meetingId: null, ...over };
}

function setUser(uid: string | null) {
  mockUseAuth.mockReturnValue({
    user: uid ? { uid, displayName: 'Alice', email: 'alice@school.edu' } : null,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcRouteHost (Wave 1 — deep-link resolution + provider/routing wiring)', () => {
  beforeEach(() => {
    mockUsePlcs.mockReset();
    mockUseAuth.mockReset();
    mockSpaNavigate.mockReset();
    providerProps.mockReset();
    setUser('uid-a');
    mockUsePlcs.mockReturnValue({ plcs: [fakePlc], loading: false });
  });

  it('renders the deep-linked section through PlcProvider + PlcDashboard', () => {
    render(<PlcRouteHost parsed={parsed({ section: 'settings' })} />);

    // The section body reached the dashboard via the host + provider.
    expect(screen.getByTestId('section-settings')).toBeInTheDocument();
    expect(screen.getByTestId('plc-dashboard')).toHaveAttribute(
      'data-active-section',
      'settings'
    );
    // No index hub on a /plc/:id route.
    expect(screen.queryByTestId('plc-index-hub')).not.toBeInTheDocument();
  });

  it('mounts PlcProvider with the resolved live Plc and the parsed section', () => {
    render(<PlcRouteHost parsed={parsed({ section: 'docs' })} />);

    expect(providerProps).toHaveBeenCalledWith({
      plcId: 'plc-42',
      plc: fakePlc,
      activeSection: 'docs',
    });

    const provider = screen.getByTestId('plc-provider');
    expect(provider).toHaveAttribute('data-plc-id', 'plc-42');
    expect(provider).toHaveAttribute('data-resolved-id', 'plc-42');
    expect(provider).toHaveAttribute('data-active-section', 'docs');

    // The same resolved plc + section reach the dashboard underneath.
    expect(screen.getByTestId('plc-dashboard')).toHaveAttribute(
      'data-plc-id',
      'plc-42'
    );
  });

  it('renders the home section for a bare /plc/:id deep link', () => {
    render(<PlcRouteHost parsed={parsed({ section: 'home' })} />);

    expect(screen.getByTestId('plc-provider')).toHaveAttribute(
      'data-active-section',
      'home'
    );
    expect(screen.getByTestId('section-home')).toBeInTheDocument();
  });

  it('renders the index hub for the bare /plc route (no plcId)', () => {
    render(<PlcRouteHost parsed={parsed({ plcId: null })} />);

    const hub = screen.getByTestId('plc-index-hub');
    expect(hub).toBeInTheDocument();
    expect(hub).toHaveAttribute('data-uid', 'uid-a');
    expect(hub).toHaveAttribute('data-email', 'alice@school.edu');
    expect(hub).toHaveAttribute('data-count', '1');
    // Dashboard/provider are not mounted on the hub route.
    expect(screen.queryByTestId('plc-dashboard')).not.toBeInTheDocument();
    expect(screen.queryByTestId('plc-provider')).not.toBeInTheDocument();
  });

  it('renders the loading state while the PLC list is loading and unresolved', () => {
    mockUsePlcs.mockReturnValue({ plcs: [], loading: true });

    render(<PlcRouteHost parsed={parsed({ section: 'settings' })} />);

    expect(screen.getByLabelText('Loading PLC…')).toBeInTheDocument();
    expect(screen.queryByTestId('plc-dashboard')).not.toBeInTheDocument();
  });

  it('renders the not-found card for a resolved-but-missing PLC (stale deep link)', () => {
    mockUsePlcs.mockReturnValue({ plcs: [], loading: false });

    render(<PlcRouteHost parsed={parsed({ plcId: 'gone' })} />);

    expect(screen.getByText('PLC not found')).toBeInTheDocument();
    expect(screen.queryByTestId('plc-dashboard')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Back to my board'));
    expect(mockSpaNavigate).toHaveBeenCalledWith('/');
  });
});
