import { Modal } from '@/components/common/Modal';
import React, { useEffect, useState } from 'react';
import { TourRecorder } from '@/components/widgets/GuidedLearning/components/recorder/TourRecorder';
import {
  STUDENT_TOUR_PROBE,
  STUDENT_TOUR_READY,
  STUDENT_TOUR_RECEIVED,
  adminTabOf,
  sendStudentRecording,
} from '@/utils/studentTourHandoff';
import { StudentHelpButton } from './StudentHelpButton';

type Phase = 'idle' | 'recording' | 'sending' | 'sent' | 'lost';

// The admin tab answers at once; no answer means it closed or moved on.
const RECEIPT_TIMEOUT_MS = 5000;

/** View as student: records a tour of this page and hands it to the admin's own tab, which saves it. */
export const StudentPreviewRecorder: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');

  // Record shows only once the admin's own tab answers that it takes student recordings.
  useEffect(() => {
    const admin = adminTabOf();
    if (!admin) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== admin) return;
      const type = (e.data as { type?: unknown } | null)?.type;
      if (type === STUDENT_TOUR_READY) setReady(true);
      else if (type === STUDENT_TOUR_RECEIVED)
        setPhase((p) => (p === 'sending' ? 'sent' : p));
    };
    window.addEventListener('message', onMessage);
    admin.postMessage({ type: STUDENT_TOUR_PROBE }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (phase !== 'sending') return;
    const timer = setTimeout(() => setPhase('lost'), RECEIPT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (!ready) return null;
  if (phase === 'recording')
    return (
      <TourRecorder
        matcher={null}
        onFinish={(recording) =>
          setPhase(
            recording.frames.length === 0
              ? 'idle'
              : sendStudentRecording(recording)
                ? 'sending'
                : 'lost'
          )
        }
        onDiscard={() => setPhase('idle')}
      />
    );

  return (
    <>
      <StudentHelpButton items={[]} onRecord={() => setPhase('recording')} />
      {(phase === 'sent' || phase === 'lost') && (
        <Modal
          isOpen
          onClose={() => setPhase('idle')}
          dismissible={false}
          variant="bare"
          zIndex="z-dialog"
          maxWidth="max-w-sm"
          ariaLabelledby="student-recording-sent"
          rootProps={{ 'data-tour-ignore': '' }}
          className="rounded-2xl bg-white shadow-2xl"
        >
          <div className="flex flex-col gap-4 p-5 text-center">
            <p
              id="student-recording-sent"
              className="text-sm font-semibold text-slate-800"
            >
              {phase === 'sent'
                ? 'Finish in your SpartBoard tab. Review the pictures and save there.'
                : "This recording couldn't be saved. Keep your SpartBoard tab open and record again."}
            </p>
            <button
              type="button"
              onClick={() => setPhase('idle')}
              className="self-center rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue-dark"
            >
              OK
            </button>
          </div>
        </Modal>
      )}
    </>
  );
};
