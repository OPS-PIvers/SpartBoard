import { describe, expect, it } from 'vitest';
import { getVisiblePlcSections } from '@/components/plc/sections';
import type { Plc, PlcGroupType } from '@/types';

const plc = (groupType?: PlcGroupType, features?: Plc['features']): Plc => ({
  id: 'p1',
  name: 'Team',
  leadUid: 'u1',
  members: {},
  memberUids: ['u1'],
  memberEmails: {},
  createdAt: 0,
  updatedAt: 0,
  ...(groupType ? { groupType } : {}),
  ...(features ? { features } : {}),
});

const ids = (p: Plc) => getVisiblePlcSections(p).map((s) => s.id);

describe('section defaults by group type', () => {
  it('keeps every section for a legacy PLC and a department', () => {
    const all = [
      'home',
      'meeting',
      'assessments',
      'targets',
      'docs',
      'sharedBoards',
      'members',
      'resources',
      'settings',
    ];
    expect(ids(plc())).toEqual(all);
    expect(ids(plc('department'))).toEqual(all);
  });

  it.each(['mentoring', 'building'] as const)(
    'starts a %s group without Meeting, Assessments or Targets',
    (type) => {
      expect(ids(plc(type))).toEqual([
        'home',
        'docs',
        'sharedBoards',
        'members',
        'resources',
        'settings',
      ]);
    }
  );

  it('lets a mentoring group turn sections back on', () => {
    const visible = ids(plc('mentoring', { quizzes: true, meeting: true }));
    expect(visible).toContain('meeting');
    expect(visible).toContain('assessments');
  });

  it('lets a PLC turn Meeting Mode off', () => {
    expect(ids(plc('plc', { meeting: false }))).not.toContain('meeting');
  });
});
