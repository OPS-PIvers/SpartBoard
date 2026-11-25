import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { SettingsDrawer } from '@/components/settings/SettingsDrawer';
import type { ClassRoster, GlobalStyle, WidgetData } from '@/types';
import schema from './settings.schema';

const dashboardState: {
  activeRosterId: string | null;
  rosters: ClassRoster[];
} = { activeRosterId: null, rosters: [] };

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => dashboardState,
}));

// jsdom has no layout, so axe's color-contrast rule can only report "incomplete".
const STRUCTURAL_ONLY = { rules: { 'color-contrast': { enabled: false } } };

const widget = {
  id: 'w1',
  type: 'lunchCount',
  x: 0,
  y: 0,
  w: 600,
  h: 400,
  z: 1,
  flipped: false,
  config: {
    schoolSite: 'schumann-elementary',
    isManualMode: false,
    manualHotLunch: '',
    manualBentoBox: '',
    roster: [],
    assignments: {},
    rosterMode: 'class',
    lunchTimeHour: '11',
    lunchTimeMinute: '30',
    gradeLevel: '3',
    cardColor: '#ffffff',
    cardOpacity: 1,
  },
} as WidgetData;

describe('LunchCount settings drawer accessibility', () => {
  it('has no structural axe violations', async () => {
    const { baseElement } = render(
      <SettingsDrawer
        widget={widget}
        title="Lunch Count"
        placement="right"
        width={400}
        onWidthCommit={vi.fn()}
        onClose={vi.fn()}
        updateWidget={vi.fn()}
        updateConfig={vi.fn()}
        globalStyle={{ windowTransparency: 0.5 } as GlobalStyle}
        schema={schema}
      />
    );
    expect(await axe(baseElement, STRUCTURAL_ONLY)).toHaveNoViolations();
  });

  it('gives every field control an accessible name', () => {
    const { getByLabelText, getByRole } = render(
      <SettingsDrawer
        widget={widget}
        title="Lunch Count"
        placement="right"
        width={400}
        onWidthCommit={vi.fn()}
        onClose={vi.fn()}
        updateWidget={vi.fn()}
        updateConfig={vi.fn()}
        globalStyle={{ windowTransparency: 0.5 } as GlobalStyle}
        schema={schema}
      />
    );

    expect(getByLabelText('School Site')).toBeInTheDocument();
    expect(getByRole('group', { name: 'Lunch Time' })).toBeInTheDocument();
    expect(getByLabelText('Lunch hour')).toBeInTheDocument();
    expect(getByLabelText('Lunch minute')).toBeInTheDocument();
    expect(
      getByRole('radiogroup', { name: 'Grade Level' })
    ).toBeInTheDocument();
    expect(
      getByRole('group', { name: 'Roster Selection' })
    ).toBeInTheDocument();
    expect(getByRole('switch', { name: 'Manual Mode' })).toBeInTheDocument();
  });

  it('shows the manual-mode fields and hides the roster textarea when not in custom roster mode', () => {
    const manualWidget = {
      ...widget,
      config: { ...widget.config, isManualMode: true },
    } as WidgetData;
    const { getByLabelText, queryByLabelText } = render(
      <SettingsDrawer
        widget={manualWidget}
        title="Lunch Count"
        placement="right"
        width={400}
        onWidthCommit={vi.fn()}
        onClose={vi.fn()}
        updateWidget={vi.fn()}
        updateConfig={vi.fn()}
        globalStyle={{ windowTransparency: 0.5 } as GlobalStyle}
        schema={schema}
      />
    );

    expect(getByLabelText('Hot Lunch Name')).toBeInTheDocument();
    expect(getByLabelText('Bento Box Name')).toBeInTheDocument();
    expect(queryByLabelText('Custom Roster')).not.toBeInTheDocument();
  });

  it('shows the custom roster textarea in custom roster mode', () => {
    const customRosterWidget = {
      ...widget,
      config: { ...widget.config, rosterMode: 'custom' },
    } as WidgetData;
    const { getByLabelText } = render(
      <SettingsDrawer
        widget={customRosterWidget}
        title="Lunch Count"
        placement="right"
        width={400}
        onWidthCommit={vi.fn()}
        onClose={vi.fn()}
        updateWidget={vi.fn()}
        updateConfig={vi.fn()}
        globalStyle={{ windowTransparency: 0.5 } as GlobalStyle}
        schema={schema}
      />
    );

    expect(getByLabelText('Custom Roster')).toBeInTheDocument();
  });
});
