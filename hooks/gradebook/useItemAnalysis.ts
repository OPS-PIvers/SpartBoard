import { useContext, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { AuthContext } from '@/context/AuthContextValue';
import { QuizDriveService } from '@/utils/quizDriveService';
import { useVideoActivityKeyQuestions } from '@/hooks/useVideoActivityKeyQuestions';
import { computeQuestionStats } from '@/utils/quizQuestionStats';
import { gradeVideoActivityAnswer } from '@/utils/videoActivityGrading';
import { logError } from '@/utils/logError';
import type {
  QuestionTargetTag,
  QuizAssignment,
  QuizQuestion,
  QuizResponse,
  VideoActivityQuestion,
  VideoActivityResponse,
  VideoActivitySession,
} from '@/types';
import type { GradebookKind } from '@/utils/gradebook/gradebookCore';

export interface ItemAnalysisRow {
  id: string;
  /** "Q3 · RL.1" */
  label: string;
  title: string;
  /** Class mean of earned / possible on this question, 0-100. */
  pct: number | null;
}

function rowLabel(n: number, targets?: QuestionTargetTag[]): string {
  const code = targets?.[0]?.code;
  return code ? `Q${n} · ${code}` : `Q${n}`;
}

export function quizItemRows(
  questions: QuizQuestion[],
  responses: QuizResponse[]
): ItemAnalysisRow[] {
  const stats = computeQuestionStats(questions, responses);
  return questions.map((q, i) => {
    const s = stats.get(q.id);
    const auto = s && s.autoTotal > 0 ? (s.correct / s.autoTotal) * 100 : null;
    return {
      id: q.id,
      label: rowLabel(i + 1, q.targets),
      title: q.text,
      pct: s?.averagePct ?? auto,
    };
  });
}

export function videoItemRows(
  questions: VideoActivityQuestion[],
  responses: VideoActivityResponse[]
): ItemAnalysisRow[] {
  const done = responses.filter((r) => r.completedAt !== null);
  return questions.map((q, i) => {
    const max = q.points ?? 1;
    const ratios = done.map((r) => {
      const a = r.answers.find((x) => x.questionId === q.id);
      return a && max > 0
        ? gradeVideoActivityAnswer(q, a.answer).pointsEarned / max
        : 0;
    });
    return {
      id: q.id,
      label: rowLabel(i + 1, q.targets),
      title: q.text,
      pct: ratios.length
        ? (ratios.reduce((x, y) => x + y, 0) / ratios.length) * 100
        : null,
    };
  });
}

const EMPTY_VA: Pick<
  VideoActivitySession,
  'id' | 'questions' | 'publicQuestions'
> = { id: '', questions: [] };

interface Loaded {
  key: string;
  rows: ItemAnalysisRow[] | 'none';
}

/**
 * D28 item analysis for one column, over this class's students only.
 * Quiz and Video Activity have per-question data; other kinds return 'none'.
 */
export function useItemAnalysis(
  kind: GradebookKind,
  sessionId: string,
  teacherUid: string | undefined,
  studentUids: string[]
): ItemAnalysisRow[] | null | 'none' {
  const googleAccessToken = useContext(AuthContext)?.googleAccessToken ?? null;
  const [va, setVa] = useState<{
    key: string;
    session: VideoActivitySession;
    responses: VideoActivityResponse[];
  } | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const uidKey = studentUids.join(',');
  const key = `${kind}:${sessionId}:${uidKey}`;
  const vaSession = va?.key === key ? va.session : null;
  const vaResponses = va?.key === key ? va.responses : null;
  const vaKey = useVideoActivityKeyQuestions(vaSession ?? EMPTY_VA);

  useEffect(() => {
    let cancelled = false;
    const inClass = new Set(uidKey.split(','));
    const done = (rows: ItemAnalysisRow[] | 'none') => {
      if (!cancelled) setLoaded({ key, rows });
    };
    const fail = (err: unknown) => {
      logError('useItemAnalysis', err, { kind, sessionId });
      done('none');
    };
    if (!teacherUid) {
      done('none');
    } else if (kind === 'quiz') {
      void (async () => {
        const a = await getDoc(
          doc(db, 'users', teacherUid, 'quiz_assignments', sessionId)
        );
        const fileId = (a.data() as QuizAssignment | undefined)
          ?.quizDriveFileId;
        if (!fileId || !googleAccessToken || isAuthBypass) return done('none');
        const [quiz, snap] = await Promise.all([
          new QuizDriveService(googleAccessToken).loadQuiz(fileId),
          getDocs(collection(db, 'quiz_sessions', sessionId, 'responses')),
        ]);
        const responses = snap.docs
          .map((d) => d.data() as QuizResponse)
          .filter((r) => inClass.has(r.studentUid));
        done(quizItemRows(quiz.questions, responses));
      })().catch(fail);
    } else if (kind === 'video-activity') {
      void (async () => {
        const [s, snap] = await Promise.all([
          getDoc(doc(db, 'video_activity_sessions', sessionId)),
          getDocs(
            collection(db, 'video_activity_sessions', sessionId, 'responses')
          ),
        ]);
        if (cancelled) return;
        if (!s.exists()) return done('none');
        setVa({
          key,
          session: { ...(s.data() as VideoActivitySession), id: s.id },
          responses: snap.docs
            .map((d) => d.data() as VideoActivityResponse)
            .filter((r) => inClass.has(r.studentUid)),
        });
      })().catch(fail);
    } else {
      done('none');
    }
    return () => {
      cancelled = true;
    };
  }, [key, kind, sessionId, teacherUid, uidKey, googleAccessToken]);

  const vaRows = useMemo(() => {
    if (kind !== 'video-activity' || !vaSession || !vaResponses) return null;
    if (vaKey.loading) return null;
    if (vaKey.failed || vaKey.questions.length === 0) return 'none' as const;
    return videoItemRows(vaKey.questions, vaResponses);
  }, [kind, vaSession, vaResponses, vaKey]);

  if (loaded?.key === key) return loaded.rows;
  if (kind === 'video-activity') return vaRows;
  return null;
}
