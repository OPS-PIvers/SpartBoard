import { useCallback, useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';

// Wire shapes mirrored from `functions/src/deleteQuizMediaForOrgAdmin.ts`.
// Quiz responses carry no `orgId`, so both the listing and the delete run
// through Admin-SDK callables rather than a client Firestore query.

export interface MediaTakeRow {
  artifactId: string;
  archiveStatus: string;
  driveFileId?: string;
  archivedAt?: number;
  deletedAt?: number;
  archiveError?: string;
  hasStorageObject: boolean;
}

export interface MediaResponseRow {
  sessionId: string;
  responseKey: string;
  questionId: string;
  quizTitle: string;
  teacherUid: string;
  teacherEmail: string;
  studentLabel: string;
  takes: MediaTakeRow[];
  lastActivityAt: number;
}

export interface MediaTeacherOption {
  uid: string;
  email: string;
}

export interface MediaDeleteResult {
  sessionId: string;
  responseKey: string;
  questionId: string;
  artifactId: string;
  status: 'deleted' | 'failed' | 'skipped';
  error?: string;
}

export interface MediaReviewFilters {
  teacherUid: string;
  /** `YYYY-MM-DD`, inclusive; empty means unbounded. */
  afterDate: string;
  beforeDate: string;
}

export const EMPTY_MEDIA_FILTERS: MediaReviewFilters = {
  teacherUid: '',
  afterDate: '',
  beforeDate: '',
};

/** Local midnight; `endOfDay` pushes the bound to the last ms of that date. */
export function parseFilterDate(
  value: string,
  endOfDay: boolean
): number | undefined {
  if (!value) return undefined;
  const parsed = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`);
  const ms = parsed.getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

/** Stable identity for a (response, question) media set. */
export function mediaRowKey(row: {
  sessionId: string;
  responseKey: string;
  questionId: string;
}): string {
  return `${row.sessionId}|${row.responseKey}|${row.questionId}`;
}

export interface UseOrgMediaResponses {
  rows: MediaResponseRow[];
  teachers: MediaTeacherOption[];
  loading: boolean;
  error: string | null;
  truncated: boolean;
  deleting: boolean;
  reload: () => void;
  deleteMedia: (
    targets: Array<{
      sessionId: string;
      responseKey: string;
      questionId: string;
    }>
  ) => Promise<MediaDeleteResult[]>;
}

export function useOrgMediaResponses(
  orgId: string | null,
  filters: MediaReviewFilters
): UseOrgMediaResponses {
  const [rows, setRows] = useState<MediaResponseRow[]>([]);
  const [teachers, setTeachers] = useState<MediaTeacherOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const { teacherUid, afterDate, beforeDate } = filters;
  const afterMs = useMemo(() => parseFilterDate(afterDate, false), [afterDate]);
  const beforeMs = useMemo(
    () => parseFilterDate(beforeDate, true),
    [beforeDate]
  );

  useEffect(() => {
    if (!orgId) {
      setRows([]);
      setTeachers([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const callable = httpsCallable<
      {
        orgId: string;
        teacherUid?: string;
        afterMs?: number;
        beforeMs?: number;
      },
      {
        rows: MediaResponseRow[];
        teachers: MediaTeacherOption[];
        truncated: boolean;
      }
    >(functions, 'listQuizMediaForOrgAdmin');
    callable({
      orgId,
      ...(teacherUid ? { teacherUid } : {}),
      ...(afterMs !== undefined ? { afterMs } : {}),
      ...(beforeMs !== undefined ? { beforeMs } : {}),
    })
      .then((result) => {
        if (cancelled) return;
        setRows(result.data.rows ?? []);
        setTeachers(result.data.teachers ?? []);
        setTruncated(result.data.truncated === true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, teacherUid, afterMs, beforeMs, reloadToken]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  const deleteMedia = useCallback(
    async (
      targets: Array<{
        sessionId: string;
        responseKey: string;
        questionId: string;
      }>
    ): Promise<MediaDeleteResult[]> => {
      if (!orgId || targets.length === 0) return [];
      setDeleting(true);
      try {
        const callable = httpsCallable<
          { orgId: string; targets: typeof targets },
          { results: MediaDeleteResult[] }
        >(functions, 'deleteQuizMediaForOrgAdmin');
        const result = await callable({ orgId, targets });
        return result.data.results ?? [];
      } finally {
        setDeleting(false);
        setReloadToken((n) => n + 1);
      }
    },
    [orgId]
  );

  return {
    rows,
    teachers,
    loading,
    error,
    truncated,
    deleting,
    reload,
    deleteMedia,
  };
}
