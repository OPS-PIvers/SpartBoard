/**
 * Render / smoke test for PlcDashboard (Wave 1 — T4, pathname-driven).
 *
 * PlcDashboard is the left-rail shell that mounts every PLC section body
 * (PlcHome, PlcSharedDataBody, PlcDocsBody, PlcResourcesBody, the four tabs,
 * MembersBody, PlcSettingsTab). It is now CONTROLLED by an `activeSection`
 * prop (derived from the pathname by `PlcRouteHost`); section changes push
 * history via `spaNavigate`. Each section body pulls Firestore hooks, so to
 * isolate the shell's own logic we mock:
 *   - react-i18next (t returns defaultValue, with {{count}} interpolation +
 *     plural selection so the member-count sub-header is assertable).
 *   - @/context/useAuth (controllable user, drives the "You lead this PLC" badge).
 *   - @/utils/plcPath (so `spaNavigate` is observable without a real history).
 *   - PlcDashboardRail (lightweight sentinel exposing one button per section so
 *     a section switch can be driven without ambiguity vs. the mobile list).
 *   - every section body (each a div with a data-testid sentinel).
 *
 * Coverage:
 *   (1) renders the dialog shell (role=dialog, aria-modal, title = plc.name)
 *   (2) renders the section named by the `activeSection` prop (home + settings)
 *   (3) clicking a rail item navigates (spaNavigate) to that section's path
 *   (4) the member-count sub-header reflects plc.memberUids.length
 *   (5) "You lead this PLC" shows iff plc.leadUid === user.uid
 *   (6) Escape key fires onClose
 *   (7) the back/close button calls onClose
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PlcDashboard } from '@/components/plc/PlcDashboard';
import type { Plc } from '@/types';
import type { PlcSectionId } from '@/components/plc/sections';

// spaNavigate/spaReplace are observed; buildPlcPath stays real so the asserted
// path matches production. (vi.importActual keeps the real path builder.)
const mockSpaNavigate = vi.fn<(path: string) => void>();
const mockSpaReplace = vi.fn<(path: string) => void>();
vi.mock('@/utils/plcPath', async () => {
  const actual =
    await vi.importActual<typeof import('@/utils/plcPath')>('@/utils/plcPath');
  return {
    ...actual,
    spaNavigate: (path: string) => mockSpaNavigate(path),
    spaReplace: (path: string) => mockSpaReplace(path),
  };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// t returns defaultValue, interpolating {{count}} and selecting the plural
// form (defaultValue_other) so the member-count sub-header is assertable.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _k: string,
      o?: {
        defaultValue?: string;
        defaultValue_other?: string;
        count?: number;
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
      return template;
    },
  }),
}));

interface MockAuth {
  user: { uid: string; displayName: string; email: string } | null;
}
const mockUseAuth = vi.fn<() => MockAuth>();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Rail sentinel: one button per visible section so we can drive a section
// switch deterministically (the real rail + the mobile drill-in list both
// render the same labels, which would make queries ambiguous).
vi.mock('@/components/plc/PlcDashboardRail', () => ({
  PlcDashboardRail: ({
    activeSection,
    onSelect,
    visibleSections,
  }: {
    activeSection: PlcSectionId;
    onSelect: (id: PlcSectionId) => void;
    visibleSections: { id: PlcSectionId; label: string }[];
  }) => (
    <nav data-testid="rail" data-active={activeSection}>
      {visibleSections.map((s) => (
        <button
          key={s.id}
          data-testid={`rail-${s.id}`}
          onClick={() => onSelect(s.id)}
        >
          {s.label}
        </button>
      ))}
    </nav>
  ),
}));

// Section-body sentinels — each renders a uniquely identifiable div so the
// active section can be asserted without booting any Firestore hooks.
vi.mock('@/components/plc/home/PlcHome', () => ({
  PlcHome: () => <div data-testid="section-home">Home body</div>,
}));
vi.mock('@/components/plc/sharedData/PlcSharedDataBody', () => ({
  PlcSharedDataBody: () => (
    <div data-testid="section-sharedData">Shared data body</div>
  ),
}));
// The Docs section now renders the combined Notes & Docs surface (T4).
vi.mock('@/components/plc/bodies/NotesDocsBody', () => ({
  NotesDocsBody: () => (
    <div data-testid="section-docs">Notes &amp; docs body</div>
  ),
}));
vi.mock('@/components/plc/resources/PlcResourcesBody', () => ({
  PlcResourcesBody: () => (
    <div data-testid="section-resources">Resources body</div>
  ),
}));
vi.mock('@/components/plc/tabs/PlcQuizLibraryTab', () => ({
  PlcQuizLibraryTab: () => (
    <div data-testid="section-quizzes">Quizzes body</div>
  ),
}));
vi.mock('@/components/plc/tabs/PlcVideoActivitiesTab', () => ({
  PlcVideoActivitiesTab: () => (
    <div data-testid="section-videoActivities">Video activities body</div>
  ),
}));
vi.mock('@/components/plc/tabs/PlcTodosTab', () => ({
  PlcTodosTab: () => <div data-testid="section-todos">To-dos body</div>,
}));
vi.mock('@/components/plc/tabs/PlcSharedBoardsTab', () => ({
  PlcSharedBoardsTab: () => (
    <div data-testid="section-sharedBoards">Shared boards body</div>
  ),
}));
vi.mock('@/components/plc/tabs/PlcSettingsTab', () => ({
  PlcSettingsTab: () => <div data-testid="section-settings">Settings body</div>,
}));
vi.mock('@/components/plc/bodies/MembersBody', () => ({
  MembersBody: () => <div data-testid="section-members">Members body</div>,
}));
vi.mock('@/components/plc/meeting/PlcMeetingMode', () => ({
  PlcMeetingMode: ({ meetingId }: { meetingId?: string | null }) => (
    <div data-testid="section-meeting" data-meeting-id={meetingId ?? ''}>
      Meeting mode
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
  memberUids: ['uid-a', 'uid-b', 'uid-c'],
  memberEmails: {
    'uid-a': 'alice@school.edu',
    'uid-b': 'bob@school.edu',
    'uid-c': 'carol@school.edu',
  },
  createdAt: 1000,
  updatedAt: 2000,
};

function setUser(uid: string | null) {
  mockUseAuth.mockReturnValue({
    user: uid ? { uid, displayName: 'Test', email: 'test@school.edu' } : null,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcDashboard (Wave 1 — pathname-driven render/smoke)', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockSpaNavigate.mockReset();
    mockSpaReplace.mockReset();
    setUser('uid-a'); // default: signed-in lead
  });

  it('renders the dialog shell with the PLC name as the title', () => {
    render(
      <PlcDashboard plc={fakePlc} activeSection="home" onClose={vi.fn()} />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'plc-dashboard-title');

    const title = screen.getByRole('heading', { name: 'Grade 6 Science' });
    expect(title).toHaveAttribute('id', 'plc-dashboard-title');
  });

  it("renders the home section when activeSection='home'", () => {
    render(
      <PlcDashboard plc={fakePlc} activeSection="home" onClose={vi.fn()} />
    );

    expect(screen.getByTestId('rail')).toHaveAttribute('data-active', 'home');
    // The home sentinel renders in the active panel (mobile list also renders,
    // but home isn't a body there — getAllByTestId guards against ambiguity).
    expect(screen.getAllByTestId('section-home').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('section-settings')).not.toBeInTheDocument();
  });

  it('renders the section named by the activeSection prop (deep-link)', () => {
    render(
      <PlcDashboard plc={fakePlc} activeSection="settings" onClose={vi.fn()} />
    );

    expect(screen.getByTestId('rail')).toHaveAttribute(
      'data-active',
      'settings'
    );
    expect(screen.getByTestId('section-settings')).toBeInTheDocument();
    expect(screen.queryByTestId('section-home')).not.toBeInTheDocument();
  });

  it("renders Meeting Mode (live) when activeSection='meeting' with no meetingId", () => {
    render(
      <PlcDashboard plc={fakePlc} activeSection="meeting" onClose={vi.fn()} />
    );

    expect(screen.getByTestId('rail')).toHaveAttribute(
      'data-active',
      'meeting'
    );
    const body = screen.getByTestId('section-meeting');
    expect(body).toBeInTheDocument();
    // No record id → live flow (empty meetingId passed through).
    expect(body).toHaveAttribute('data-meeting-id', '');
    expect(screen.queryByTestId('section-home')).not.toBeInTheDocument();
  });

  it('plumbs meetingId into Meeting Mode for the record route', () => {
    render(
      <PlcDashboard
        plc={fakePlc}
        activeSection="meeting"
        meetingId="meeting-7"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByTestId('section-meeting')).toHaveAttribute(
      'data-meeting-id',
      'meeting-7'
    );
  });

  it('navigates (pushes history) when a rail item is clicked', () => {
    render(
      <PlcDashboard plc={fakePlc} activeSection="home" onClose={vi.fn()} />
    );

    fireEvent.click(screen.getByTestId('rail-settings'));

    // The dashboard is controlled: it pushes the new section's path; the parent
    // re-derives `activeSection` from the pathname on the next render.
    expect(mockSpaNavigate).toHaveBeenCalledWith('/plc/plc-42/settings');
  });

  it('reflects plc.memberUids.length in the member-count sub-header', () => {
    render(
      <PlcDashboard plc={fakePlc} activeSection="home" onClose={vi.fn()} />
    );

    expect(screen.getByText('3 Members')).toBeInTheDocument();
  });

  it('singularizes the member count for a one-member PLC', () => {
    const soloPlc: Plc = {
      ...fakePlc,
      memberUids: ['uid-a'],
      memberEmails: { 'uid-a': 'alice@school.edu' },
    };
    render(
      <PlcDashboard plc={soloPlc} activeSection="home" onClose={vi.fn()} />
    );

    expect(screen.getByText('1 Member')).toBeInTheDocument();
  });

  it("shows 'You lead this PLC' when the user is the lead", () => {
    setUser('uid-a'); // === plc.leadUid
    render(
      <PlcDashboard plc={fakePlc} activeSection="home" onClose={vi.fn()} />
    );

    expect(screen.getByText('You lead this PLC')).toBeInTheDocument();
  });

  it("hides 'You lead this PLC' when the user is not the lead", () => {
    setUser('uid-b'); // not the lead
    render(
      <PlcDashboard plc={fakePlc} activeSection="home" onClose={vi.fn()} />
    );

    expect(screen.queryByText('You lead this PLC')).not.toBeInTheDocument();
  });

  it('fires onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <PlcDashboard plc={fakePlc} activeSection="home" onClose={onClose} />
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the back/close button is clicked (mobile menu shown)', () => {
    const onClose = vi.fn();
    render(
      <PlcDashboard plc={fakePlc} activeSection="home" onClose={onClose} />
    );

    // Landing on home shows the mobile menu, so the header button closes.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
