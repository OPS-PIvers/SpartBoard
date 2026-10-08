// DEV-only: the assign stepper shell with placeholder step bodies, for /assign-stepper-dev.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React, { useState } from 'react';
import { Play } from 'lucide-react';
import { AssignStepper } from './AssignStepper';
import { AssignTopSwitch } from './AssignTopSwitch';
import {
  getAssignSteps,
  getAssignStepTitle,
  type AssignActivity,
  type AssignKind,
  type AssignStepDef,
  type AssignStepId,
} from './assignSteps';
import {
  KIND_SWITCH_OPTIONS,
  PACING_SWITCH_OPTIONS,
  type AssignPacing,
} from './assignTopSwitchOptions';

const TITLES: Record<AssignActivity, string> = {
  quiz: 'Sample Quiz',
  video: 'Cell Division Video',
  gl: 'Parts of a Cell',
  flashcards: 'Unit 3 Vocabulary',
};

const VALUES: Record<AssignStepId, string> = {
  classes: 'All 3 classes',
  when: 'Manual',
  attempts: '1 attempt',
  integrity: 'Off',
  feedback: 'Their score',
  check: 'Flashcards, hide until I publish',
  sharing: 'Not shared',
};

const ACTIVITIES: AssignActivity[] = ['quiz', 'video', 'gl', 'flashcards'];

const Preview: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const activity: AssignActivity = ACTIVITIES.includes(
    params.get('activity') as AssignActivity
  )
    ? (params.get('activity') as AssignActivity)
    : 'quiz';
  const inPlc = params.get('plc') === '1';
  const [open, setOpen] = useState(true);
  const [kind, setKind] = useState<AssignKind>('work');
  const [pacing, setPacing] = useState<AssignPacing>('student');
  const live = activity === 'video' && pacing === 'teacher';
  const ctx = { kind, live, inPlc };

  const steps: AssignStepDef[] = getAssignSteps(activity, ctx).map((id) => ({
    id,
    title: getAssignStepTitle(id, activity, ctx),
    value: id === 'when' && live ? 'You start it from the board' : VALUES[id],
    body: (
      <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
        {getAssignStepTitle(id, activity, ctx)} body
      </div>
    ),
  }));

  const topSwitch =
    activity === 'video' ? (
      <AssignTopSwitch
        value={pacing}
        onChange={setPacing}
        options={PACING_SWITCH_OPTIONS}
        ariaLabel="Pacing"
      />
    ) : activity === 'quiz' ? undefined : (
      <AssignTopSwitch
        value={kind}
        onChange={setKind}
        options={KIND_SWITCH_OPTIONS}
        ariaLabel="Student work"
      />
    );

  return (
    <div className="space-y-2 text-sm text-slate-600">
      <p>Add ?activity=quiz|video|gl|flashcards and &amp;plc=1 to the URL.</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-bold text-brand-blue-primary"
      >
        Open
      </button>
      <AssignStepper
        isOpen={open}
        onClose={() => setOpen(false)}
        title={TITLES[activity]}
        topSwitch={topSwitch}
        steps={steps}
        submitLabel={live ? 'Start live' : 'Assign'}
        submitIcon={live ? Play : undefined}
        onSubmit={() => setOpen(false)}
      />
    </div>
  );
};

const preview = { title: 'Stepper shell', render: Preview };
export default preview;
