import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { BackgroundPreset } from '@/types';

const h = vi.hoisted(() => ({
  setDoc: vi.fn((..._args: unknown[]) => Promise.resolve()),
  forget: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ db: {}, isConfigured: false }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  onSnapshot: () => () => undefined,
  setDoc: h.setDoc,
}));
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [
    { id: 'oms', name: 'Orono Middle School' },
    { id: 'ohs', name: 'Orono High School' },
  ],
}));
vi.mock('@/utils/boardBackgroundDefaults', async (importActual) => ({
  ...(await importActual<typeof import('@/utils/boardBackgroundDefaults')>()),
  forgetBoardBackgroundDefaults: h.forget,
}));

const { BoardBackgroundDefaultsPanel } =
  await import('./BoardBackgroundDefaultsPanel');

const preset = (over: Partial<BackgroundPreset>): BackgroundPreset => ({
  id: 'p',
  url: 'https://example.com/lake.jpg',
  label: 'Lake',
  active: true,
  accessLevel: 'public',
  betaUsers: [],
  createdAt: 0,
  ...over,
});

beforeEach(() => {
  h.setDoc.mockClear();
  h.forget.mockClear();
});

describe('BoardBackgroundDefaultsPanel', () => {
  it('offers gradients and active presets, not hidden ones', () => {
    render(
      <BoardBackgroundDefaultsPanel
        presets={[
          preset({}),
          preset({ id: 'q', label: 'Hidden', active: false }),
        ]}
        onError={() => undefined}
      />
    );
    const district = screen.getByLabelText('District default background');
    expect(district).toHaveTextContent('Snowy (SpartBoard default)');
    expect(district).toHaveTextContent('Lake');
    expect(district).not.toHaveTextContent('Hidden');
  });

  it("saves the district's and a building's default", async () => {
    render(
      <BoardBackgroundDefaultsPanel
        presets={[preset({})]}
        onError={() => undefined}
      />
    );
    fireEvent.change(screen.getByLabelText('District default background'), {
      target: { value: 'https://example.com/lake.jpg' },
    });
    expect(h.setDoc).toHaveBeenLastCalledWith(expect.anything(), {
      district: 'https://example.com/lake.jpg',
      buildings: {},
    });
    fireEvent.change(
      screen.getByLabelText('Default background for Orono High School'),
      { target: { value: 'https://example.com/lake.jpg' } }
    );
    expect(h.setDoc).toHaveBeenLastCalledWith(expect.anything(), {
      district: 'https://example.com/lake.jpg',
      buildings: { ohs: 'https://example.com/lake.jpg' },
    });
    await Promise.resolve();
    expect(h.forget).toHaveBeenCalled();
  });
});
