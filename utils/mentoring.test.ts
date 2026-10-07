import { describe, expect, it } from 'vitest';
import type { MentoringTask, MentoringWorkspace, Plc } from '@/types';
import {
  canSubmitTask,
  driveFileUrl,
  dueDeadline,
  httpsUrl,
  mentoringRoster,
  nextRequiredTask,
  pairTaskStatus,
  parseMentoringSubmission,
  parseMentoringTask,
  parseMentoringWorkspace,
  submissionIdFor,
  summarizeTask,
  toDateKey,
  workspaceIdFor,
} from './mentoring';

const at = (m: number, d: number, h = 12) =>
  new Date(2026, m - 1, d, h).getTime();

const task = (
  id: string,
  dueDate: string,
  submitter: MentoringTask['submitter'] = 'mentee'
): MentoringTask => ({
  id,
  title: id,
  instructions: '',
  dueDate,
  submitter,
  templateDoc: null,
  createdBy: 'lead',
  createdAt: 0,
  updatedAt: 0,
});

const ws = (
  taskStatus: MentoringWorkspace['taskStatus'] = {}
): MentoringWorkspace => ({
  id: 'm_e',
  mentorUid: 'm',
  menteeUid: 'e',
  memberUids: ['m', 'e'],
  mentorName: 'Mentor',
  menteeName: 'Mentee',
  actionItems: [],
  docs: [],
  taskStatus,
  createdAt: 0,
  updatedAt: 0,
});

describe('pairTaskStatus', () => {
  const t = task('goal', '2026-09-30');

  it('is not started before the due day ends, then late', () => {
    expect(pairTaskStatus(t, ws(), at(9, 30, 23)).kind).toBe('notStarted');
    expect(pairTaskStatus(t, ws(), at(10, 1, 0)).kind).toBe('late');
  });

  it('counts whole days late for a late submission', () => {
    const late = ws({ goal: { submittedAt: at(10, 2, 15), submittedBy: 'e' } });
    expect(pairTaskStatus(t, late, at(10, 7))).toEqual({
      kind: 'submitted',
      at: at(10, 2, 15),
      daysLate: 2,
    });
    const onTime = ws({ goal: { submittedAt: at(9, 29), submittedBy: 'e' } });
    expect(pairTaskStatus(t, onTime, at(10, 7))).toMatchObject({
      daysLate: 0,
    });
  });
});

describe('summarizeTask', () => {
  it('tallies submitted, late and not started across pairs', () => {
    const t = task('goal', '2026-09-30');
    const s = summarizeTask(
      t,
      [ws({ goal: { submittedAt: at(9, 29), submittedBy: 'e' } }), ws(), ws()],
      at(10, 7)
    );
    expect(s).toMatchObject({ submitted: 1, late: 2, notStarted: 0, total: 3 });
  });
});

describe('nextRequiredTask', () => {
  const tasks = [
    task('mid', '2027-01-16'),
    task('goal', '2026-09-30'),
    task('obs', '2026-10-24'),
  ];

  it('gives a pair its earliest unsubmitted task, overdue included', () => {
    const done = ws({ goal: { submittedAt: at(9, 29), submittedBy: 'e' } });
    expect(nextRequiredTask(tasks, at(10, 7), done)?.id).toBe('obs');
    expect(nextRequiredTask(tasks, at(10, 7), ws())?.id).toBe('goal');
  });

  it('gives facilitators the next task due, else the last one', () => {
    expect(nextRequiredTask(tasks, at(10, 7), null)?.id).toBe('obs');
    expect(
      nextRequiredTask(tasks, new Date(2027, 5, 1).getTime(), null)?.id
    ).toBe('mid');
    expect(nextRequiredTask([], at(10, 7), null)).toBeNull();
  });
});

describe('canSubmitTask', () => {
  it('follows who submits', () => {
    const w = ws();
    expect(canSubmitTask({ submitter: 'mentee' }, w, 'e')).toBe(true);
    expect(canSubmitTask({ submitter: 'mentee' }, w, 'm')).toBe(false);
    expect(canSubmitTask({ submitter: 'mentor' }, w, 'm')).toBe(true);
    expect(canSubmitTask({ submitter: 'both' }, w, 'm')).toBe(true);
    expect(canSubmitTask({ submitter: 'both' }, w, 'x')).toBe(false);
  });
});

describe('parsing', () => {
  it('rejects a task without a valid due date or submitter', () => {
    expect(parseMentoringTask('t', { title: 'x', dueDate: 'Oct 1' })).toBe(
      null
    );
    expect(
      parseMentoringTask('t', {
        title: 'x',
        dueDate: '2026-10-01',
        submitter: 'all',
      })
    ).toBeNull();
    expect(
      parseMentoringTask('t', {
        title: 'x',
        dueDate: '2026-10-01',
        submitter: 'both',
        templateDoc: { title: 'T', url: 'https://docs.google.com/d/1' },
      })?.templateDoc
    ).toEqual({ title: 'T', url: 'https://docs.google.com/d/1' });
  });

  it('derives memberUids from the pair, ignoring what is stored', () => {
    const w = parseMentoringWorkspace('id', {
      mentorUid: 'm',
      menteeUid: 'e',
      memberUids: ['m', 'e', 'intruder'],
      docs: [{ url: 'https://docs.google.com/d/1', title: 'Goals' }, 'junk'],
    });
    expect(w?.memberUids).toEqual(['m', 'e']);
    expect(w?.docs).toHaveLength(1);
  });

  it('keeps only https links from stored docs, templates and submissions', () => {
    const w = parseMentoringWorkspace('id', {
      mentorUid: 'm',
      menteeUid: 'e',
      docs: [
        { id: 'a', url: 'javascript:alert(1)' },
        { id: 'b', url: 'http://docs.google.com/d/1' },
        { id: 'c', url: 'data:text/html,x' },
        { id: 'd', url: 'https://docs.google.com/d/1' },
      ],
    });
    expect(w?.docs.map((d) => d.id)).toEqual(['d']);
    expect(
      parseMentoringTask('t', {
        title: 'x',
        dueDate: '2026-10-01',
        submitter: 'both',
        templateDoc: { title: 'T', url: 'javascript:alert(1)' },
      })?.templateDoc
    ).toBeNull();
    expect(
      parseMentoringSubmission('t', { submittedBy: 'e', docUrl: 'http://x' })
    ).not.toHaveProperty('docUrl');
    expect(httpsUrl(' https://docs.google.com/d ')).toBe(
      'https://docs.google.com/d'
    );
    expect(httpsUrl('https://')).toBeNull();
  });
});

describe('mentoringRoster', () => {
  it('lists only active members tagged mentor or mentee', () => {
    const plc = {
      members: {
        a: {
          uid: 'a',
          email: 'a@x',
          displayName: 'Ann',
          role: 'member',
          joinedAt: 0,
          status: 'active',
          mentorRole: 'mentor',
        },
        b: {
          uid: 'b',
          email: 'b@x',
          displayName: 'Bo',
          role: 'viewer',
          joinedAt: 0,
          status: 'active',
          mentorRole: 'mentee',
        },
        c: {
          uid: 'c',
          email: 'c@x',
          displayName: 'Cy',
          role: 'member',
          joinedAt: 0,
          status: 'removed',
          mentorRole: 'mentee',
        },
        d: {
          uid: 'd',
          email: 'd@x',
          displayName: 'Di',
          role: 'member',
          joinedAt: 0,
          status: 'active',
          mentorRole: 'mentee',
        },
      },
    } as unknown as Plc;
    const r = mentoringRoster(plc);
    expect(r.mentor.map((m) => m.uid)).toEqual(['a']);
    expect(r.mentee.map((m) => m.uid)).toEqual(['d']);
  });
});

describe('dates', () => {
  it('round-trips date keys and ends the due day at local midnight', () => {
    expect(toDateKey(at(10, 7))).toBe('2026-10-07');
    expect(dueDeadline('2026-09-30')).toBe(new Date(2026, 9, 1).getTime());
    expect(workspaceIdFor('m', 'e')).toBe('m_e');
  });
});

describe('drive links and submission ids', () => {
  it('links a picked file by type and keys submissions per submitter', () => {
    expect(
      driveFileUrl({
        id: 'a',
        mimeType: 'application/vnd.google-apps.document',
      })
    ).toBe('https://docs.google.com/document/d/a/edit');
    expect(driveFileUrl({ id: 'b', mimeType: 'application/pdf' })).toBe(
      'https://drive.google.com/file/d/b/view'
    );
    expect(submissionIdFor('t1', 'u1')).toBe('t1_u1');
  });
});
