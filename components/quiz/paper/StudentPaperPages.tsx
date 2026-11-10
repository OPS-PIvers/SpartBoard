import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileScan, Loader2, RotateCw } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import {
  PAPER_PAGE_CALLABLE,
  type GetPaperPageCall,
  type GetPaperPageRequest,
  type GetPaperPageResponse,
} from '@/utils/paperWritten';

const callStudentPaperPage: GetPaperPageCall = async (req) => {
  const call = httpsCallable<GetPaperPageRequest, GetPaperPageResponse>(
    functions,
    PAPER_PAGE_CALLABLE
  );
  return (await call(req)).data;
};

type PageState =
  | { kind: 'loading' }
  | { kind: 'ready'; url: string }
  | { kind: 'error'; permanent: boolean };

/** A refusal means the teacher has not turned this on, so the section never shows. */
function isRefusal(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'functions/permission-denied' || code === 'permission-denied';
}

export interface StudentPaperPagesProps {
  sessionId: string;
  responseKey: string;
  /** Kept pages to show, in sheet order; `artifactId` changes when a rescan replaces one. */
  pages: { page: number; artifactId: string }[];
  light?: boolean;
  loadPage?: GetPaperPageCall;
}

/** The student's own scanned answer sheet, fetched through the owner-checked callable. */
export const StudentPaperPages: React.FC<StudentPaperPagesProps> = ({
  sessionId,
  responseKey,
  pages,
  light = false,
  loadPage = callStudentPaperPage,
}) => {
  const { t } = useTranslation();
  const tp = (key: string, params?: Record<string, unknown>) =>
    t(`quizMediaResponse.paperReview.${key}`, params);
  const [reloadNonce, setReloadNonce] = useState(0);
  const pageKey = pages.map((p) => `${p.page}:${p.artifactId}`).join(',');
  const baseKey = [sessionId, responseKey, pageKey].join('|');
  const reqKey = `${baseKey}|${reloadNonce}`;
  const [result, setResult] = useState<{
    key: string;
    byPage: Record<number, PageState>;
  }>();
  // Set once the server answers without refusing; until then nothing shows, so a refusal never flashes.
  const [shownFor, setShownFor] = useState<string>();
  const current = result?.key === reqKey ? result : undefined;

  useEffect(() => {
    let cancelled = false;
    const pageNumbers = pageKey
      ? pageKey.split(',').map((entry) => Number(entry.split(':')[0]))
      : [];
    const set = (page: number, next: PageState) => {
      if (cancelled) return;
      setShownFor(baseKey);
      setResult((prev) => ({
        key: reqKey,
        byPage: { ...(prev?.key === reqKey ? prev.byPage : {}), [page]: next },
      }));
    };
    const load = (page: number): Promise<boolean> =>
      loadPage({ sessionId, responseKey, page })
        .then((res) => {
          set(
            page,
            res.status === 'ready'
              ? {
                  kind: 'ready',
                  url: `data:${res.mimeType};base64,${res.data}`,
                }
              : {
                  kind: 'error',
                  permanent:
                    res.reason === 'deleted' || res.reason === 'no-page',
                }
          );
          return true;
        })
        .catch((err: unknown) => {
          if (isRefusal(err)) return false;
          set(page, { kind: 'error', permanent: false });
          return true;
        });
    // One page first, so a teacher without the preview costs one refused call.
    const [first, ...rest] = pageNumbers;
    if (first !== undefined) {
      void load(first).then((ok) => {
        if (ok && !cancelled) for (const page of rest) void load(page);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [loadPage, reqKey, baseKey, pageKey, sessionId, responseKey]);

  if (pages.length === 0 || shownFor !== baseKey) return null;

  const frame = light
    ? 'border-slate-200 bg-white'
    : 'border-slate-700 bg-slate-900/40';
  const muted = light ? 'text-slate-500' : 'text-slate-300';
  const subtle = light ? 'text-slate-500' : 'text-slate-300';
  const anyRetry = pages.some((p) => {
    const s = current?.byPage[p.page];
    return s?.kind === 'error' && !s.permanent;
  });

  return (
    <section aria-label={tp('sheetHeading')} className="mt-8">
      <h2
        className={`mb-3 text-xs font-bold uppercase tracking-[0.14em] ${subtle}`}
      >
        {tp('sheetHeading')}
      </h2>
      <div className="flex flex-col gap-3">
        {pages.map(({ page }) => {
          const state: PageState = current?.byPage[page] ?? { kind: 'loading' };
          return (
            <div
              key={page}
              className={`mx-auto w-full max-w-xl overflow-hidden rounded-lg border ${frame}`}
            >
              {state.kind === 'loading' && (
                <div
                  role="status"
                  className={`flex h-40 items-center justify-center gap-2 text-xs font-semibold ${muted}`}
                >
                  <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                  {tp('sheetLoading')}
                </div>
              )}
              {state.kind === 'error' && (
                <div
                  className={`flex h-24 items-center justify-center gap-1 text-xs font-semibold ${muted}`}
                >
                  <FileScan aria-hidden className="h-4 w-4" />
                  {tp('sheetUnavailable', { number: page })}
                </div>
              )}
              {state.kind === 'ready' && (
                <img
                  src={state.url}
                  alt={tp('sheetAlt', { number: page })}
                  className="block h-auto w-full bg-white"
                />
              )}
            </div>
          );
        })}
        {anyRetry && (
          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            className={`inline-flex items-center gap-1 self-center rounded-lg border px-3 py-2 text-xs font-bold ${
              light
                ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                : 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <RotateCw aria-hidden className="h-3.5 w-3.5" />
            {tp('reload')}
          </button>
        )}
      </div>
    </section>
  );
};

export default StudentPaperPages;
