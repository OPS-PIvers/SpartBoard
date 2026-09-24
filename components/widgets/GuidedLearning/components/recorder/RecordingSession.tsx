import React, { lazy, Suspense, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Circle, EyeOff, ShieldCheck } from 'lucide-react';
import type { GuidedLearningSet, WidgetType } from '@/types';
import { Z_INDEX } from '@/config/zIndex';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { DashboardContext } from '@/context/DashboardContextValue';
import { useStorage } from '@/hooks/useStorage';
import { useGuidedLearning } from '@/hooks/useGuidedLearning';
import { prepareImageForUpload } from '@/utils/guidedLearningMedia';
import { TourRecorder } from './TourRecorder';
import { FrameReview } from './FrameReview';
import { buildNameMatcher, type NameMatcher } from './redaction';
import { buildRecordedSet } from './buildRecordedSet';
import { draftRecordedStepText } from './draftStepText';
import type { TourRecording } from './useTourCapture';

const GuidedLearningStudio = lazy(() =>
  import('../studio/GuidedLearningStudio').then((m) => ({
    default: m.GuidedLearningStudio,
  }))
);

export type AiDrafts = ReadonlyMap<string, { label: string; text: string }>;

type Phase =
  | { kind: 'intro' }
  | { kind: 'recording'; matcher: NameMatcher | null; widgets: WidgetType[] }
  | { kind: 'review'; recording: TourRecording; widgets: WidgetType[] }
  | { kind: 'studio'; set: GuidedLearningSet; drafts: AiDrafts };

const newId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tour-${Date.now()}-${Math.random().toString(36).slice(2)}`;

interface RecordingSessionProps {
  onEnd: () => void;
}

/** Start, record, review, upload and open in the Studio: one real-board tour recording. */
export const RecordingSession: React.FC<RecordingSessionProps> = ({
  onEnd,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showConfirm } = useDialog();
  const dashboard = useContext(DashboardContext);
  const { uploadGuidedLearningImage } = useStorage();
  const { saveBuildingSet } = useGuidedLearning(undefined);
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' });
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rosters = dashboard?.rosters ?? [];
  const unloaded = rosters.filter((r) => r.loadError).length;

  const begin = () => {
    // Built once, before recording starts; the roster names never leave this matcher.
    const matcher = buildNameMatcher(rosters.flatMap((r) => r.students));
    const widgets = (dashboard?.activeDashboard?.widgets ?? []).map(
      (w) => w.type
    );
    setPhase({ kind: 'recording', matcher, widgets });
  };

  const upload = async (
    recording: TourRecording,
    widgets: WidgetType[],
    frames: Blob[]
  ) => {
    if (!user) return;
    setError(null);
    try {
      const imageUrls: string[] = [];
      const imagePaths: string[] = [];
      const slideThumbnails: Record<string, string> = {};
      for (let i = 0; i < frames.length; i++) {
        setBusy(
          t('glRecorder.uploading', { current: i + 1, total: frames.length })
        );
        const file = new File([frames[i]], `tour-step-${i + 1}.png`, {
          type: frames[i].type || 'image/png',
        });
        const prepared = await prepareImageForUpload(file);
        // Recordings are district content, so they live on Storage.
        const uploaded = await uploadGuidedLearningImage(
          user.uid,
          prepared,
          prepared.name,
          'storage'
        );
        imageUrls.push(uploaded.url);
        if (uploaded.storagePath) imagePaths.push(uploaded.storagePath);
        if (uploaded.thumbnailUrl)
          slideThumbnails[uploaded.url] = uploaded.thumbnailUrl;
      }
      setBusy(t('glRecorder.drafting'));
      const goal = title.trim();
      const drafted = await draftRecordedStepText(
        { ...recording, frames },
        goal || undefined
      ).catch(() => []);
      const base = buildRecordedSet(recording, {
        id: newId(),
        title: goal || t('glRecorder.untitled'),
        imageUrls,
        imagePaths,
        slideThumbnails,
        widgets,
      });
      const drafts = new Map<string, { label: string; text: string }>();
      const set: GuidedLearningSet = {
        ...base,
        steps: base.steps.map((step, i) => {
          const d = drafted[i];
          if (!d || (!d.label && !d.text)) return step;
          drafts.set(step.id, d);
          return { ...step, label: d.label, text: d.text };
        }),
      };
      await saveBuildingSet(set).catch((err: unknown) =>
        console.error('[TourRecorder] Saving the recorded set failed:', err)
      );
      setPhase({ kind: 'studio', set, drafts });
    } catch (err) {
      console.error('[TourRecorder] Upload failed:', err);
      setError(t('glRecorder.uploadFailed'));
    } finally {
      setBusy(null);
    }
  };

  if (phase.kind === 'recording') {
    const { widgets } = phase;
    return (
      <TourRecorder
        matcher={phase.matcher}
        onFinish={(recording) =>
          recording.frames.length > 0
            ? setPhase({ kind: 'review', recording, widgets })
            : onEnd()
        }
        onDiscard={onEnd}
      />
    );
  }

  if (phase.kind === 'review') {
    const { recording, widgets } = phase;
    return (
      <FrameReview
        recording={recording}
        busy={busy}
        error={error}
        onUpload={(frames) => void upload(recording, widgets, frames)}
        onDiscard={() =>
          void showConfirm(t('glRecorder.reviewDiscardConfirm'), {
            title: t('glRecorder.reviewDiscard'),
            variant: 'danger',
            confirmLabel: t('glRecorder.reviewDiscard'),
          }).then((ok) => ok && onEnd())
        }
      />
    );
  }

  if (phase.kind === 'studio') {
    return (
      <Suspense fallback={null}>
        <GuidedLearningStudio
          set={phase.set}
          meta={null}
          aiDrafts={phase.drafts}
          onClose={onEnd}
          onSave={saveBuildingSet}
        />
      </Suspense>
    );
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gl-record-start-title"
      data-tour-ignore=""
      className="fixed inset-0 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      style={{ zIndex: Z_INDEX.tour }}
    >
      <form
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-5 shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          begin();
        }}
      >
        <h2
          id="gl-record-start-title"
          className="text-lg font-bold text-slate-900"
        >
          {t('glRecorder.startTitle')}
        </h2>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
          {t('glRecorder.startWhat')}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder={t('glRecorder.startWhatPlaceholder')}
            className="rounded-lg border border-slate-300 px-3 py-2 font-normal text-slate-800 placeholder:text-slate-400 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
          />
        </label>
        <ul className="flex flex-col gap-2.5 text-sm text-slate-700">
          <li className="flex gap-2">
            <EyeOff
              className="mt-0.5 h-4 w-4 shrink-0 text-slate-500"
              aria-hidden="true"
            />
            {t('glRecorder.startBlur')}
          </li>
          <li className="flex gap-2">
            <ShieldCheck
              className="mt-0.5 h-4 w-4 shrink-0 text-slate-500"
              aria-hidden="true"
            />
            {t('glRecorder.startReview')}
          </li>
        </ul>
        <p className="text-sm text-slate-600">{t('glRecorder.startTip')}</p>
        {unloaded > 0 && (
          <p role="alert" className="text-sm font-semibold text-red-700">
            {t('glRecorder.startUnloaded', { count: unloaded })}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onEnd}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            {t('glRecorder.cancel')}
          </button>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue-dark"
          >
            <Circle className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            {t('glRecorder.startContinue')}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};

export default RecordingSession;
