import { describe, it, expect } from 'vitest';
import type { ClassRoster } from '@/types';
import { EMPTY_ASSIGN_TARGETING_VALUE } from '@/utils/studentTargetRef';
import { buildWritingAssignSubmission } from './writingAssign';

const roster = (id: string, classId: string, name: string): ClassRoster => ({
  id,
  name,
  driveFileId: null,
  studentCount: 1,
  createdAt: 0,
  classlinkClassId: classId,
  students: [
    {
      id: `${id}-s`,
      firstName: 'Avery',
      lastName: 'S',
      pin: '1',
      classLinkSourcedId: `SID-${id}`,
    },
  ],
});

const ROSTERS = [
  roster('r1', 'cl-1', 'Period 1'),
  roster('r2', 'cl-2', 'Period 2'),
  { ...roster('r3', 'cl-3', 'Broken'), loadError: 'gone' } as ClassRoster,
];

const SETTINGS = {
  allowPaste: false,
  recordingNotice: true,
  studentCanViewRecord: false,
  spellCheck: true,
  timeLimitMinutes: 40,
  tabWarningsEnabled: true,
  focusLevel: 'lock' as const,
  blockPrint: false,
};

describe('buildWritingAssignSubmission', () => {
  it('maps classes, windows, per-class due dates and settings onto the callable input', () => {
    const out = buildWritingAssignSubmission({
      itemId: 'w1',
      rosters: ROSTERS,
      classes: { classIds: ['r1', 'r2', 'r3'], studentsByClass: {} },
      targeting: { ...EMPTY_ASSIGN_TARGETING_VALUE, dueAt: 9_000 },
      dueAtByRosterId: { r1: 8_000, r2: 9_000 },
      settings: SETTINGS,
    });
    expect(out.rosterIds).toEqual(['r1', 'r2']);
    expect(out.input).toMatchObject({
      itemId: 'w1',
      classIds: ['cl-1', 'cl-2'],
      dueAt: 9_000,
      dueAtByClassId: { 'cl-1': 8_000, 'cl-2': 9_000 },
      allowPaste: false,
      recordingNotice: true,
      spellCheck: true,
      timeLimitMinutes: 40,
      tabWarningsEnabled: true,
      focusLevel: 'lock',
    });
    expect(out.input).not.toHaveProperty('blockPrint');
  });

  it('leaves out an unset time limit', () => {
    const out = buildWritingAssignSubmission({
      itemId: 'w1',
      rosters: ROSTERS,
      classes: { classIds: ['r1'], studentsByClass: {} },
      targeting: EMPTY_ASSIGN_TARGETING_VALUE,
      settings: { ...SETTINGS, timeLimitMinutes: null },
    });
    expect(out.input).not.toHaveProperty('timeLimitMinutes');
    expect(out.input).not.toHaveProperty('dueAtByClassId');
    expect(out.input.dueAt).toBeNull();
  });
});
