// Pins the "Enable AI Mode" Toggle's accessible name; without a label prop the switch is unnamed for screen readers.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [],
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

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
      onNext({ forEach: vi.fn() });
      return vi.fn();
    }
  ),
}));

import { VideoActivityConfigurationModal } from '@/components/admin/VideoActivityConfigurationModal';
import type { FeaturePermission } from '@/types';

const permission: FeaturePermission = {
  widgetType: 'video-activity',
  accessLevel: 'public',
  betaUsers: [],
  enabled: true,
  config: {},
};

describe('VideoActivityConfigurationModal — label associations', () => {
  it('names the Enable AI Mode toggle', async () => {
    render(
      <VideoActivityConfigurationModal
        onClose={vi.fn()}
        permission={permission}
        onSave={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Global Settings' }));

    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Enable AI Mode' })
      ).toBeInTheDocument()
    );
  });
});
