import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { WidgetMeta } from '@/components/admin/WidgetBuilder/types';

// Regression guard: meta.buildings may hold a legacy long-form building id
// (e.g. "orono-high-school") from before the Organization Buildings panel
// switched to short canonical ids ("high"). Comparing it directly against
// useAdminBuildings()'s canonical building.id means a legacy entry never
// matches, so re-toggling a legacy-assigned building adds a duplicate
// canonical id instead of removing it.

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [
    { id: 'high', name: 'Orono High School', gradeLabel: '9-12' },
  ],
}));

import { WidgetMetaEditor } from '@/components/admin/WidgetBuilder/WidgetMetaEditor';

afterEach(cleanup);

function buildMeta(overrides: Partial<WidgetMeta> = {}): WidgetMeta {
  return {
    title: 'My Widget',
    slug: 'my-widget',
    description: '',
    icon: '',
    color: 'bg-blue-500',
    defaultWidth: 400,
    defaultHeight: 300,
    // Stored before the short-id migration — should resolve to canonical "high".
    buildings: ['orono-high-school'],
    accessLevel: 'admin',
    betaUsers: [],
    ...overrides,
  };
}

describe('WidgetMetaEditor — building id canonicalization', () => {
  it('shows a legacy-id-assigned building as checked', () => {
    render(<WidgetMetaEditor meta={buildMeta()} onChange={vi.fn()} />);

    expect(
      screen.getByRole('checkbox', { name: 'Orono High School' })
    ).toBeChecked();
  });

  it('fully unassigns a legacy-id building on toggle instead of adding a duplicate canonical id', () => {
    const onChange = vi.fn();
    render(<WidgetMetaEditor meta={buildMeta()} onChange={onChange} />);

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Orono High School' })
    );

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ buildings: [] })
    );
  });
});
