import { describe, it, expect } from 'vitest';
import {
  buildAssignCreateOptions,
  buildAssignedWidgetConfig,
  buildAssignQuizRef,
  buildAssignSessionTargets,
  buildAssignSettings,
  buildAssignTargetsCall,
  resolveAssignTargeting,
} from '@/hooks/quizAssign/builders';
import {
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';
import type {
  ClassRoster,
  PlcLinkage,
  QuizConfig,
  QuizQuestion,
  QuizSessionOptions,
  QuizStimulus,
  Student,
  StudentTargetRef,
} from '@/types';

const student = (id: string, sourcedId?: string): Student => ({
  id,
  firstName: id,
  lastName: 'Kid',
  pin: '01',
  ...(sourcedId ? { classLinkSourcedId: sourcedId } : {}),
});

const roster = (
  id: string,
  extra: Partial<ClassRoster>,
  students: Student[]
): ClassRoster => ({ id, name: id, students, ...extra }) as ClassRoster;

const ROSTERS: ClassRoster[] = [
  roster('r1', { classlinkClassId: 'cl-1' }, [
    student('s1', 'SID-1'),
    student('s2', 'SID-2'),
  ]),
  roster('r2', { classlinkClassId: 'cl-2' }, [student('s4', 'SID-4')]),
  roster('r3', { testClassId: 'demo' }, [student('t1')]),
];

const ref = (sourcedId: string): StudentTargetRef => ({
  kind: 'classlink',
  sourcedId,
});

const QUESTIONS: QuizQuestion[] = [
  {
    id: 'q1',
    type: 'MC',
    text: 'What is 2 + 2?',
    timeLimit: 30,
    correctAnswer: '4',
    incorrectAnswers: ['3', '5', '22'],
  },
  {
    id: 'q2',
    type: 'MC',
    text: 'Capital of France?',
    timeLimit: 0,
    correctAnswer: 'Paris',
    incorrectAnswers: ['London', 'Berlin', 'Paris'],
  },
];

const targeting = (
  patch: Partial<AssignTargetingValue> = {}
): AssignTargetingValue => ({ ...EMPTY_ASSIGN_TARGETING_VALUE, ...patch });

const SESSION_OPTIONS = { showResultToStudent: true } as QuizSessionOptions;
const PLC = { id: 'plc-1', name: 'Math PLC' } as PlcLinkage;

describe('resolveAssignTargeting', () => {
  it('leaves a class-wide assign outside the stepper with no mixed targeting', () => {
    const out = resolveAssignTargeting({
      questions: QUESTIONS,
      assignQuestions: QUESTIONS,
      targeting: targeting(),
      stepperClasses: undefined,
      rosters: ROSTERS,
      rosterIds: ['r1'],
    });
    expect(out.mixedTargeting).toBeUndefined();
    expect(out.warnings).toEqual([]);
    expect(out.resolvedTargeting.targetMode).toBe('class');
    expect(out.resolvedTargeting.overridesByKey).toEqual({});
  });

  it('turns hidden option ids into option text', () => {
    const out = resolveAssignTargeting({
      questions: QUESTIONS,
      assignQuestions: QUESTIONS,
      targeting: targeting({
        targetMode: 'students',
        targetStudents: [ref('SID-1')],
        overridesByKey: {
          'classlink:SID-1': {
            hiddenOptionIdsByQuestion: { q1: ['q1-incorrect-0'] },
          },
        },
      }),
      stepperClasses: undefined,
      rosters: ROSTERS,
      rosterIds: ['r1'],
    });
    expect(
      out.resolvedTargeting.overridesByKey['classlink:SID-1']
        .hiddenOptionIdsByQuestion
    ).toEqual({ q1: ['3'] });
    expect(out.warnings).toEqual([]);
  });

  it('returns a warning for an option that duplicates the correct answer', () => {
    const out = resolveAssignTargeting({
      questions: QUESTIONS,
      assignQuestions: QUESTIONS,
      targeting: targeting({
        targetMode: 'students',
        targetStudents: [ref('SID-1')],
        overridesByKey: {
          'classlink:SID-1': {
            hiddenOptionIdsByQuestion: { q2: ['q2-incorrect-2'] },
          },
        },
      }),
      stepperClasses: undefined,
      rosters: ROSTERS,
      rosterIds: ['r1'],
    });
    expect(out.warnings).toHaveLength(1);
    expect(
      out.resolvedTargeting.overridesByKey['classlink:SID-1']
        ?.hiddenOptionIdsByQuestion
    ).toBeUndefined();
  });

  it('reads hidden option ids from the quiz but answer choices from the assigned questions', () => {
    const drawn: QuizQuestion[] = [
      { ...QUESTIONS[0], id: 'drawn-1', incorrectAnswers: ['a', 'b', 'c'] },
    ];
    const out = resolveAssignTargeting({
      questions: QUESTIONS,
      assignQuestions: drawn,
      targeting: targeting({
        targetMode: 'students',
        targetStudents: [ref('SID-1'), ref('SID-2')],
        overridesByKey: {
          'classlink:SID-1': { answerChoices: 3 },
          'classlink:SID-2': {
            hiddenOptionIdsByQuestion: { q1: ['q1-incorrect-1'] },
          },
        },
      }),
      stepperClasses: undefined,
      rosters: ROSTERS,
      rosterIds: ['r1'],
    });
    const hidden =
      out.resolvedTargeting.overridesByKey['classlink:SID-1']
        .hiddenOptionIdsByQuestion;
    expect(Object.keys(hidden ?? {})).toEqual(['drawn-1']);
    expect(hidden?.['drawn-1']).toHaveLength(1);
    expect(
      out.resolvedTargeting.overridesByKey['classlink:SID-2']
        .hiddenOptionIdsByQuestion
    ).toEqual({ q1: ['5'] });
  });

  it('keeps a stepper assign of whole classes as class targeting', () => {
    const out = resolveAssignTargeting({
      questions: QUESTIONS,
      assignQuestions: QUESTIONS,
      targeting: targeting(),
      stepperClasses: { classIds: ['r1'], studentsByClass: {} },
      rosters: ROSTERS,
      rosterIds: ['r1'],
    });
    expect(out.mixedTargeting?.studentTargetClassIds).toEqual([]);
    expect(out.resolvedTargeting).toBe(out.mixedTargeting?.targeting);
    expect(out.resolvedTargeting.targetMode).toBe('class');
  });

  it('narrows a stepper class to its picked students', () => {
    const out = resolveAssignTargeting({
      questions: QUESTIONS,
      assignQuestions: QUESTIONS,
      targeting: targeting(),
      stepperClasses: {
        classIds: ['r1', 'r2'],
        studentsByClass: { r1: [ref('SID-1')] },
      },
      rosters: ROSTERS,
      rosterIds: ['r1', 'r2'],
    });
    expect(out.mixedTargeting?.studentTargetClassIds).toEqual(['cl-1']);
    expect(out.resolvedTargeting.targetStudents).toEqual([ref('SID-1')]);
  });

  it('uses the stepper classes, not rosterIds, when both are given', () => {
    const out = resolveAssignTargeting({
      questions: QUESTIONS,
      assignQuestions: QUESTIONS,
      targeting: targeting(),
      stepperClasses: {
        classIds: ['r1'],
        studentsByClass: { r1: [ref('SID-2')] },
      },
      rosters: ROSTERS,
      rosterIds: ['r2'],
    });
    expect(out.resolvedTargeting.targetStudents).toEqual([ref('SID-2')]);
  });
});

describe('buildAssignSessionTargets', () => {
  const bellWindow = () => ({ openAt: 1_000, closeAt: 2_000 });
  const base = {
    rosters: ROSTERS,
    periodPlan: undefined,
    sharedWindow: {},
    manualStart: undefined,
  };

  it('derives class ids from the picked rosters only', () => {
    const out = buildAssignSessionTargets({
      ...base,
      mode: 'student',
      rosterIds: ['r1', 'r3'],
      bellWindow: undefined,
    });
    expect(out.derived.classIds).toEqual(['cl-1', 'demo']);
    expect(out.derived.rosterIds).toEqual(['r1', 'r3']);
    expect(out.derived.classPeriodByClassId).toEqual({
      'cl-1': 'r1',
      demo: 'r3',
    });
  });

  it('has no gate without a bell schedule or a manual start', () => {
    const out = buildAssignSessionTargets({
      ...base,
      mode: 'student',
      rosterIds: ['r1', 'r2'],
      bellWindow: undefined,
    });
    expect(out.periodGate).toBeUndefined();
    expect(out.sessionPeriodAccess).toBeNull();
  });

  it('gates each of two periods when the teacher has a bell schedule', () => {
    const out = buildAssignSessionTargets({
      ...base,
      mode: 'student',
      rosterIds: ['r1', 'r2'],
      bellWindow,
    });
    expect(out.periodGate?.accessMode).toBe('assessment');
    expect(Object.keys(out.sessionPeriodAccess ?? {})).toEqual([
      'cl-1',
      'cl-2',
    ]);
    expect(out.sessionPeriodAccess).toBe(out.periodGate?.periodAccess);
  });

  it('gates a single class for a manual start', () => {
    const out = buildAssignSessionTargets({
      ...base,
      mode: 'student',
      rosterIds: ['r1'],
      bellWindow: undefined,
      manualStart: true,
    });
    expect(out.sessionPeriodAccess?.['cl-1']).toMatchObject({
      state: 'closed',
    });
  });

  it('never gates a session that is not student-paced', () => {
    const out = buildAssignSessionTargets({
      ...base,
      mode: 'teacher',
      rosterIds: ['r1', 'r2'],
      bellWindow,
      manualStart: true,
    });
    expect(out.periodGate).toBeUndefined();
    expect(out.sessionPeriodAccess).toBeNull();
    expect(out.derived.classIds).toEqual(['cl-1', 'cl-2']);
  });
});

describe('buildAssignQuizRef', () => {
  const meta = { id: 'quiz-1', title: 'Library title' };

  it('carries only the required fields for a plain quiz', () => {
    expect(
      buildAssignQuizRef({
        meta,
        data: {},
        driveFileId: 'drive-1',
        questions: QUESTIONS,
        stimuli: undefined,
      })
    ).toEqual({
      id: 'quiz-1',
      title: 'Library title',
      driveFileId: 'drive-1',
      questions: QUESTIONS,
    });
  });

  it('adds stimuli, language, and order with sections when present', () => {
    const stimuli = [{ id: 'st-1' }] as QuizStimulus[];
    const order = [{ kind: 'question' as const, id: 'q1' }];
    const sections = [{ id: 'sec-1', title: 'Part A' }];
    const out = buildAssignQuizRef({
      meta,
      data: {
        language: 'es',
        order: order,
        sections: sections,
      },
      driveFileId: 'drive-1',
      questions: QUESTIONS,
      stimuli,
    });
    expect(out.stimuli).toBe(stimuli);
    expect(out.language).toBe('es');
    expect(out.order).toBe(order);
    expect(out.sections).toBe(sections);
  });

  it('drops the order when the quiz has no sections', () => {
    const out = buildAssignQuizRef({
      meta,
      data: { order: [{ kind: 'question', id: 'q1' }] as never, sections: [] },
      driveFileId: 'drive-1',
      questions: QUESTIONS,
      stimuli: undefined,
    });
    expect('order' in out).toBe(false);
    expect('sections' in out).toBe(false);
  });
});

describe('buildAssignSettings', () => {
  const base = {
    mode: 'student' as const,
    sessionOptions: SESSION_OPTIONS,
    attemptLimit: 1,
    dueAt: null,
    dueAtByRosterId: undefined,
    plcOptions: { plcMode: false },
    plcLinkage: undefined,
    resolvedDriveFileId: undefined,
    frozenDriveFileId: undefined,
  };

  it('writes undefined for the due date fields when there is no due date', () => {
    const out = buildAssignSettings(base);
    expect(out).toEqual({
      sessionMode: 'student',
      sessionOptions: SESSION_OPTIONS,
      attemptLimit: 1,
      dueAt: undefined,
      dueAtHasTime: undefined,
      teacherName: undefined,
      periodName: undefined,
      periodNames: undefined,
      plc: undefined,
    });
    expect('dueAtByRosterId' in out).toBe(false);
    expect('resolvedDriveFileId' in out).toBe(false);
    expect('frozenDriveFileId' in out).toBe(false);
  });

  it('marks a due date as having a time, including one at 0', () => {
    expect(buildAssignSettings({ ...base, dueAt: 5_000 })).toMatchObject({
      dueAt: 5_000,
      dueAtHasTime: true,
    });
    expect(buildAssignSettings({ ...base, dueAt: 0 })).toMatchObject({
      dueAt: 0,
      dueAtHasTime: true,
    });
  });

  it('takes the first period name ahead of the legacy single name', () => {
    const out = buildAssignSettings({
      ...base,
      plcOptions: {
        plcMode: true,
        teacherName: 'Ms. A',
        periodName: 'Legacy',
        periodNames: ['P1', 'P2'],
      },
      plcLinkage: PLC,
    });
    expect(out.teacherName).toBe('Ms. A');
    expect(out.periodName).toBe('P1');
    expect(out.periodNames).toEqual(['P1', 'P2']);
    expect(out.plc).toBe(PLC);
  });

  it('falls back to the legacy period name when the list is empty or missing', () => {
    expect(
      buildAssignSettings({
        ...base,
        plcOptions: { plcMode: false, periodName: 'Legacy', periodNames: [] },
      }).periodName
    ).toBe('Legacy');
    expect(
      buildAssignSettings({
        ...base,
        plcOptions: { plcMode: false, periodName: 'Legacy' },
      }).periodName
    ).toBe('Legacy');
  });

  it('adds per-class due dates and the Drive copies only when given', () => {
    const out = buildAssignSettings({
      ...base,
      dueAtByRosterId: { r1: 9 },
      resolvedDriveFileId: 'resolved-1',
      frozenDriveFileId: 'frozen-1',
    });
    expect(out.dueAtByRosterId).toEqual({ r1: 9 });
    expect(out.resolvedDriveFileId).toBe('resolved-1');
    expect(out.frozenDriveFileId).toBe('frozen-1');
  });
});

describe('buildAssignCreateOptions', () => {
  const derived = {
    classIds: ['cl-1'],
    rosterIds: ['r1'],
    classPeriodByClassId: { 'cl-1': 'r1' },
  };
  const base = {
    widgetKind: 'quiz' as const,
    assignmentMode: 'submissions' as const,
    mode: 'student' as const,
    now: 1_000,
    stepper: undefined,
    rosters: ROSTERS,
    rosterIds: ['r1'],
    derived,
    periodGate: undefined,
    sessionPeriodAccess: null,
    resolvedTargeting: targeting(),
    dueAt: null,
    dueAtByRosterId: undefined,
    sessionBankSlots: undefined,
    paperWritten: null,
    plcLinkage: undefined,
    plcPoolSyncGroupId: undefined,
    plcTemplateSyncGroupId: undefined,
    districtCopy: false,
    translationIndex: undefined,
  };

  it('builds the minimal options for a plain class assign', () => {
    expect(buildAssignCreateOptions(base)).toEqual({
      widgetKind: 'quiz',
      initialStatus: 'paused',
      classIds: ['cl-1'],
      rosterIds: ['r1'],
      classPeriodByClassId: { 'cl-1': 'r1' },
      mode: 'submissions',
      targetGroupIds: [],
      overridesBySourcedId: {},
      openAt: null,
      closeAt: null,
      lenientTranslatedFib: true,
    });
  });

  it('starts a per-period session active and carries its gate', () => {
    const periodAccess = { 'cl-1': { state: 'closed' } } as never;
    const out = buildAssignCreateOptions({
      ...base,
      periodGate: { accessMode: 'assessment', periodAccess },
      sessionPeriodAccess: periodAccess,
    });
    expect(out.initialStatus).toBe('active');
    expect(out.accessMode).toBe('assessment');
    expect(out.periodAccess).toBe(periodAccess);
  });

  it('starts a scheduled stepper assign active only when it opens after now', () => {
    const scheduled = {
      ...base,
      stepper: { manualStart: false },
      resolvedTargeting: targeting({ openAt: 2_000 }),
    };
    expect(buildAssignCreateOptions(scheduled).initialStatus).toBe('active');
    expect(
      buildAssignCreateOptions({ ...scheduled, now: 2_000 }).initialStatus
    ).toBe('paused');
    expect(
      buildAssignCreateOptions({
        ...scheduled,
        resolvedTargeting: targeting(),
      }).initialStatus
    ).toBe('paused');
  });

  it('keeps a later open time paused outside the stepper, on manual start, with no class, or off student pacing', () => {
    const later = { ...base, resolvedTargeting: targeting({ openAt: 2_000 }) };
    expect(buildAssignCreateOptions(later).initialStatus).toBe('paused');
    expect(
      buildAssignCreateOptions({ ...later, stepper: { manualStart: true } })
        .initialStatus
    ).toBe('paused');
    expect(
      buildAssignCreateOptions({
        ...later,
        stepper: { manualStart: false },
        rosterIds: [],
      }).initialStatus
    ).toBe('paused');
    expect(
      buildAssignCreateOptions({
        ...later,
        stepper: { manualStart: false },
        mode: 'teacher',
      }).initialStatus
    ).toBe('paused');
  });

  it('copies the targeting window, groups, overrides and work kind', () => {
    const overridesByKey = { 'classlink:SID-1': { readAloud: true } };
    const out = buildAssignCreateOptions({
      ...base,
      resolvedTargeting: targeting({
        targetGroupIds: ['g1'],
        overridesByKey,
        openAt: 10,
        closeAt: 20,
        workKind: 'resource',
      }),
    });
    expect(out.targetGroupIds).toEqual(['g1']);
    expect(out.overridesBySourcedId).toBe(overridesByKey);
    expect(out.openAt).toBe(10);
    expect(out.closeAt).toBe(20);
    expect(out.workKind).toBe('resource');
    expect('targetMode' in out).toBe(false);
  });

  it('marks a manual start late-able only with a due date and no close time', () => {
    const manual = { ...base, stepper: { manualStart: true }, dueAt: 50 };
    expect(buildAssignCreateOptions(manual).manualLate).toBe(true);
    expect(
      'manualLate' in buildAssignCreateOptions({ ...manual, dueAt: null })
    ).toBe(false);
    expect(
      'manualLate' in
        buildAssignCreateOptions({
          ...manual,
          resolvedTargeting: targeting({ closeAt: 99 }),
        })
    ).toBe(false);
    expect(
      'manualLate' in
        buildAssignCreateOptions({
          ...manual,
          stepper: { manualStart: false },
        })
    ).toBe(false);
  });

  it('tags a staff audience and nothing for students', () => {
    expect(
      buildAssignCreateOptions({
        ...base,
        stepper: { manualStart: false, audience: 'staff' },
      }).audience
    ).toBe('staff');
    expect(
      'audience' in
        buildAssignCreateOptions({
          ...base,
          stepper: { manualStart: false, audience: 'students' },
        })
    ).toBe(false);
  });

  it('maps per-roster due dates onto class ids across every roster', () => {
    const out = buildAssignCreateOptions({
      ...base,
      dueAtByRosterId: { r1: 7, r3: 8 },
    });
    expect(out.dueAtByClassId).toEqual({ 'cl-1': 7, demo: 8 });
  });

  it('adds bank slots, the written batch and translations only when present', () => {
    const bankSlots = [{ slotId: 'slot-1' }] as never;
    const paperWritten = { batchId: 'b1', questionIds: ['q1'], seats: 3 };
    const translationIndex = { es: {} } as never;
    const out = buildAssignCreateOptions({
      ...base,
      sessionBankSlots: bankSlots,
      paperWritten,
      translationIndex,
    });
    expect(out.bankSlots).toBe(bankSlots);
    expect(out.paperWritten).toBe(paperWritten);
    expect(out.translationIndex).toBe(translationIndex);
  });

  it('writes the PLC pool group only alongside a PLC linkage', () => {
    expect(
      'plcPoolSyncGroupId' in
        buildAssignCreateOptions({ ...base, plcPoolSyncGroupId: 'pool-1' })
    ).toBe(false);
    expect(
      buildAssignCreateOptions({
        ...base,
        plcLinkage: PLC,
        plcPoolSyncGroupId: 'pool-1',
      }).plcPoolSyncGroupId
    ).toBe('pool-1');
  });

  it('carries the template group, and skips the template for a District copy', () => {
    const out = buildAssignCreateOptions({
      ...base,
      plcTemplateSyncGroupId: 'group-1',
      districtCopy: true,
    });
    expect(out.plcTemplateSyncGroupId).toBe('group-1');
    expect(out.skipPlcTemplateWrite).toBe(true);
    const plain = buildAssignCreateOptions(base);
    expect('plcTemplateSyncGroupId' in plain).toBe(false);
    expect('skipPlcTemplateWrite' in plain).toBe(false);
  });

  it('passes the widget kind and assignment mode through', () => {
    const out = buildAssignCreateOptions({
      ...base,
      widgetKind: 'review',
      assignmentMode: 'view-only',
    });
    expect(out.widgetKind).toBe('review');
    expect(out.mode).toBe('view-only');
  });
});

describe('buildAssignTargetsCall', () => {
  it('needs no call for a plain class-wide assign', () => {
    expect(
      buildAssignTargetsCall({
        assignmentId: 'a1',
        mixedTargeting: undefined,
        resolvedTargeting: targeting(),
      })
    ).toBeNull();
  });

  it('builds the call for individually targeted students', () => {
    const out = buildAssignTargetsCall({
      assignmentId: 'a1',
      mixedTargeting: undefined,
      resolvedTargeting: targeting({
        targetMode: 'students',
        targetStudents: [ref('SID-1')],
        overridesByKey: { 'classlink:SID-1': { readAloud: true } },
      }),
    });
    expect(out).toEqual({
      assignmentId: 'a1',
      kind: 'quiz',
      sessionId: 'a1',
      targetMode: 'students',
      add: [ref('SID-1')],
      remove: [],
      overridesBySourcedId: { 'classlink:SID-1': { readAloud: true } },
      window: {},
    });
  });

  it('sends skipped students as excluded targets', () => {
    const out = buildAssignTargetsCall({
      assignmentId: 'a1',
      mixedTargeting: undefined,
      resolvedTargeting: targeting({
        targetMode: 'students',
        targetStudents: [ref('SID-1')],
        excludedStudents: [ref('SID-2')],
      }),
    });
    expect(out?.excludedTargets).toEqual([ref('SID-2')]);
  });

  it('uses the mixed payload for a stepper assign and sends the narrowed classes', () => {
    const out = buildAssignTargetsCall({
      assignmentId: 'a1',
      mixedTargeting: {
        targeting: targeting({
          targetMode: 'students',
          targetStudents: [ref('SID-1')],
        }),
        studentTargetClassIds: ['cl-1'],
      },
      resolvedTargeting: targeting(),
    });
    expect(out?.targetMode).toBe('class');
    expect(out?.add).toEqual([ref('SID-1')]);
    expect(out?.studentTargetClassIds).toEqual(['cl-1']);
  });

  it('needs no call for a stepper assign of whole classes', () => {
    expect(
      buildAssignTargetsCall({
        assignmentId: 'a1',
        mixedTargeting: {
          targeting: targeting(),
          studentTargetClassIds: [],
        },
        resolvedTargeting: targeting(),
      })
    ).toBeNull();
  });
});

describe('buildAssignedWidgetConfig', () => {
  const config = {
    view: 'manager',
    managerTab: 'library',
    selectedQuizId: null,
    selectedQuizTitle: null,
    activeAssignmentId: null,
    lastRosterIdsByQuizId: { 'quiz-1': ['old'], other: ['r9'] },
  } as unknown as QuizConfig;
  const meta = { id: 'quiz-1', title: 'Library title' };

  it('moves to the Assigned tab and remembers the picked classes', () => {
    const out = buildAssignedWidgetConfig({
      config,
      meta,
      assignmentId: 'a1',
      plcOptions: {
        plcMode: true,
        teacherName: 'Ms. A',
        periodName: 'Legacy',
        periodNames: ['P1', 'P2'],
      },
      rosterIds: ['r1', 'r2'],
    });
    expect(out).toMatchObject({
      view: 'manager',
      managerTab: 'active',
      selectedQuizId: 'quiz-1',
      selectedQuizTitle: 'Library title',
      activeAssignmentId: 'a1',
      plcMode: true,
      teacherName: 'Ms. A',
      periodName: 'P1',
      periodNames: ['P1', 'P2'],
      lastRosterIdsByQuizId: { 'quiz-1': ['r1', 'r2'], other: ['r9'] },
    });
  });

  it('forgets the quiz when no class was picked, and blanks missing PLC fields', () => {
    const out = buildAssignedWidgetConfig({
      config,
      meta,
      assignmentId: 'a1',
      plcOptions: { plcMode: false },
      rosterIds: [],
    });
    expect(out.lastRosterIdsByQuizId).toEqual({ other: ['r9'] });
    expect(out.teacherName).toBe('');
    expect(out.periodName).toBe('');
    expect(out.periodNames).toEqual([]);
  });

  it('starts a map when the config has none and leaves the input untouched', () => {
    const bare = { view: 'manager' } as unknown as QuizConfig;
    const out = buildAssignedWidgetConfig({
      config: bare,
      meta,
      assignmentId: 'a1',
      plcOptions: { plcMode: false, periodName: 'Legacy' },
      rosterIds: ['r1'],
    });
    expect(out.lastRosterIdsByQuizId).toEqual({ 'quiz-1': ['r1'] });
    expect(out.periodName).toBe('Legacy');
    expect(bare.lastRosterIdsByQuizId).toBeUndefined();
    expect(config.lastRosterIdsByQuizId).toEqual({
      'quiz-1': ['old'],
      other: ['r9'],
    });
  });
});
