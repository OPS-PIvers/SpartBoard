import React, { useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { GuidedLearningStep, WidgetType } from '@/types';
import { Z_INDEX } from '@/config/zIndex';
import { useAuth } from '@/context/useAuth';
import { DashboardContext } from '@/context/DashboardContextValue';
import { useStorage } from '@/hooks/useStorage';
import type { TourSlots } from '@/components/tours/tourSession';
import { prepareImageForUpload } from '@/utils/guidedLearningMedia';
import { logError } from '@/utils/logError';
import { TourRecorder } from '@/components/widgets/GuidedLearning/components/recorder/TourRecorder';
import { buildNameMatcher } from '@/components/widgets/GuidedLearning/components/recorder/redaction';
import { draftRecordedStepText } from '@/components/widgets/GuidedLearning/components/recorder/draftStepText';
import {
  frameSize,
  uploadFramesOnce,
  type UploadedFrame,
} from '@/components/widgets/GuidedLearning/components/recorder/recordingHandoff';
import type { RecordedFrame } from '@/components/widgets/GuidedLearning/components/recorder/buildRecordedSet';
import type { TourRecording } from '@/components/widgets/GuidedLearning/components/recorder/useTourCapture';
import { recordedTourSteps } from './recordedSteps';

interface Props {
  /** Tour slot to widget id on the stage. */
  slots: TourSlots;
  /** The tour title, as the goal for drafted step text. */
  goal?: string;
  onDone: (steps: GuidedLearningStep[], imagePaths: string[]) => void;
  onCancel: () => void;
}

/** Records real clicks on the board and turns each into a step, its frame uploaded as the thumbnail. */
export const RecordFromHere: React.FC<Props> = ({
  slots,
  goal,
  onDone,
  onCancel,
}) => {
  const { t } = useTranslation();
  const { user, canAccessFeature } = useAuth();
  const canDraftText =
    canAccessFeature('gemini-functions') &&
    canAccessFeature('guided-learning-ai');
  const dashboard = useContext(DashboardContext);
  const { uploadGuidedLearningImage } = useStorage();
  // Built once; the roster names never leave this matcher.
  const [matcher] = useState(() =>
    buildNameMatcher((dashboard?.rosters ?? []).flatMap((r) => r.students))
  );
  const [busy, setBusy] = useState<string | null>(null);
  const uploaded = useRef(new Map<Blob, UploadedFrame>());

  const uploadFrames = async (frames: Blob[]): Promise<RecordedFrame[]> => {
    if (!user) return [];
    const results = await uploadFramesOnce(
      frames,
      uploaded.current,
      async (frame, i) => {
        const file = new File([frame], `tour-step-${i + 1}.png`, {
          type: frame.type || 'image/png',
        });
        const prepared = await prepareImageForUpload(file);
        // Recordings are district content, so they live on Storage.
        return uploadGuidedLearningImage(
          user.uid,
          prepared,
          prepared.name,
          'storage'
        );
      },
      (current, total) => setBusy(t('glRecorder.uploading', { current, total }))
    );
    const sizes = await Promise.all(frames.map(frameSize));
    return results.map((r, i) => ({
      url: r.url,
      ...sizes[i],
      ...(r.storagePath ? { storagePath: r.storagePath } : {}),
    }));
  };

  const finish = async (recording: TourRecording) => {
    if (recording.steps.length === 0) {
      onCancel();
      return;
    }
    setBusy(t('glRecorder.uploading', { current: 1, total: 1 }));
    // Steps still bind without pictures, so a failed upload never loses the recording.
    const frames = await uploadFrames(recording.frames).catch(
      (err: unknown) => {
        logError('RecordFromHere', err);
        return [] as RecordedFrame[];
      }
    );
    const title = goal?.trim() ?? '';
    if (canDraftText) setBusy(t('glRecorder.drafting'));
    const drafted = canDraftText
      ? await draftRecordedStepText(recording, title || undefined).catch(
          () => []
        )
      : [];
    const typeOf = new Map<string, WidgetType>(
      (dashboard?.activeDashboard?.widgets ?? []).map(
        (w) => [w.id, w.type] as const
      )
    );
    const steps = recordedTourSteps(recording.steps, frames, {
      slots,
      typeOf,
    }).map((step, i) => {
      const d = drafted[i];
      return d && (d.label || d.text)
        ? { ...step, label: d.label, text: d.text, aiDraft: true }
        : step;
    });
    onDone(
      steps,
      frames.flatMap((f) => (f.storagePath ? [f.storagePath] : []))
    );
  };

  if (busy) {
    return createPortal(
      <div
        role="status"
        data-tour-ignore=""
        data-testid="record-from-here-busy"
        className="fixed left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-slate-900/90 px-4 py-2 text-sm font-semibold text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-xl"
        style={{
          zIndex: Z_INDEX.tour,
          top: 'calc(1rem + env(safe-area-inset-top, 0px))',
        }}
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {busy}
      </div>,
      document.body
    );
  }

  return (
    <TourRecorder
      matcher={matcher}
      onFinish={(recording) => void finish(recording)}
      onDiscard={onCancel}
    />
  );
};
