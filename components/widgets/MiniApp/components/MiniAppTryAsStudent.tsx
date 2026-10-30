// Runs a draft app with the real helper and grades each submit locally; nothing is saved (MINI_APP_RESULTS.md D12).
import React, {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import { StudentAnswerLine } from '@/components/widgets/QuizWidget/components/results/StudentAnswerLine';
import type { StudentQuestionLine } from '@/utils/quizStudentDrilldown';
import type { MiniAppAnswerKey, MiniAppManifest } from '@/types';
import {
  MSG_INIT,
  MSG_LEGACY_RESULT,
  MSG_SUBMIT,
  MSG_SUBMIT_RESULT,
  injectMiniAppHelper,
} from '@/utils/miniAppHelper';
import {
  gradeMiniAppResult,
  parseMiniAppResult,
  readAnswerKey,
  readManifest,
  stripPrivateFields,
  type GradeOutcome,
} from '@/utils/miniAppGrading';

type Outcome =
  | { kind: 'graded'; attempt: number; grade: GradeOutcome; sent: unknown }
  | { kind: 'error'; attempt: number; message: string; sent: unknown }
  | { kind: 'legacy'; attempt: number; sent: unknown };

const answerText = (answer: unknown): string => {
  if (answer === null || answer === undefined) return '';
  if (Array.isArray(answer)) return answer.map(String).join(', ');
  return typeof answer === 'string' ? answer : JSON.stringify(answer);
};

export const MiniAppTryAsStudent: React.FC<{
  title: string;
  html: string;
  manifest: MiniAppManifest;
  answerKey: MiniAppAnswerKey;
  onClose: () => void;
}> = ({ title, html, manifest, answerKey, onClose }) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [run, setRun] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [attempts, setAttempts] = useState(0);
  const srcDoc = useMemo(() => injectMiniAppHelper(html), [html]);
  const questions = useMemo(() => readManifest(manifest), [manifest]);

  const reply = (requestId: string, body: Record<string, unknown>) =>
    frameRef.current?.contentWindow?.postMessage(
      { type: MSG_SUBMIT_RESULT, requestId, ...body },
      '*'
    );

  const onMessage = useEffectEvent((event: MessageEvent) => {
    if (event.source !== frameRef.current?.contentWindow) return;
    const data = event.data as {
      type?: string;
      payload?: unknown;
      requestId?: unknown;
    } | null;
    const attempt = attempts + 1;
    if (data?.type === MSG_LEGACY_RESULT) {
      setAttempts(attempt);
      setOutcome({ kind: 'legacy', attempt, sent: data.payload });
      return;
    }
    if (data?.type !== MSG_SUBMIT || typeof data.requestId !== 'string') return;
    setAttempts(attempt);
    try {
      const raw = parseMiniAppResult(data.payload);
      parseMiniAppResult(stripPrivateFields(raw));
      const grade = gradeMiniAppResult(
        raw,
        questions,
        readAnswerKey(answerKey)
      );
      setOutcome({ kind: 'graded', attempt, grade, sent: data.payload });
      reply(data.requestId, {
        ok: true,
        result: {
          attempt,
          attemptsLeft: null,
          ...(grade.score !== null
            ? { score: grade.score, maxScore: grade.maxScore }
            : {}),
          items: grade.items
            .filter((it) => it.correct !== null)
            .map((it) => ({ id: it.id, correct: it.correct })),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Not accepted.';
      setOutcome({ kind: 'error', attempt, message, sent: data.payload });
      reply(data.requestId, {
        ok: false,
        error: { code: 'invalid-result', message },
      });
    }
  });

  useEffect(() => {
    const listener = (e: MessageEvent) => onMessage(e);
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  const handleLoad = () =>
    frameRef.current?.contentWindow?.postMessage(
      {
        type: MSG_INIT,
        payload: { submissionsEnabled: true, attemptsLeft: null },
      },
      '*'
    );

  const lines: StudentQuestionLine[] =
    outcome?.kind === 'graded'
      ? questions.map((q, i) => {
          const item = outcome.grade.items.find((it) => it.id === q.id);
          return {
            questionId: q.id,
            number: i + 1,
            text: q.prompt || q.id,
            type: 'MC',
            mark: !item
              ? 'noAnswer'
              : item.correct === true
                ? 'correct'
                : item.correct === false
                  ? 'incorrect'
                  : 'ungraded',
            pointsEarned: item?.earned ?? 0,
            pointsMax: item?.points ?? q.points ?? 1,
            answerText: answerText(item?.answer),
            correctAnswerText: null,
            manual: false,
          };
        })
      : [];

  return createPortal(
    <div
      className="fixed inset-0 z-modal-nested flex flex-col bg-slate-900/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Try ${title} as a student`}
    >
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">
              Try as student
            </p>
            <p className="text-xs text-slate-500">Nothing is saved.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setRun((n) => n + 1);
              setOutcome(null);
              setAttempts(0);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-brand-blue-light"
          >
            <RotateCcw className="h-4 w-4" />
            Start over
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-1 min-h-0">
          <iframe
            key={run}
            ref={frameRef}
            srcDoc={srcDoc}
            title={title}
            sandbox="allow-scripts allow-forms allow-modals"
            className="flex-1 min-w-0 border-0 bg-slate-900"
            onLoad={handleLoad}
          />
          <aside
            className="flex w-[360px] shrink-0 flex-col border-l border-slate-200"
            style={{ containerType: 'size' }}
            aria-label="What SpartBoard received"
          >
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 pb-6">
              {!outcome ? (
                <p className="text-sm text-slate-500">
                  Submit in the app to see how it is scored.
                </p>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-blue-primary">
                    Attempt {outcome.attempt}
                  </p>
                  {outcome.kind === 'graded' &&
                    outcome.grade.score !== null && (
                      <p className="mt-1 text-2xl font-bold text-brand-blue-dark tabular-nums">
                        {outcome.grade.score}/{outcome.grade.maxScore}
                        {outcome.grade.gradedBy === 'app' && (
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            from app
                          </span>
                        )}
                      </p>
                    )}
                  {outcome.kind === 'error' && (
                    <p className="mt-2 flex items-start gap-1.5 text-sm text-brand-red-dark">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      {outcome.message}
                    </p>
                  )}
                  {outcome.kind === 'legacy' && (
                    <p className="mt-2 flex items-start gap-1.5 text-sm text-amber-800">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      This app uses the older result format, so it will not be
                      scored.
                    </p>
                  )}
                  {lines.length > 0 && (
                    <ol className="mt-3 flex flex-col gap-2">
                      {lines.map((line) => (
                        <StudentAnswerLine key={line.questionId} line={line} />
                      ))}
                    </ol>
                  )}
                  <details className="mt-4">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                      What the app sent
                    </summary>
                    <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-md bg-slate-900 p-2 text-[11px] text-slate-100">
                      {JSON.stringify(outcome.sent, null, 2)}
                    </pre>
                  </details>
                </>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>,
    document.body
  );
};
