// Mentoring fixtures for /teams-mentoring-dev, built from the approved mockup's sample data.

import { MOCK_NOW, PAIRS } from '@/components/plc/redesignMockup/fixtures';
import type {
  MentoringCheckIn,
  MentoringTask,
  MentoringWorkspace,
  Plc,
  PlcMember,
} from '@/types';
import type { MentoringProgramData } from '../useMentoringProgram';

const at = (month: number, day: number, hour = 15): number =>
  new Date(2026, month - 1, day, hour).getTime();

export const FIXTURE_NOW = MOCK_NOW;

const uidOf = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, '-');

const member = (
  name: string,
  role: PlcMember['role'],
  mentorRole?: PlcMember['mentorRole']
): PlcMember => ({
  uid: uidOf(name),
  email: `${uidOf(name)}@example.com`,
  displayName: name,
  role,
  joinedAt: at(8, 20),
  status: 'active',
  ...(mentorRole ? { mentorRole } : {}),
});

const members: PlcMember[] = [
  member('Laura Benson', 'lead'),
  member('Tom Reyes', 'coLead'),
  ...PAIRS.flatMap(([mentor, mentee]) => [
    member(mentor, 'member', 'mentor'),
    member(mentee, 'member', 'mentee'),
  ]),
];

export const MENT_PLC: Plc = {
  id: 'ment-fixture',
  name: 'New Teacher Mentoring 2026-27',
  groupType: 'mentoring',
  members: Object.fromEntries(members.map((m) => [m.uid, m])),
  leadUid: uidOf('Laura Benson'),
  memberUids: members.map((m) => m.uid),
  memberEmails: Object.fromEntries(members.map((m) => [m.uid, m.email])),
  createdAt: at(8, 20),
  updatedAt: at(10, 6),
};

const task = (
  id: string,
  title: string,
  dueDate: string,
  submitter: MentoringTask['submitter'],
  instructions = ''
): MentoringTask => ({
  id,
  title,
  instructions,
  dueDate,
  submitter,
  templateDoc: {
    title,
    url: `https://docs.google.com/document/d/${id}-template-0000/edit`,
  },
  createdBy: uidOf('Laura Benson'),
  createdAt: at(8, 25),
  updatedAt: at(8, 25),
});

export const TASKS: MentoringTask[] = [
  task('goal', 'Goal-setting conference', '2026-09-30', 'both'),
  task(
    'obs',
    'Classroom observation reflection',
    '2026-10-24',
    'mentee',
    'After your mentor observes a lesson, write a one-page reflection: what you planned, what happened, and one change you will try. Share it with your mentor before you submit.'
  ),
  task('mid', 'Mid-year check-in', '2027-01-16', 'both'),
];

const docLink = (id: string, title: string, taskId?: string) => ({
  id,
  title,
  url: `https://docs.google.com/document/d/${id}-0000000000/edit`,
  ...(taskId ? { taskId } : {}),
  addedBy: uidOf('Laura Benson'),
  addedAt: at(9, 1),
});

/** Statuses as the mockup's tracker shows them. */
export const WORKSPACES: MentoringWorkspace[] = PAIRS.map(
  ([mentor, mentee], i) => {
    const taskStatus: MentoringWorkspace['taskStatus'] = {};
    const mark = (taskId: string, name: string, submittedAt: number) => {
      taskStatus[`${taskId}_${uidOf(name)}`] = {
        submittedAt,
        submittedBy: uidOf(name),
      };
    };
    if (i < 12) {
      const goalAt = i === 3 ? at(10, 2) : at(9, 24 + (i % 6));
      mark('goal', mentor, goalAt - 3_600_000);
      mark('goal', mentee, goalAt);
    }
    if (i < 3) mark('obs', mentee, at(10, 3 + i));
    return {
      id: `${uidOf(mentor)}_${uidOf(mentee)}`,
      mentorUid: uidOf(mentor),
      menteeUid: uidOf(mentee),
      memberUids: [uidOf(mentor), uidOf(mentee)],
      mentorName: mentor,
      menteeName: mentee,
      actionItems: [],
      docs: [],
      taskStatus,
      createdAt: at(8, 25),
      updatedAt: at(10, 6),
    };
  }
);

const DANA = uidOf('Dana Whitfield');
const MARCUS = uidOf('Marcus Lee');

/** Dana and Marcus as the workspace and hub screens show them. */
export const FIRST_PAIR: MentoringWorkspace = {
  ...WORKSPACES[0],
  taskStatus: {
    [`goal_${DANA}`]: { submittedAt: at(9, 29, 10), submittedBy: DANA },
    [`goal_${MARCUS}`]: { submittedAt: at(9, 29), submittedBy: MARCUS },
  },
  actionItems: [
    {
      id: 'a1',
      text: 'Try a 2-minute entry routine',
      done: false,
      assigneeUid: MARCUS,
      dueAt: at(10, 10),
      createdBy: DANA,
      createdAt: at(10, 6),
    },
    {
      id: 'a2',
      text: 'Share seating chart examples',
      done: false,
      assigneeUid: DANA,
      dueAt: at(10, 8),
      createdBy: DANA,
      createdAt: at(10, 6),
    },
    {
      id: 'a3',
      text: 'Book observation date',
      done: true,
      assigneeUid: MARCUS,
      dueAt: at(10, 6),
      doneAt: at(10, 6),
      createdBy: MARCUS,
      createdAt: at(9, 29),
    },
  ],
  docs: [
    docLink('goals', 'Professional goals 2026-27'),
    docLink('obs-copy', 'Observation reflection (template)', 'obs'),
    docLink('parents', 'Parent communication log'),
    docLink('mid-copy', 'Mid-year check-in (template)', 'mid'),
  ],
};

export const CHECK_INS: MentoringCheckIn[] = [
  ['c3', 'Check-in Oct 6', 'Classroom routines, goal progress', at(10, 6)],
  ['c2', 'Check-in Sep 29', 'Goal-setting conference', at(9, 29)],
  ['c1', 'Check-in Sep 15', 'First weeks, parent emails', at(9, 15)],
].map(([id, title, summary, when]) => ({
  id: id as string,
  title: title as string,
  body: `## Check-in\n${summary as string}\n\n## Goal progress\n\n## Next steps\n`,
  createdBy: DANA,
  createdByName: 'Dana Whitfield',
  createdAt: when as number,
  updatedAt: when as number,
}));

export const VIEWER = { lead: uidOf('Laura Benson'), member: MARCUS };

export function programData(lead: boolean): MentoringProgramData {
  const workspaces = [FIRST_PAIR, ...WORKSPACES.slice(1)];
  return {
    uid: lead ? VIEWER.lead : VIEWER.member,
    tasks: TASKS,
    workspaces: lead ? workspaces : [FIRST_PAIR],
    mine: lead ? [] : [FIRST_PAIR],
    now: FIXTURE_NOW,
    loading: false,
  };
}

/** The tracker reproduces the mockup's per-pair dates exactly. */
export function trackerData(): MentoringProgramData {
  return { ...programData(true), workspaces: WORKSPACES };
}

export const RESOURCES = [
  'Mentoring handbook',
  'Observation protocol',
  'Danielson framework summary',
  'Sub request for release time',
].map((title) => ({ id: uidOf(title), title, url: 'https://example.com' }));
