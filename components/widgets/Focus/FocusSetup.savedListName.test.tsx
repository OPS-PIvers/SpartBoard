import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ClassRoster, WidgetData } from '@/types';
import { FocusWidget } from './Widget';

const h = vi.hoisted(() => ({
  saveWidgetPreset: vi.fn(),
  showPrompt: vi.fn(),
}));

vi.mock('@/context/dashboardCanvasStore', () => ({
  useDashboardActions: () => ({ updateWidget: vi.fn() }),
  useDashboardCanvasSelector: <T,>(
    pick: (s: { rosters: unknown[]; activeDashboard: null }) => T
  ) => pick({ rosters: [ROSTER], activeDashboard: null }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 't1' },
    orgId: 'orono',
    savedWidgetPresets: {},
    saveWidgetPreset: h.saveWidgetPreset,
  }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn(), showPrompt: h.showPrompt }),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({ byStudentUid: new Map() }),
  formatStudentName: () => '',
}));
vi.mock('./useFocusData', async (importOriginal) => {
  const real = await importOriginal<typeof import('./useFocusData')>();
  const empty = { rows: [], loading: false, error: false };
  return {
    ...real,
    useFocusClassSessions: () => empty,
    useFocusSession: () => empty,
    useFocusStudents: () => empty,
    useFocusOpen: () => ({
      sessionId: null,
      checking: false,
      recheck: vi.fn(),
    }),
  };
});

const ROSTER = {
  id: 'r1',
  name: 'Period 3',
  driveFileId: null,
  studentCount: 2,
  createdAt: 0,
  students: [],
  classlinkClassId: 'c1',
} as ClassRoster;

const widget: WidgetData = {
  id: 'w1',
  type: 'focus',
  x: 0,
  y: 0,
  w: 460,
  h: 560,
  z: 1,
  flipped: false,
  config: { rosterId: 'r1', sites: [{ host: 'desmos.com', path: '' }] },
};

describe('Focus saved site list name', () => {
  it('does not split an emoji when clipping a long name', async () => {
    h.showPrompt.mockResolvedValue(`${'a'.repeat(79)}😀`);
    render(<FocusWidget widget={widget} />);
    await userEvent.click(screen.getByRole('button', { name: /Saved lists/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Save these sites' })
    );
    const [, patch] = h.saveWidgetPreset.mock.calls[0] as [
      string,
      { savedSiteLists: { name: string }[] },
    ];
    const saved = patch.savedSiteLists[0].name;
    expect(saved).toBe('a'.repeat(79));
    expect(saved).not.toMatch(/[\uD800-\uDBFF]$/);
  });
});
