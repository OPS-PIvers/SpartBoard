import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Plc, PlcGroupType } from '@/types';
import { PlcSettingsTab } from './PlcSettingsTab';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1' },
    canAccessFeature: () => true,
  }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({
    updatePlcFeatures: vi.fn(),
    updatePlcDigestOptIn: vi.fn(),
  }),
}));
vi.mock('@/components/plc/settings/PlcMeetingCadenceSection', () => ({
  PlcMeetingCadenceSection: () => <div>Meeting schedule</div>,
}));
vi.mock('@/components/plc/norming/PlcNormingLevelsSection', () => ({
  PlcNormingLevelsSection: () => <div>Norming levels</div>,
}));
vi.mock('@/components/plc/settings/PlcGradebookSection', () => ({
  PlcGradebookSection: () => <div>Gradebook</div>,
}));
vi.mock('@/components/plc/teams/mentoring/MentoringPairingsSettings', () => ({
  MentoringPairingsSettings: () => null,
}));
vi.mock('@/components/plc/teams/building/TeamCalendarSettings', () => ({
  TeamCalendarSettings: () => null,
}));
vi.mock('@/components/plc/settings/PlcTrashBody', () => ({
  PlcTrashBody: () => null,
}));

const PLC_ONLY = [
  'Print response sheets for a teammate',
  'Meeting schedule',
  'Norming levels',
  'Gradebook',
];

const makePlc = (groupType: PlcGroupType) =>
  ({
    id: 'p1',
    name: 'Team',
    groupType,
    leadUid: 'u1',
    memberUids: ['u1'],
  }) as unknown as Plc;

describe('PlcSettingsTab team-type settings', () => {
  it('shows the assessment settings on a PLC team', () => {
    render(<PlcSettingsTab plc={makePlc('plc')} />);
    for (const label of PLC_ONLY) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it.each<PlcGroupType>(['department', 'building', 'mentoring'])(
    'hides the assessment settings on a %s team',
    (type) => {
      render(<PlcSettingsTab plc={makePlc(type)} />);
      for (const label of PLC_ONLY) {
        expect(screen.queryByText(label)).not.toBeInTheDocument();
      }
      expect(screen.getByText('Notifications')).toBeInTheDocument();
    }
  );

});
