// DEV-only: the LTI / Classroom add-on Assignment settings card, today's (?before=1) and with the step bodies (D22).
/* eslint-disable react-refresh/only-export-components -- the harness reads a default { title, render } export */
import React, { useState } from 'react';
import type { QuizBehaviorSettings } from '@/types';
import { AddonCard } from '@/components/classroomAddon/AddonShell';
import { AssignTargetingSection } from '../AssignTargetingSection';
import { QuizAssignSettingsInline } from '../QuizAssignSettingsInline';
import { EMPTY_ASSIGN_TARGETING_VALUE } from '@/utils/studentTargetRef';
import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';
import { InlineAssignStepBodies } from './InlineAssignStepBodies';
import { defaultWhenValue } from './assignWhenValue';
import { SAMPLE_ROSTERS } from './assignStepperTestRosters';

const ROSTERS = SAMPLE_ROSTERS.slice(0, 1);

const Preview: React.FC = () => {
  const before = new URLSearchParams(window.location.search).get('before');
  const [behavior, setBehavior] = useState<QuizBehaviorSettings>(() =>
    structuredClone(DEFAULT_QUIZ_BEHAVIOR)
  );
  const [when, setWhen] = useState(() =>
    defaultWhenValue({
      activity: 'quiz',
      bellAvailable: false,
      manualAvailable: false,
    })
  );
  const [targeting, setTargeting] = useState(EMPTY_ASSIGN_TARGETING_VALUE);

  return (
    <div className="mx-auto w-full max-w-xl">
      <AddonCard className="space-y-4 p-4">
        <h2 className="text-sm font-semibold text-slate-900">
          Assignment settings
        </h2>
        {before && (
          <QuizAssignSettingsInline value={behavior} onChange={setBehavior} />
        )}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Your name{' '}
            <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            type="text"
            placeholder="Teacher name"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
          />
        </div>
        <div className="space-y-3 border-t border-slate-200 pt-4">
          {!before && (
            <InlineAssignStepBodies
              activity="quiz"
              when={when}
              onWhenChange={setWhen}
              rosters={ROSTERS}
              behavior={behavior}
              onBehaviorChange={setBehavior}
            />
          )}
          <AssignTargetingSection
            rosters={ROSTERS}
            selectedRosterIds={ROSTERS.map((r) => r.id)}
            value={targeting}
            onChange={setTargeting}
            availabilityEnabled
            scheduleHidden={!before}
            kind="quiz"
          />
        </div>
      </AddonCard>
    </div>
  );
};

export default {
  title: 'LTI and add-on settings',
  render: Preview,
};
