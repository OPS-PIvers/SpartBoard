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
import { useAssignmentPseudonymsMulti } from '@/hooks/useAssignmentPseudonyms';
import { useLtiSessionNames } from '@/hooks/useLtiSessionNames';
import {
  buildPinToNameMap,
  canScoreResponse,
  getDisplayScore,
  getResponseScore,
  isGamificationActive,
} from '@/components/widgets/QuizWidget/utils/quizScoreboard';
import {
  resolveResponseDisplayName,
  responseTeamId,
  findDuplicateResponseIds,
} from '@/components/widgets/QuizWidget/utils/resolveDisplayName';
import {
  needsHelpFlag,
  NeedsHelpFlag,
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
  band: ProficiencyBand | null;
  tabWarnings: number;
  needsHelp: NeedsHelpFlag | null;
  duplicate: boolean;
  /** 1-based question the student is on (answers.length + 1, capped). */
  onQuestion: number;
}

export interface MonitorData {
  students: MonitorStudent[];
  byBucket: Record<'notStarted' | 'inProgress' | 'done', MonitorStudent[]>;
  counts: { notStarted: number; inProgress: number; done: number };
  needsHelpCount: number;
  currentQ: QuizQuestion | undefined;
  answeredCurrent: number;
  totalStudents: number;
  isGamified: boolean;
  pinToName: Record<string, string>;
  byStudentUid: ReturnType<typeof useAssignmentPseudonymsMulti>['byStudentUid'];
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
  rosters: ClassRoster[]
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
  const { byStudentUid: classLinkNames } = useAssignmentPseudonymsMulti(
    session.id,
    sessionClassIds,
    orgId
  );
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
          ? getResponseScore(r, quizData.questions)
          : null;
        return {
          response: r,
          key: responseDocKey(r),
          name: resolveResponseDisplayName(r, pinToName, byStudentUid),
          bandScore,
          displayScore: scoreable
            ? getDisplayScore(r, quizData.questions, scoringConfig)
            : null,
          band: bandScore != null ? proficiencyBand(bandScore) : null,
          tabWarnings: r.tabSwitchWarnings ?? 0,
          needsHelp: r.status === 'in-progress' ? needsHelpFlag(r, now) : null,
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
    ]
  );

  const { byBucket, counts, needsHelpCount, answeredCurrent } = useMemo(() => {
    const buckets: MonitorData['byBucket'] = {
      notStarted: [],
      inProgress: [],
      done: [],
    };
    let needs = 0;
    let answered = 0;
    for (const s of students) {
      if (
        currentQ &&
        s.response.answers.some((a) => a.questionId === currentQ.id)
      )
        answered++;
      if (s.needsHelp) needs++;
      if (s.response.status === 'completed') buckets.done.push(s);
      else if (s.response.status === 'in-progress') buckets.inProgress.push(s);
      else buckets.notStarted.push(s);
    }
    return {
      byBucket: buckets,
      counts: {
        notStarted: buckets.notStarted.length,
        inProgress: buckets.inProgress.length,
        done: buckets.done.length,
      },
      needsHelpCount: needs,
      answeredCurrent: answered,
    };
  }, [students, currentQ]);

  return {
    students,
    byBucket,
    counts,
    needsHelpCount,
    currentQ,
    answeredCurrent,
    totalStudents: students.length,
    isGamified,
    pinToName,
    byStudentUid,
    periodNames,
    selectedPeriods,
    setSelectedPeriods,
    now,
  };
}
