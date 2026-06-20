/**
 * PlcVersionHistoryPanel tests (Wave-4 T3 — PRD §5.1 / §3.10, Decision 5.1).
 *
 * Covers the version-history + restore surface for synced quiz / video-activity
 * library cards:
 *
 *   - renders the snapshot list (version #, savedBy display name, savedAt)
 *   - a "Restore this version" click calls the matching restore function
 *   - a `SyncedQuizVersionConflictError` on restore surfaces the conflict toast
 *     and reloads the list (no close)
 *
 * The two synced-group hook modules are mocked so the component never touches
 * Firestore. `useAuth` / `useDashboard` are mocked to a fixed user + a toast
 * spy. The Modal primitive is passed through as a plain wrapper so we can assert
 * on the rendered list.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Plc, SyncedQuizVersionSnapshot } from '@/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: Record<string, unknown>) => {
      let template = (o?.defaultValue as string) ?? _k;
      if (o) {
        for (const [key, value] of Object.entries(o)) {
          if (key === 'defaultValue') continue;
          template = template.replace(
            new RegExp(`{{${key}}}`, 'g'),
            String(value)
          );
        }
      }
      return template;
    },
    i18n: { language: 'en' },
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'uid-alice' } }),
}));

const addToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast }),
}));

// Pass the Modal through as a transparent wrapper that renders the custom
// header + children, so list assertions work without booting the real Modal.
vi.mock('@/components/common/Modal', () => ({
  Modal: ({
    children,
    customHeader,
  }: {
    children: React.ReactNode;
    customHeader?: React.ReactNode;
  }) => (
    <div data-testid="modal">
      {customHeader}
      {children}
    </div>
  ),
}));

const {
  listSyncedVersions,
  restoreSyncedVersion,
  listSyncedVideoActivityVersions,
  restoreSyncedVideoActivityVersion,
} = vi.hoisted(() => ({
  listSyncedVersions: vi.fn(),
  restoreSyncedVersion: vi.fn(),
  listSyncedVideoActivityVersions: vi.fn(),
  restoreSyncedVideoActivityVersion: vi.fn(),
}));

vi.mock('@/hooks/useSyncedQuizGroups', () => {
  class SyncedQuizVersionConflictError extends Error {
    constructor() {
      super('conflict');
      this.name = 'SyncedQuizVersionConflictError';
    }
  }
  return {
    listSyncedVersions,
    restoreSyncedVersion,
    SyncedQuizVersionConflictError,
  };
});

vi.mock('@/hooks/useSyncedVideoActivityGroups', () => {
  class SyncedVideoActivityVersionConflictError extends Error {
    constructor() {
      super('conflict');
      this.name = 'SyncedVideoActivityVersionConflictError';
    }
  }
  return {
    listSyncedVideoActivityVersions,
    restoreSyncedVideoActivityVersion,
    SyncedVideoActivityVersionConflictError,
  };
});

import { PlcVersionHistoryPanel } from './PlcVersionHistoryPanel';
import { SyncedQuizVersionConflictError } from '@/hooks/useSyncedQuizGroups';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakePlc: Plc = {
  id: 'plc-1',
  name: '5th Grade Math',
  leadUid: 'uid-alice',
  members: {
    'uid-alice': {
      uid: 'uid-alice',
      email: 'alice@school.edu',
      displayName: 'Alice Teacher',
      role: 'lead',
      joinedAt: 1000,
      status: 'active',
    },
    'uid-bob': {
      uid: 'uid-bob',
      email: 'bob@school.edu',
      displayName: 'Bob Teacher',
      role: 'member',
      joinedAt: 1000,
      status: 'active',
    },
  },
  memberUids: ['uid-alice', 'uid-bob'],
  memberEmails: {
    'uid-alice': 'alice@school.edu',
    'uid-bob': 'bob@school.edu',
  },
  createdAt: 1000,
  updatedAt: 2000,
};

const snapshots: SyncedQuizVersionSnapshot[] = [
  {
    version: 2,
    content: { title: 'Unit 4 CFA', questions: [] },
    savedBy: 'uid-bob',
    savedAt: 1_700_000_000_000,
  },
  {
    version: 1,
    content: { title: 'Unit 4 CFA', questions: [] },
    savedBy: 'uid-alice',
    savedAt: 1_690_000_000_000,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcVersionHistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listSyncedVersions.mockResolvedValue(snapshots);
    restoreSyncedVersion.mockResolvedValue({ version: 3 });
  });

  it('renders the snapshot list with version, author, and the restore action', async () => {
    render(
      <PlcVersionHistoryPanel
        plc={fakePlc}
        groupId="grp-1"
        kind="quiz"
        title="Unit 4 CFA"
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Version 2')).toBeInTheDocument();
    });
    expect(screen.getByText('Version 1')).toBeInTheDocument();
    // savedBy uid resolves to the PLC member display name.
    expect(screen.getByText(/Saved by Bob Teacher/)).toBeInTheDocument();
    expect(screen.getByText(/Saved by Alice Teacher/)).toBeInTheDocument();
    expect(listSyncedVersions).toHaveBeenCalledWith('grp-1');
    expect(
      screen.getAllByRole('button', { name: /restore version/i })
    ).toHaveLength(2);
  });

  it('calls restoreSyncedVersion and closes on a successful restore', async () => {
    const onClose = vi.fn();
    render(
      <PlcVersionHistoryPanel
        plc={fakePlc}
        groupId="grp-1"
        kind="quiz"
        title="Unit 4 CFA"
        onClose={onClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Version 2')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /restore version 1/i }));

    await waitFor(() => {
      expect(restoreSyncedVersion).toHaveBeenCalledWith(
        'grp-1',
        1,
        'uid-alice'
      );
    });
    expect(onClose).toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith(
      expect.stringContaining('Restored version 1'),
      'success'
    );
  });

  it('surfaces the conflict toast and reloads on a version conflict (does not close)', async () => {
    restoreSyncedVersion.mockRejectedValueOnce(
      new SyncedQuizVersionConflictError(2, 3)
    );
    const onClose = vi.fn();
    render(
      <PlcVersionHistoryPanel
        plc={fakePlc}
        groupId="grp-1"
        kind="quiz"
        title="Unit 4 CFA"
        onClose={onClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Version 2')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /restore version 2/i }));

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(
        expect.stringContaining('Another teacher'),
        'warning'
      );
    });
    expect(onClose).not.toHaveBeenCalled();
    // Reload: list fetched once on mount + once after the conflict.
    expect(listSyncedVersions).toHaveBeenCalledTimes(2);
  });

  it('routes to the video-activity hook when kind is video-activity', async () => {
    listSyncedVideoActivityVersions.mockResolvedValue(snapshots);
    restoreSyncedVideoActivityVersion.mockResolvedValue({ version: 3 });
    render(
      <PlcVersionHistoryPanel
        plc={fakePlc}
        groupId="grp-va"
        kind="video-activity"
        title="Video CFA"
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(listSyncedVideoActivityVersions).toHaveBeenCalledWith('grp-va');
    });
    fireEvent.click(screen.getByRole('button', { name: /restore version 1/i }));
    await waitFor(() => {
      expect(restoreSyncedVideoActivityVersion).toHaveBeenCalledWith(
        'grp-va',
        1,
        'uid-alice'
      );
    });
    expect(listSyncedVersions).not.toHaveBeenCalled();
  });
});
