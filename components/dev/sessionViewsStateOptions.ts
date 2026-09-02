/**
 * View and state option lists for SessionViewsDevHarness, kept in their own
 * module so the harness file only exports its component (react-refresh).
 */

import {
  AUDIO_CAPTURE_STATES,
  AUDIO_CAPTURE_DARK_STATES,
  type AudioCaptureStateKey,
} from './AudioCaptureDevView';
import {
  RECORDING_CONTROL_STATES,
  type RecordingControlStateKey,
} from './RecordingControlsDevView';
import {
  QUIZ_EDITOR_STATES,
  type QuizEditorStateKey,
} from './QuizEditorDevView';
import {
  MEDIA_GRADING_STATES,
  type MediaGradingStateKey,
} from './MediaGradingDevView';
import {
  RESULTS_PLAYBACK_STATES,
  type ResultsPlaybackStateKey,
} from './ResultsPlaybackDevView';

export type ViewKey =
  | 'quiz-monitor'
  | 'quiz-present'
  | 'quiz-results'
  | 'va-monitor'
  | 'va-results'
  | 'audio-capture'
  | 'recording-controls'
  | 'quiz-editor'
  | 'media-grading'
  | 'results-playback';

export type StateKey =
  | 'waiting'
  | 'live'
  | 'reviewing'
  | 'self-paced'
  | 'paused'
  | 'ended'
  | 'populated'
  | 'empty'
  | AudioCaptureStateKey
  | RecordingControlStateKey
  | QuizEditorStateKey
  | MediaGradingStateKey
  | ResultsPlaybackStateKey;

export const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'quiz-monitor', label: 'Quiz Monitor' },
  { key: 'quiz-present', label: 'Quiz Present' },
  { key: 'quiz-results', label: 'Quiz Results' },
  { key: 'va-monitor', label: 'VA Monitor' },
  { key: 'va-results', label: 'VA Results' },
  { key: 'audio-capture', label: 'Audio capture' },
  { key: 'recording-controls', label: 'Recording controls' },
  { key: 'quiz-editor', label: 'Quiz editor' },
  { key: 'media-grading', label: 'Media grading' },
  { key: 'results-playback', label: 'Results playback' },
];

export interface StateOption {
  id: string;
  key: StateKey;
  label: string;
}

// Families share state values ('archiving', 'deleted' and 'provisional' are in
// both the grading and playback lists), so `id` qualifies the key by family.
const qualify = (
  family: ViewKey | 'session',
  states: readonly StateKey[],
  label: (key: StateKey) => string
): StateOption[] =>
  states.map((key) => ({ id: `${family}:${key}`, key, label: label(key) }));

// State keys are partitioned by view family: monitors use the lifecycle
// states (waiting/live/paused/ended), results use populated/empty. Offering
// an irrelevant state for a view (e.g. "paused" on a results view) is a
// harmless no-op — the mapper coerces to a sensible session status.
const SESSION_STATE_LABELS: Record<string, string> = {
  waiting: 'Waiting (no responses)',
  live: 'Live',
  reviewing: 'Reviewing (present)',
  'self-paced': 'Self-paced (present)',
  paused: 'Paused',
  ended: 'Ended',
  populated: 'Populated (results)',
  empty: 'Empty (results)',
};

export const STATES: StateOption[] = [
  ...qualify(
    'session',
    Object.keys(SESSION_STATE_LABELS) as StateKey[],
    (key) => SESSION_STATE_LABELS[key]
  ),
  ...qualify(
    'audio-capture',
    AUDIO_CAPTURE_STATES as readonly StateKey[],
    (key) => `Audio: ${key}`
  ),
  ...qualify(
    'audio-capture',
    AUDIO_CAPTURE_DARK_STATES as readonly StateKey[],
    (key) => `Audio (dark): ${key.slice('dark-'.length)}`
  ),
  ...qualify(
    'recording-controls',
    RECORDING_CONTROL_STATES as readonly StateKey[],
    (key) => `Recording: ${key.slice('rc-'.length)}`
  ),
  ...qualify(
    'quiz-editor',
    QUIZ_EDITOR_STATES as readonly StateKey[],
    (key) => `Editor: ${key.slice('qe-'.length)}`
  ),
  ...qualify(
    'media-grading',
    MEDIA_GRADING_STATES as readonly StateKey[],
    (key) => `Grading: ${key}`
  ),
  ...qualify(
    'results-playback',
    RESULTS_PLAYBACK_STATES as readonly StateKey[],
    (key) => `Playback: ${key}`
  ),
];
