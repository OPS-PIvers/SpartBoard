import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileScan, Loader2, RotateCw } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import {
  PAPER_CROP_CALLABLE,
  cropDataUrl,
  type GetPaperWrittenCropCall,
  type GetPaperWrittenCropRequest,
  type GetPaperWrittenCropResponse,
} from '@/utils/paperCropFetch';

const callStudentPaperCrop: GetPaperWrittenCropCall = async (req) => {
  const call = httpsCallable<
    GetPaperWrittenCropRequest,
    GetPaperWrittenCropResponse
  >(functions, PAPER_CROP_CALLABLE);
  return (await call(req)).data;
};

type CropState =
  | { kind: 'loading' }
  | { kind: 'ready'; url: string }
  | { kind: 'error'; permanent: boolean };

export interface StudentPaperCropProps {
  sessionId: string;
  responseKey: string;
  questionId: string;
  /** Changes when a rescan replaces the crop. */
  artifactId: string;
  questionNumber: number;
  light?: boolean;
  loadCrop?: GetPaperWrittenCropCall;
}

/** The student's own handwriting crop, fetched through the owner-checked callable. */
export const StudentPaperCrop: React.FC<StudentPaperCropProps> = ({
  sessionId,
  responseKey,
  questionId,
  artifactId,
  questionNumber,
  light = false,
  loadCrop = callStudentPaperCrop,
}) => {
  const { t } = useTranslation();
  const tp = (key: string, params?: Record<string, unknown>) =>
    t(`quizMediaResponse.paperReview.${key}`, params);
  const [reloadNonce, setReloadNonce] = useState(0);
  const reqKey = [
    sessionId,
    responseKey,
    questionId,
    artifactId,
    reloadNonce,
  ].join('|');
  const [result, setResult] = useState<{ key: string; crop: CropState }>();
  const crop: CropState =
    result?.key === reqKey ? result.crop : { kind: 'loading' };

  useEffect(() => {
    let cancelled = false;
    const setCrop = (next: CropState) => setResult({ key: reqKey, crop: next });
    loadCrop({ sessionId, responseKey, questionId })
      .then((res) => {
        if (cancelled) return;
        const out = cropDataUrl(res);
        if (typeof out === 'string') setCrop({ kind: 'ready', url: out });
        else
          setCrop({
            kind: 'error',
            permanent: out.reason === 'deleted' || out.reason === 'no-crop',
          });
      })
      .catch(() => {
        if (!cancelled) setCrop({ kind: 'error', permanent: false });
      });
    return () => {
      cancelled = true;
    };
  }, [loadCrop, reqKey, sessionId, responseKey, questionId]);

  const frame = light
    ? 'border-slate-200 bg-white'
    : 'border-slate-700 bg-slate-900/40';
  const muted = light ? 'text-slate-500' : 'text-slate-300';

  return (
    <div
      className={`max-h-[60vh] overflow-auto rounded-lg border pb-2 ${frame}`}
    >
      {crop.kind === 'loading' && (
        <div
          role="status"
          className={`flex h-24 items-center justify-center gap-2 text-xs font-semibold ${muted}`}
        >
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          {tp('loading')}
        </div>
      )}
      {crop.kind === 'error' && (
        <div
          className={`flex h-24 flex-col items-center justify-center gap-2 text-xs font-semibold ${muted}`}
        >
          <span className="inline-flex items-center gap-1">
            <FileScan aria-hidden className="h-4 w-4" />
            {tp('unavailable')}
          </span>
          {!crop.permanent && (
            <button
              type="button"
              onClick={() => setReloadNonce((n) => n + 1)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-bold ${
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
      )}
      {crop.kind === 'ready' && (
        <img
          src={crop.url}
          alt={tp('cropAlt', { number: questionNumber })}
          className="block h-auto w-full bg-white"
        />
      )}
    </div>
  );
};

export default StudentPaperCrop;
