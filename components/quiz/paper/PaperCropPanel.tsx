import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  AlertTriangle,
  FileScan,
  HardDrive,
  Loader2,
  Maximize2,
  Pencil,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  ArtifactArchiveEntry,
  PaperPrivateAnswer,
  QuizResponseAnswer,
} from '@/types';
import { handwritingArtifact } from '@/utils/paperWritten';
import {
  PaperCropUnavailableError,
  isScanSuperseded,
  needsSnapshotConfirm,
  transcriptHtmlToEditText,
  uncertainSnippets,
  type PaperCropResolver,
  type PaperWrittenActions,
} from '@/utils/paperCropFetch';

const ZOOM_STEPS = [1, 1.5, 2, 3] as const;

export interface PaperCropPanelProps {
  /** Printed question number, for the image's alt text. */
  questionNumber: number;
  sessionId: string;
  responseKey: string;
  questionId: string;
  answer: Pick<
    QuizResponseAnswer,
    'answer' | 'artifacts' | 'paperScanId' | 'paperTranscript'
  >;
  /** Teacher-only transcription record; null while loading or absent. */
  privateDoc: PaperPrivateAnswer | null;
  archive?: ArtifactArchiveEntry;
  /** The saved grade anchors highlights to a snapshot an edit would replace. */
  hasSnapshot: boolean;
  resolveCrop: PaperCropResolver;
  /** Omit for a read-only panel. */
  actions?: PaperWrittenActions;
  onConnectDrive?: () => void;
  /** Called after the answer text changed on the server. */
  onAnswerChanged?: () => void;
}

type CropState =
  | { kind: 'loading' }
  | { kind: 'ready'; url: string }
  | { kind: 'error'; permanent: boolean };

type Busy = 'save' | 'retry' | 'transcribe' | 'newScan' | null;

export const PaperCropPanel: React.FC<PaperCropPanelProps> = ({
  questionNumber,
  sessionId,
  responseKey,
  questionId,
  answer,
  privateDoc,
  archive,
  hasSnapshot,
  resolveCrop,
  actions,
  onConnectDrive,
  onAnswerChanged,
}) => {
  const { t } = useTranslation();
  const tp = (key: string, params?: Record<string, unknown>) =>
    t(`quizMediaResponse.grading.paper.${key}`, params);

  const artifact = handwritingArtifact(answer);
  const [crop, setCrop] = useState<CropState>({ kind: 'loading' });
  const [reloadNonce, setReloadNonce] = useState(0);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const resolveRef = React.useRef(resolveCrop);
  resolveRef.current = resolveCrop;
  const cropKey = [
    sessionId,
    responseKey,
    questionId,
    artifact?.id ?? '',
    artifact?.storagePath ?? '',
    archive?.archiveStatus ?? '',
    archive?.driveFileId ?? '',
    reloadNonce,
  ].join('|');

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    setCrop({ kind: 'loading' });
    resolveRef
      .current({ sessionId, responseKey, questionId, artifact, archive })
      .then((url) => {
        if (url.startsWith('blob:')) created = url;
        if (cancelled) {
          if (created) URL.revokeObjectURL(created);
          return;
        }
        setCrop({ kind: 'ready', url });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const permanent =
          err instanceof PaperCropUnavailableError &&
          (err.reason === 'deleted' || err.reason === 'no-crop');
        setCrop({ kind: 'error', permanent });
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
    // cropKey carries every input that changes which image loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropKey]);

  const status = privateDoc?.status ?? answer.paperTranscript ?? 'pending';
  const edited = !!privateDoc?.editedAt;
  const snippets = uncertainSnippets(
    privateDoc?.rawTranscript,
    privateDoc?.uncertainSpans
  );
  const flagged = snippets.length > 0 || (privateDoc?.illegibleCount ?? 0) > 0;
  const newerScan = privateDoc?.newerScan;
  const ref = { sessionId, responseKey, questionId };

  const run = async (kind: Exclude<Busy, null>, fn: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      // A live transcription lease on the page refuses these actions for a moment.
      setError(
        isScanSuperseded(err)
          ? tp(kind === 'retry' ? 'errors.superseded' : 'errors.busy')
          : tp('errors.actionFailed')
      );
      return false;
    } finally {
      setBusy(null);
    }
  };

  const startEdit = () => {
    setDraft(
      answer.answer
        ? transcriptHtmlToEditText(answer.answer)
        : (privateDoc?.rawTranscript ?? '')
    );
    setError(null);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!actions) return;
    if (hasSnapshot && !window.confirm(tp('confirmRewrite'))) return;
    let confirmed = hasSnapshot;
    setBusy('save');
    setError(null);
    try {
      const send = () =>
        actions.updateTranscript({
          ...ref,
          text: draft,
          ...(answer.paperScanId ? { expectedScanId: answer.paperScanId } : {}),
          ...(confirmed ? { confirmSnapshotRewrite: true } : {}),
        });
      try {
        await send();
      } catch (err) {
        if (!needsSnapshotConfirm(err) || confirmed) throw err;
        if (!window.confirm(tp('confirmRewrite'))) return;
        confirmed = true;
        await send();
      }
      setEditing(false);
      onAnswerChanged?.();
    } catch (err) {
      setError(
        isScanSuperseded(err)
          ? tp('errors.superseded')
          : tp('errors.actionFailed')
      );
    } finally {
      setBusy(null);
    }
  };

  const applyNewScan = async () => {
    if (!actions) return;
    if (hasSnapshot && !window.confirm(tp('confirmRewrite'))) return;
    if (await run('newScan', () => actions.applyNewerScan(ref)))
      onAnswerChanged?.();
  };

  const chip =
    'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xxs font-bold uppercase tracking-wider';
  const button =
    'inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50';
  const zoom = ZOOM_STEPS[zoomIdx];

  return (
    <section
      aria-label={tp('handwriting')}
      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {tp('handwriting')}
        </h4>
        {status === 'pending' && (
          <span className={`${chip} bg-slate-100 text-slate-700`}>
            <Loader2 aria-hidden className="h-3 w-3 animate-spin" />
            {tp('state.pending')}
          </span>
        )}
        {status === 'failed' && (
          <span
            className={`${chip} bg-brand-red-lighter/50 text-brand-red-dark`}
          >
            <AlertCircle aria-hidden className="h-3 w-3" />
            {tp('state.failed')}
          </span>
        )}
        {status === 'over-quota' && (
          <span className={`${chip} bg-amber-100 text-amber-800`}>
            <AlertCircle aria-hidden className="h-3 w-3" />
            {tp('state.over-quota')}
          </span>
        )}
        {status === 'blank' && (
          <span className={`${chip} bg-slate-100 text-slate-700`}>
            {tp('state.blank')}
          </span>
        )}
        {flagged && (
          <span className={`${chip} bg-amber-100 text-amber-800`}>
            <AlertTriangle aria-hidden className="h-3 w-3" />
            {tp('checkTranscript')}
          </span>
        )}
        {edited && (
          <span className={`${chip} bg-slate-100 text-slate-700`}>
            <Pencil aria-hidden className="h-3 w-3" />
            {tp('state.edited')}
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
            disabled={zoomIdx === 0 || crop.kind !== 'ready'}
            aria-label={tp('zoomOut')}
            title={tp('zoomOut')}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
          >
            <ZoomOut aria-hidden className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoomIdx(0)}
            disabled={zoomIdx === 0 || crop.kind !== 'ready'}
            aria-label={tp('zoomFit')}
            title={tp('zoomFit')}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
          >
            <Maximize2 aria-hidden className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))
            }
            disabled={
              zoomIdx === ZOOM_STEPS.length - 1 || crop.kind !== 'ready'
            }
            aria-label={tp('zoomIn')}
            title={tp('zoomIn')}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
          >
            <ZoomIn aria-hidden className="h-4 w-4" />
          </button>
        </span>
      </div>

      <div className="max-h-[50vh] overflow-auto rounded border border-slate-200 bg-slate-50 pb-2">
        {crop.kind === 'loading' && (
          <div
            role="status"
            className="flex h-32 items-center justify-center gap-2 text-xs font-semibold text-slate-500"
          >
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            {tp('loading')}
          </div>
        )}
        {crop.kind === 'error' && (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-xs font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1">
              <FileScan aria-hidden className="h-4 w-4" />
              {tp('unavailable')}
            </span>
            {!crop.permanent && (
              <button
                type="button"
                onClick={() => setReloadNonce((n) => n + 1)}
                className={button}
              >
                <RotateCw aria-hidden className="h-3.5 w-3.5" />
                {tp('reload')}
              </button>
            )}
          </div>
        )}
        {crop.kind === 'ready' && (
          <img
            src={crop.url}
            alt={tp('cropAlt', { number: questionNumber })}
            style={{ width: `${zoom * 100}%`, maxWidth: 'none' }}
            className="block h-auto"
          />
        )}
      </div>

      {archive?.archiveStatus === 'awaiting-drive' && onConnectDrive && (
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
          <HardDrive aria-hidden className="h-3.5 w-3.5" />
          {tp('awaitingDrive')}
          <button type="button" onClick={onConnectDrive} className={button}>
            {tp('connectDrive')}
          </button>
        </div>
      )}

      {snippets.length > 0 && !edited && (
        <ul aria-label={tp('checkTranscript')} className="flex flex-col gap-1">
          {snippets.map((s, i) => (
            <li key={i} className="text-xs text-slate-600">
              {s.before}
              <mark className="rounded bg-amber-200 px-0.5 text-amber-950">
                {s.flagged}
              </mark>
              {s.after}
            </li>
          ))}
        </ul>
      )}

      {actions && !editing && (
        <div className="flex flex-wrap items-center gap-2">
          {(status === 'failed' || status === 'over-quota') && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void run('retry', () => actions.retry(ref))}
              className={button}
            >
              {busy === 'retry' ? (
                <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCw aria-hidden className="h-3.5 w-3.5" />
              )}
              {tp('retry')}
            </button>
          )}
          {status === 'blank' && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run('transcribe', () => actions.transcribeBlank(ref))
              }
              className={button}
            >
              {busy === 'transcribe' && (
                <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
              )}
              {tp('transcribeBlank')}
            </button>
          )}
          {newerScan && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void applyNewScan()}
              className={button}
            >
              {busy === 'newScan' && (
                <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
              )}
              {tp('useNewScan')}
            </button>
          )}
          {status !== 'blank' && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={startEdit}
              className={button}
            >
              <Pencil aria-hidden className="h-3.5 w-3.5" />
              {tp('edit')}
            </button>
          )}
        </div>
      )}

      {actions && editing && (
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {tp('transcriptLabel')}
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm font-normal normal-case tracking-normal text-slate-900 focus:border-brand-blue-primary focus:outline-none"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy !== null || !draft.trim()}
              onClick={() => void saveEdit()}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-blue-primary px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'save' && (
                <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
              )}
              {tp('save')}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setEditing(false)}
              className={button}
            >
              {tp('cancel')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-brand-red-lighter/40 px-3 py-2 text-xs font-bold text-brand-red-dark"
        >
          {error}
        </p>
      )}
    </section>
  );
};

export default PaperCropPanel;
