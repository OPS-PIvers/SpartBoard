import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PlcTeamLayout } from '@/types';
import { BUILT_IN_TEAM_TYPE_PRESETS } from '@/config/teamTypePresets';
import { LayoutEditorView } from './LayoutEditorView';

const preset = BUILT_IN_TEAM_TYPE_PRESETS.plc;
const layout: PlcTeamLayout = {
  pages: preset.pages,
  landing: preset.landing,
  cards: preset.cards,
  hero: { mode: 'default' },
};

const renderEditor = (districtDefault: PlcTeamLayout | null) =>
  render(
    <LayoutEditorView
      groupType="plc"
      layout={layout}
      heroRule="latestAssessment"
      districtDefault={districtDefault}
      pinGroups={[]}
      isLead
      onSave={vi.fn()}
      onClose={vi.fn()}
    />
  );

describe('LayoutEditorView reset', () => {
  it('offers Reset when the district default is known', () => {
    renderEditor(layout);
    expect(
      screen.getByRole('button', { name: /Reset to district default/ })
    ).toBeTruthy();
  });

  it('hides Reset when the admin defaults could not be read', () => {
    renderEditor(null);
    expect(
      screen.queryByRole('button', { name: /Reset to district default/ })
    ).toBeNull();
  });
});
