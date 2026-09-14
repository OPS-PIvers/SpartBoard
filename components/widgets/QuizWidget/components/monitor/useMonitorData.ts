import { useEffect, useMemo, useState } from 'react';
import {
  QuizSession,
  QuizResponse,
  QuizData,
  QuizConfig,
  QuizQuestion,
  ClassRoster,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import type { FibGradingContext } from '@/utils/quizFibAnswers';
import { useAssignmentPseudonymsMulti } from '@/hooks/useAssignmentPseudonyms';
import { useLtiSessionNames } from '@/hooks/useLtiSessionNames';
import {
  buildPinToNameMap,
  canScoreResponse,
  getDisplayScore,
  getResponseScore,
  isResponseAwaitingGrade,
  isGamificationActive,
} from '@/components/widgets/QuizWidget/utils/quizScoreboard';
import {
  resolveResponseDisplayName,
  responseTeamId,
  findDuplicateResponseIds,
} from '@/components/widgets/QuizWidget/utils/resolveDisplayName';
import {
  NO_FLAGS,
  studentFlags,
  ProficiencyBand,
  proficiencyBand,
} from './monitorUtils';

export interface MonitorStudent {
  response: QuizResponse;
  key: string;
  name: string;
  /** Percentage band score for tint/filter; null when not scoreable. */
  bandScore: number | null;
  /** Display score (pts when gamified, else percent); null when not scoreable. */
  displayScore: number | null;
  /** `displayScore` is provisional — a written answer is still ungraded. */
  awaitingGrade: boolean;
  band: ProficiencyBand | null;
  tabWarnings: number;
  /** Minutes since the hand was raised; null when not raised. In-progress only. */
  hand: number | null;
  /** Minutes without an answer write past the threshold; null when active. */
  idle: number | null;
  duplicate: boolean;
  /** 1-based question the student is on (answers.length + 1, capped). */
  onQuestion: number;
}

export interface MonitorData {
  students: MonitorStudent[];
  byBucket: Record<'notStarted' | 'inProgress' | 'done', MonitorStudent[]>;
  counts: { notStarted: number; inProgress: number; done: number };
  handCount: number;
  idleCount: number;
  currentQ: QuizQuestion | undefined;
  answeredCurrent: number;
  totalStudents: number;
  isGamified: boolean;
  pinToName: Record<string, string>;
  byStudentUid: ReturnType<typeof useAssignmentPseudonymsMulti>['byStudentUid'];
  /** M17 E2 F2: `studentUid` -> namespaced `StudentTargetRef` key, used to
   *  resolve per-student tab-warning threshold overrides in `RosterList`. */
  targetRefKeyByStudentUid: ReturnType<
    typeof useAssignmentPseudonymsMulti
  >['targetRefKeyByStudentUid'];
  periodNames: string[];
  selectedPeriods: string[];
  setSelectedPeriods: (periods: string[]) => void;
  now: number;
}

const responseDocKey = (r: QuizResponse): string =>
  r._responseKey ?? r.studentUid;

export function useMonitorData(
  session: QuizSession,
  responses: QuizResponse[],
  quizData: QuizData,
  config: QuizConfig,
  rosters: ClassRoster[],
  /** Translated FIB answer keys + served-locale overrides from the assignment. */
  fibGrading?: FibGradingContext | null
): MonitorData {
  const { orgId } = useAuth();

  const pinToName = useMemo(
    () =>
      buildPinToNameMap(
        rosters,
        config.periodNames ?? (config.periodName ? [config.periodName] : [])
      ),
    [rosters, config.periodNames, config.periodName]
  );

  const sessionClassIds = useMemo(
    () =>
      session.classIds?.length
        ? session.classIds
        : session.classId
          ? [session.classId]
          : [],
    [session.classIds, session.classId]
  );
  const { byStudentUid: classLinkNames, targetRefKeyByStudentUid } =
    useAssignmentPseudonymsMulti(session.id, sessionClassIds, orgId);
  const ltiNames = useLtiSessionNames(session.id, session.ltiNrps === true);
  const byStudentUid = useMemo(() => {
    if (ltiNames.size === 0) return classLinkNames;
    const merged = new Map(classLinkNames);
    ltiNames.forEach((name, uid) => {
      if (!merged.has(uid)) merged.set(uid, name);
    });
    return merged;
  }, [classLinkNames, ltiNames]);

  const periodNames = useMemo(
    () => [...new Set(session.periodNames ?? [])],
    [session.periodNames]
  );
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(() =>
    periodNames.length > 1 ? [periodNames[0]] : periodNames
  );

  // 30s ticker drives the stuck heuristic and hand-raise ages.
  const [now, setNow] = useState(() => Date.now());
  const anyInProgress = responses.some((r) => r.status === 'in-progress');
  useEffect(() => {
    if (session.status !== 'active' || !anyInProgress) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [session.status, anyInProgress]);

  const filteredResponses = useMemo(() => {
    if (periodNames.length <= 1 || selectedPeriods.length === 0)
      return responses;
    const classIdToPeriod = session.classPeriodByClassId ?? {};
    const selected = new Set(selectedPeriods);
    return responses.filter((r) => {
      const period =
        r.classPeriod ?? (r.classId ? classIdToPeriod[r.classId] : undefined);
      return period != null && selected.has(period);
    });
  }, [responses, periodNames, selectedPeriods, session.classPeriodByClassId]);

  const duplicateIds = useMemo(
    () => findDuplicateResponseIds(responses, pinToName, byStudentUid),
    [responses, pinToName, byStudentUid]
  );

  const scoringConfig = useMemo(
    () => ({
      speedBonusEnabled: session.speedBonusEnabled,
      streakBonusEnabled: session.streakBonusEnabled,
    }),
    [session.speedBonusEnabled, session.streakBonusEnabled]
  );
  const isGamified = isGamificationActive(scoringConfig);

  const currentQ =
    session.currentQuestionIndex >= 0
      ? quizData.questions[session.currentQuestionIndex]
      : undefined;

  const students = useMemo<MonitorStudent[]>(
    () =>
      filteredResponses.map((r) => {
        const scoreable =
          r.status === 'completed' && canScoreResponse(r, quizData.questions);
        const bandScore = scoreable
          ? getResponseScore(r, quizData.questions, undefined, fibGrading)
          : null;
        const flags =
          r.status === 'in-progress' ? studentFlags(r, now) : NO_FLAGS;
        return {
          response: r,
          key: responseDocKey(r),
          name: resolveResponseDisplayName(r, pinToName, byStudentUid),
          bandScore,
          displayScore: scoreable
            ? getDisplayScore(r, quizData.questions, scoringConfig, fibGrading)
            : null,
          awaitingGrade:
            scoreable && isResponseAwaitingGrade(r, quizData.questions),
          band: bandScore != null ? proficiencyBand(bandScore) : null,
          tabWarnings: r.tabSwitchWarnings ?? 0,
          hand: flags.handMinutes,
          idle: flags.idleMinutes,
          duplicate: duplicateIds.has(responseTeamId(r)),
          onQuestion: Math.min(
            r.answers.length + 1,
            session.totalQuestions || r.answers.length + 1
          ),
        };
      }),
    [
      filteredResponses,
      quizData.questions,
      pinToName,
      byStudentUid,
      scoringConfig,
      duplicateIds,
      now,
      session.totalQuestions,
      fibGrading,
    ]
  );

  const { byBucket, counts, handCount, idleCount, answeredCurrent } =
    useMemo(() => {
      const buckets: MonitorData['byBucket'] = {
        notStarted: [],
        inProgress: [],
        done: [],
      };
      let hands = 0;
      let idle = 0;
      let answered = 0;
      for (const s of students) {
        if (
          currentQ &&
          s.response.answers.some((a) => a.questionId === currentQ.id)
        )
          answered++;
        if (s.hand != null) hands++;
        if (s.idle != null) idle++;
        if (s.response.status === 'completed') buckets.done.push(s);
        else if (s.response.status === 'in-progress')
          buckets.inProgress.push(s);
        else buckets.notStarted.push(s);
      }
      return {
        byBucket: buckets,
        counts: {
          notStarted: buckets.notStarted.length,
          inProgress: buckets.inProgress.length,
          done: buckets.done.length,
        },
        handCount: hands,
        idleCount: idle,
        answeredCurrent: answered,
      };
    }, [students, currentQ]);

  return {
    students,
    byBucket,
    counts,
    handCount,
    idleCount,
    currentQ,
    answeredCurrent,
    totalStudents: students.length,
    isGamified,
    pinToName,
    byStudentUid,
    targetRefKeyByStudentUid,
    periodNames,
    selectedPeriods,
    setSelectedPeriods,
    now,
  };
}
