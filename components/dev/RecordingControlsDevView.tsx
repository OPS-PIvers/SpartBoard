/**
 * DEV-only fixture for the per-question recording controls and the editor's
 * live advisory. Mounts the REAL components (no forks) with the media gate
 * granted — the gate itself lives in `QuizEditorDetailPane` and cannot be
 * granted on the auth-bypass dev server, which has no permission record.
 */
import React, { useMemo, useState } from 'react';
import { RecordingConfigSection } from '@/components/widgets/QuizWidget/components/RecordingConfigSection';
import { QuizAuthoringAdvisory } from '@/components/widgets/QuizWidget/components/QuizAuthoringAdvisory';
import { DEFAULT_RECORDING_CONFIG } from '@/config/quizRecordingDefaults';
import type { QuizQuestion } from '@/types';

// Prefixed so no key collides with AUDIO_CAPTURE_STATES in the harness picker.
export const RECORDING_CONTROL_STATES = [
  'rc-disabled',
  'rc-enabled-defaults',
  'rc-clamped-limit',
  'rc-take-limit',
  'rc-advisory',
] as const;

export type RecordingControlStateKey =
  (typeof RECORDING_CONTROL_STATES)[number];

const baseQuestion = (): QuizQuestion => ({
  id: 'dev-q1',
  timeLimit: 0,
  text: 'Explain how you solved problem 4 out loud.',
  type: 'short',
  correctAnswer: '',
  incorrectAnswers: [],
});

function seedQuestion(state: RecordingControlStateKey): QuizQuestion {
  const q = baseQuestion();
  if (state === 'rc-disabled') return { ...q, timeLimit: 45 };
  if (state === 'rc-clamped-limit') {
    // Over the audio ceiling, as an imported quiz can be.
    return {
      ...q,
      recording: { ...DEFAULT_RECORDING_CONFIG, limitSeconds: 420 },
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
        <RecordingConfigSection
          question={question}
          onChange={(updates) => setQuestion((q) => ({ ...q, ...updates }))}
        />
      </div>
    </div>
  );
};
