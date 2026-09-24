// Pins the "Auto-play video" Toggle's accessible name; without a label
// prop the switch is unnamed for screen readers.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { EmbedConfig } from '@/types';

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ driveService: null, userDomain: undefined }),
}));

vi.mock('@/hooks/useScreenRecord', () => ({
  useScreenRecord: () => ({
    isRecording: false,
    duration: 0,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
  }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'test-uid' }, googleAccessToken: null }),
}));

import { EmbedConfigEditor } from '@/components/admin/Announcements/EmbedConfigEditor';

afterEach(cleanup);

describe('EmbedConfigEditor (Announcements) — label associations', () => {
  it('names the Auto-play video toggle', () => {
    render(
      <EmbedConfigEditor
        config={{} as Partial<EmbedConfig>}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole('switch', { name: 'Auto-play video' })
    ).toBeInTheDocument();
  });
});
