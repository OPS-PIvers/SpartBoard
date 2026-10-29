// Fixture state lists for the session-views dev harness, kept out of the view files for fast refresh.

export const AUDIO_CAPTURE_STATES = [
  'notice',
  'prep',
  'armed',
  'recording',
  'review',
  'recovered',
  'no-review-recording',
  'committing',
  'archive-failed',
  'take-limit',
  'window-closed',
  'mic-unavailable',
  // Not AudioResponseCapture — SubmitBlockedNotice, the self-paced quiz's
  // submit gate. Only reachable in production behind the light prop (the
  // quiz app is light-only); the dark variant stays a harness-only fixture.
  'submit-blocked',
] as const;
/** Same states in the dark (teacher-paced) shell. */
export const AUDIO_CAPTURE_DARK_STATES = AUDIO_CAPTURE_STATES.map(
  (key) => `dark-${key}`
) as readonly `dark-${(typeof AUDIO_CAPTURE_STATES)[number]}`[];
export type AudioCaptureStateKey =
  | (typeof AUDIO_CAPTURE_STATES)[number]
  | (typeof AUDIO_CAPTURE_DARK_STATES)[number];

export const MEDIA_GRADING_STATES = [
  'queue',
  'typed',
  'typed-guide',
  'playing',
  'provisional',
  'capture-unavailable',
  'archiving',
  'deleted',
  'mic-blocked',
  'device-gated',
  'whiteboard',
] as const;
export type MediaGradingStateKey = (typeof MEDIA_GRADING_STATES)[number];

export const QUIZ_EDITOR_STATES = [
  'qe-gated',
  'qe-ungated',
  'qe-bank',
  'qe-bank-slot',
  'qe-sections',
] as const;
export type QuizEditorStateKey = (typeof QUIZ_EDITOR_STATES)[number];

export const RECORDING_CONTROL_STATES = [
  'rc-typed',
  'rc-enabled-defaults',
  'rc-clamped-limit',
  'rc-take-limit',
  'rc-advisory',
  'rc-whiteboard',
  'rc-whiteboard-plane',
  'rc-whiteboard-number-line',
  'rc-whiteboard-shape',
  'rc-whiteboard-image',
] as const;
export type RecordingControlStateKey =
  (typeof RECORDING_CONTROL_STATES)[number];

export const RESULTS_PLAYBACK_STATES = [
  'playable',
  'archiving',
  'failed',
  'deleted',
  'provisional',
  'wb-show',
  'wb-ready',
  'wb-archiving',
  'wb-deleted',
] as const;
export type ResultsPlaybackStateKey = (typeof RESULTS_PLAYBACK_STATES)[number];

export const STUDENT_QUIZ_STATES = [
  'sq-timed',
  'sq-last-minute',
  'sq-stimuli',
  'sq-calculator',
  'sq-whiteboard',
  'sq-stop-part',
  'sq-stop-wait',
  'sq-stop-open',
  'sq-attempts',
  'sq-attempts-live',
  'sq-fullscreen',
  'sq-cross-out',
] as const;
export type StudentQuizStateKey = (typeof STUDENT_QUIZ_STATES)[number];

export const VA_STUDENT_STATES = [
  'vs-today',
  'vs-reveal-off',
  'vs-result-off',
  'vs-shuffle',
] as const;
export type VaStudentStateKey = (typeof VA_STUDENT_STATES)[number];
