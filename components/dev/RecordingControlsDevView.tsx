/**
 * DEV-only fixture for the per-question recording controls and the editor's
 * live advisory. Mounts the REAL components (no forks) with the media gate
 * granted — the gate itself lives in `QuizEditorDetailPane` and cannot be
 * granted on the auth-bypass dev server, which has no permission record.
 */
import React, { useMemo, useState } from 'react';
import { ResponseFormatSection } from '@/components/widgets/QuizWidget/components/ResponseFormatSection';
import { QuizAuthoringAdvisory } from '@/components/widgets/QuizWidget/components/QuizAuthoringAdvisory';
import { DEFAULT_RECORDING_CONFIG } from '@/config/quizRecordingDefaults';
import type {
  QuizQuestion,
  WhiteboardStartingPattern,
  WhiteboardStartingImage,
} from '@/types';
import { type RecordingControlStateKey } from './devViewStates';

const SAMPLE_IMAGE: WhiteboardStartingImage = {
  driveFileId: 'dev-sample',
  url: 'https://drive.google.com/file/d/dev-sample/view',
  mimeType: 'image/svg+xml',
  width: 800,
  height: 500,
};

// Uploads nothing; returns the sample so the image states can be shown.
const fakeUpload = (): Promise<WhiteboardStartingImage> =>
  Promise.resolve(SAMPLE_IMAGE);

// Prefixed so no key collides with AUDIO_CAPTURE_STATES in the harness picker.

const baseQuestion = (): QuizQuestion => ({
  id: 'dev-q1',
  timeLimit: 0,
  text: 'Explain how you solved problem 4 out loud.',
  type: 'free-response',
  correctAnswer: '',
  incorrectAnswers: [],
});

function seedQuestion(state: RecordingControlStateKey): QuizQuestion {
  const q = baseQuestion();
  if (state === 'rc-typed') return { ...q, timeLimit: 45 };
  if (state === 'rc-clamped-limit') {
    // Over the audio ceiling, as an imported quiz can be.
    return {
      ...q,
      recording: { ...DEFAULT_RECORDING_CONFIG, limitSeconds: 420 },
    };
  }
  if (state.startsWith('rc-whiteboard')) {
    const pattern: WhiteboardStartingPattern =
      state === 'rc-whiteboard-plane'
        ? { kind: 'coordinate-plane', xMin: -10, xMax: 10, yMin: -10, yMax: 10 }
        : state === 'rc-whiteboard-number-line'
          ? { kind: 'number-line', min: 0, max: 10, step: 1 }
          : state === 'rc-whiteboard-shape'
            ? { kind: 'shape', shape: 'polygon', sides: 6 }
            : state === 'rc-whiteboard-image'
              ? { kind: 'grid' }
              : { kind: 'blank' };
    return {
      ...q,
      text: 'Show how you found the area of the shaded region.',
      recording: {
        ...DEFAULT_RECORDING_CONFIG,
        mode: 'whiteboard',
        explainAloud: true,
        limitSeconds: 180,
        startingPage: {
          pattern,
          ...(state === 'rc-whiteboard-image' ? { image: SAMPLE_IMAGE } : {}),
        },
      },
    };
  }
  if (state === 'rc-take-limit') {
    return { ...q, recording: { ...DEFAULT_RECORDING_CONFIG, takeLimit: 2 } };
  }
  return { ...q, recording: { ...DEFAULT_RECORDING_CONFIG } };
}

export const RecordingControlsDevView: React.FC<{
  state: RecordingControlStateKey;
}> = ({ state }) => {
  const [question, setQuestion] = useState<QuizQuestion>(() =>
    seedQuestion(state)
  );

  // Adjusting state while rendering — the state picker replaces the fixture.
  const [lastState, setLastState] = useState(state);
  if (lastState !== state) {
    setLastState(state);
    setQuestion(seedQuestion(state));
  }

  const advisoryQuestions = useMemo(() => {
    if (state !== 'rc-advisory') return [question];
    const second: QuizQuestion = {
      ...baseQuestion(),
      id: 'dev-q2',
      text: 'Read the passage aloud.',
      recording: { ...DEFAULT_RECORDING_CONFIG },
      stimulusIds: ['s1'],
    };
    return [{ ...question, stimulusIds: ['s1'] }, second];
  }, [question, state]);

  return (
    <div className="h-full w-full overflow-auto bg-slate-50 p-6 space-y-4">
      <div className="max-w-md space-y-3">
        <QuizAuthoringAdvisory
          questions={advisoryQuestions}
          shuffleQuestionsEnabled={state === 'rc-advisory'}
        />
        <ResponseFormatSection
          question={question}
          whiteboardAllowed={state.startsWith('rc-whiteboard')}
          onUploadWhiteboardImage={fakeUpload}
          onChange={(updates) => setQuestion((q) => ({ ...q, ...updates }))}
        />
      </div>
    </div>
  );
};
