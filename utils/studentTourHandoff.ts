// View as student recording handoff: the student tab records, the admin's own tab saves.
import type { TourRecording } from '@/components/widgets/GuidedLearning/components/recorder/useTourCapture';

export const STUDENT_TOUR_PROBE = 'spart-student-tour-probe';
export const STUDENT_TOUR_READY = 'spart-student-tour-ready';
export const STUDENT_TOUR_RECORDING = 'spart-student-tour-recording';
export const STUDENT_TOUR_RECEIVED = 'spart-student-tour-received';

/** The admin's own tab: the opener of the teacher View as tab that opened this student tab. */
export function adminTabOf(win: Window = window): Window | null {
  try {
    const teacher = win.opener as Window | null;
    return (teacher?.opener as Window | null) ?? null;
  } catch {
    return null;
  }
}

/** True when `source` is a student tab this admin tab opened through a teacher View as tab. */
export function isMyStudentTab(
  source: MessageEventSource | null,
  self: Window = window
): source is Window {
  if (!source || !('opener' in source)) return false;
  try {
    return adminTabOf(source) === self;
  } catch {
    return false;
  }
}

export function sendStudentRecording(recording: TourRecording): boolean {
  const admin = adminTabOf();
  if (!admin) return false;
  admin.postMessage(
    { type: STUDENT_TOUR_RECORDING, recording },
    window.location.origin
  );
  return true;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object';

export function isRecording(value: unknown): value is TourRecording {
  if (!isObject(value)) return false;
  const { frames, redactions, raw, steps } = value;
  return (
    Array.isArray(frames) &&
    frames.every((f) => f instanceof Blob) &&
    Array.isArray(redactions) &&
    redactions.length === frames.length &&
    redactions.every(Array.isArray) &&
    (raw === undefined ||
      (Array.isArray(raw) &&
        raw.length === frames.length &&
        raw.every((f) => f instanceof Blob))) &&
    Array.isArray(steps) &&
    steps.every(
      (st) =>
        isObject(st) &&
        typeof st.id === 'string' &&
        typeof st.frameIndex === 'number' &&
        st.frameIndex >= -1 &&
        st.frameIndex < frames.length
    )
  );
}
