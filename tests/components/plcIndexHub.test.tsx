/**
 * Render tests for PlcIndexHub — the `/plc` landing hub (Wave 1, T5).
 *
 * Two sections:
 *   1. "Your PLCs" — the user's own PLCs (from the `plcs` prop).
 *   2. "PLCs in my building" — the discovery directory (from
 *      `usePlcBuildingDirectory`, mocked here).
 *
 * Mocking:
 *   - react-i18next (t returns defaultValue with {{count}}/{{email}}
 *     interpolation + plural selection so the member-count + hint copy is
 *     assertable).
 *   - @/hooks/usePlcBuildingDirectory (controllable directory state).
 *   - @/utils/plcPath (spaNavigate observable; buildPlcPath stays real).
 *
 * Coverage:
 *   (1) "Your PLCs" lists the user's PLCs + Lead badge on the led one.
 *   (2) Clicking a PLC navigates (spaNavigate) to /plc/:id.
 *   (3) Empty "Your PLCs" shows the empty state.
 *   (4) The directory section lists discoverable PLCs with member counts.
 *   (5) The directory excludes nothing extra (it renders what the hook returns).
 *   (6) Empty directory shows its empty notice.
 *   (7) No-org shows the "directory unavailable" notice + no listener UI.
 *   (8) The join hint shows the user's email.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PlcIndexHub } from '@/components/plc/PlcIndexHub';
import type { Plc } from '@/types';
import type { PlcDirectoryEntry } from '@/hooks/usePlcBuildingDirectory';

// --- i18n: t returns defaultValue, interpolating {{count}} + {{email}} and
// selecting the plural form (defaultValue_other) when count !== 1. ---
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _k: string,
      o?: {
        defaultValue?: string;
        defaultValue_other?: string;
        count?: number;
        email?: string;
      }
    ): string => {
      if (!o) return _k;
      const count = o.count;
      let template = o.defaultValue ?? _k;
      if (count !== undefined && count !== 1 && o.defaultValue_other) {
        template = o.defaultValue_other;
      }
      if (count !== undefined) {
        template = template.replace(/\{\{count\}\}/g, String(count));
      }
      if (o.email !== undefined) {
        template = template.replace(/\{\{email\}\}/g, o.email);
      }
      return template;
    },
  }),
}));

// --- spaNavigate observed; buildPlcPath stays real. ---
const mockSpaNavigate = vi.fn<(path: string) => void>();
vi.mock('@/utils/plcPath', async () => {
  const actual =
    await vi.importActual<typeof import('@/utils/plcPath')>('@/utils/plcPath');
  return {
    ...actual,
    spaNavigate: (path: string) => mockSpaNavigate(path),
  };
});

// --- directory hook mocked; each test sets the returned value. ---
vi.mock('@/hooks/usePlcBuildingDirectory', () => ({
  usePlcBuildingDirectory: vi.fn(),
}));
import { usePlcBuildingDirectory } from '@/hooks/usePlcBuildingDirectory';

const dirMock = vi.mocked(usePlcBuildingDirectory);

const setDirectory = (override: {
  entries?: PlcDirectoryEntry[];
  loading?: boolean;
  error?: Error | null;
  orgId?: string | null;
  buildingId?: string | null;
}) => {
  dirMock.mockReturnValue({
    entries: override.entries ?? [],
    loading: override.loading ?? false,
    error: override.error ?? null,
    // Use `in` so an explicit `orgId: null` is honored (not coalesced away).
    orgId: 'orgId' in override ? (override.orgId ?? null) : 'org-1',
    buildingId:
      'buildingId' in override ? (override.buildingId ?? null) : 'bldg-1',
  });
};

const USER_UID = 'me-uid';
const USER_EMAIL = 'me@example.com';

const makePlc = (over: Partial<Plc> & { id: string; name: string }): Plc => ({
  leadUid: USER_UID,
  members: {},
  memberUids: [USER_UID],
  memberEmails: {},
  orgId: 'org-1',
  buildingId: 'bldg-1',
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const renderHub = (over?: { plcs?: Plc[]; loading?: boolean }) =>
  render(
    <PlcIndexHub
      plcs={over?.plcs ?? []}
      loading={over?.loading ?? false}
      userUid={USER_UID}
      userEmail={USER_EMAIL}
      onClose={() => undefined}
    />
  );

beforeEach(() => {
  vi.clearAllMocks();
  setDirectory({});
});

describe('PlcIndexHub — Your PLCs section', () => {
  it('lists the user PLCs and badges the one they lead', () => {
    renderHub({
      plcs: [
        makePlc({
          id: 'p1',
          name: 'Led Team',
          leadUid: USER_UID,
          memberUids: [USER_UID, 'x'],
        }),
        makePlc({
          id: 'p2',
          name: 'Member Team',
          leadUid: 'someone-else',
          memberUids: [USER_UID, 'a', 'b'],
        }),
      ],
    });

    expect(screen.getByText('Led Team')).toBeInTheDocument();
    expect(screen.getByText('Member Team')).toBeInTheDocument();
    // Exactly one Lead badge (on the led team).
    expect(screen.getAllByText('Lead')).toHaveLength(1);
    // Member counts render per PLC.
    expect(screen.getByText('2 Members')).toBeInTheDocument();
    expect(screen.getByText('3 Members')).toBeInTheDocument();
  });

  it('navigates to /plc/:id when a PLC is clicked', () => {
    renderHub({ plcs: [makePlc({ id: 'p1', name: 'Click Me' })] });

    fireEvent.click(screen.getByText('Click Me'));
    expect(mockSpaNavigate).toHaveBeenCalledWith('/plc/p1');
  });

  it('shows the empty state when the user has no PLCs', () => {
    renderHub({ plcs: [] });
    expect(screen.getByText('No PLCs yet')).toBeInTheDocument();
  });
});

describe('PlcIndexHub — PLCs in my building directory', () => {
  it('lists discoverable PLCs with member counts and a join hint', () => {
    setDirectory({
      entries: [
        {
          id: 'd1',
          name: 'Neighbor Science',
          memberCount: 4,
          orgId: 'org-1',
          buildingId: 'bldg-1',
        },
      ],
    });

    renderHub({ plcs: [] });

    expect(screen.getByText('PLCs in my building')).toBeInTheDocument();
    expect(screen.getByText('Neighbor Science')).toBeInTheDocument();
    expect(screen.getByText('4 members')).toBeInTheDocument();
    expect(screen.getByText('Ask to join')).toBeInTheDocument();
    // The join hint surfaces the user's email (read-only request affordance).
    expect(
      screen.getByText(`Ask a member to invite ${USER_EMAIL}.`)
    ).toBeInTheDocument();
  });

  it('shows the directory empty notice when there are no discoverable PLCs', () => {
    setDirectory({ entries: [] });
    renderHub({ plcs: [makePlc({ id: 'p1', name: 'Mine' })] });

    expect(screen.getByText('No other PLCs to show')).toBeInTheDocument();
  });

  it('shows the "directory unavailable" notice when the user has no org', () => {
    setDirectory({ entries: [], orgId: null, buildingId: null });
    renderHub({ plcs: [] });

    expect(
      screen.getByText('Building directory unavailable')
    ).toBeInTheDocument();
    // No directory rows render.
    expect(screen.queryByText('Ask to join')).not.toBeInTheDocument();
  });

  it('does not render the join hint when the user has no email', () => {
    setDirectory({
      entries: [
        {
          id: 'd1',
          name: 'Neighbor',
          memberCount: 2,
          orgId: 'org-1',
          buildingId: 'bldg-1',
        },
      ],
    });

    render(
      <PlcIndexHub
        plcs={[]}
        loading={false}
        userUid={USER_UID}
        userEmail={null}
        onClose={() => undefined}
      />
    );

    expect(screen.getByText('Ask to join')).toBeInTheDocument();
    expect(
      screen.queryByText(/Ask a member to invite/)
    ).not.toBeInTheDocument();
  });
});
