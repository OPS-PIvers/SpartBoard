import React from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Regression guard: activity.buildings loaded from Firestore may still hold a
// legacy long-form building id (e.g. "orono-high-school") from before the
// Organization Buildings panel switched to short canonical ids ("high").
// Toggling a building must canonicalize before comparing/writing, mirroring
// the fix already applied to AnalyticsManager's userList.buildings and
// NewUserSetup's selectedBuildings via config/buildings.ts's
// canonicalizeBuildingIds — otherwise the UI can never fully unassign a
// legacy-tagged building (see toggleBuilding in the component under test).

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [
    { id: 'high', name: 'Orono High School', gradeLabel: '9-12' },
  ],
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

const legacyActivity = {
  id: 'act1',
  title: 'Legacy Assigned Activity',
  questionCount: 5,
  youtubeUrl: 'https://youtu.be/legacy',
  // Stored before the short-id migration — should resolve to canonical "high".
  buildings: ['orono-high-school'],
};

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(
    (
      _q: unknown,
      onNext: (snap: {
        forEach: (cb: (docSnap: unknown) => void) => void;
      }) => void
    ) => {
      onNext({
        forEach: (cb) => {
          cb({ id: legacyActivity.id, data: () => legacyActivity });
        },
      });
      return vi.fn();
    }
  ),
}));

import { setDoc } from 'firebase/firestore';
import { VideoActivityConfigurationModal } from '@/components/admin/VideoActivityConfigurationModal';
import type { FeaturePermission } from '@/types';

const setDocMock = setDoc as unknown as Mock;

const permission: FeaturePermission = {
  widgetType: 'video-activity',
  accessLevel: 'public',
  betaUsers: [],
  enabled: true,
  config: {},
};

describe('VideoActivityConfigurationModal — building id canonicalization', () => {
  beforeEach(() => {
    setDocMock.mockClear();
  });

  it('shows a legacy-id-assigned building as selected', async () => {
    render(
      <VideoActivityConfigurationModal
        onClose={vi.fn()}
        permission={permission}
        onSave={vi.fn()}
      />
    );

    const highSchoolButton = await screen.findByRole('button', {
      name: '9-12',
    });
    expect(highSchoolButton.className).toContain('bg-brand-blue-primary');
  });

  it('fully unassigns a legacy-id building on toggle instead of adding a duplicate canonical id', async () => {
    render(
      <VideoActivityConfigurationModal
        onClose={vi.fn()}
        permission={permission}
        onSave={vi.fn()}
      />
    );

    const highSchoolButton = await screen.findByRole('button', {
      name: '9-12',
    });

    fireEvent.click(highSchoolButton);

    await waitFor(() => expect(setDocMock).toHaveBeenCalled());
    const [, writtenData] = setDocMock.mock.calls[0];
    expect(writtenData).toEqual({ buildings: [] });
  });
});
