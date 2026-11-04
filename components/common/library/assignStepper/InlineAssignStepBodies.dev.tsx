// DEV-only: the LTI / Classroom add-on Assignment settings card, with the step bodies (D22); `&activity=video` for Video Activity.
/* eslint-disable react-refresh/only-export-components -- the harness reads a default { title, render } export */
import React, { useState } from 'react';
import type { QuizBehaviorSettings } from '@/types';
import { AddonCard } from '@/components/classroomAddon/AddonShell';
import { AssignTargetingSection } from '../AssignTargetingSection';
import { EMPTY_ASSIGN_TARGETING_VALUE } from '@/utils/studentTargetRef';
import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';
import { DEFAULT_VA_BEHAVIOR } from '@/utils/videoActivityBehavior';
import {
  videoRulesPrefill,
  type VideoAssignRules,
} from './VideoRuleStepValues';
import { InlineAssignStepBodies } from './InlineAssignStepBodies';
import { defaultWhenValue } from './assignWhenValue';
import { SAMPLE_ROSTERS } from './assignStepperTestRosters';

const ROSTERS = SAMPLE_ROSTERS.slice(0, 1);

const params = new URLSearchParams(window.location.search);
const VIDEO = params.get('activity') === 'video';

const Preview: React.FC = () => {
  const [videoRules, setVideoRules] = useState<VideoAssignRules>(() =>
    videoRulesPrefill(DEFAULT_VA_BEHAVIOR, null)
  );
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
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Your name{' '}
            <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input // no-tour-anchor: dev-only mockup page, not on the teacher board
            type="text"
            placeholder="Teacher name"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
          />
        </div>
        <div className="space-y-3 border-t border-slate-200 pt-4">
          <InlineAssignStepBodies
            activity={VIDEO ? 'video' : 'quiz'}
            when={when}
            onWhenChange={setWhen}
            rosters={ROSTERS}
            behavior={behavior}
            onBehaviorChange={setBehavior}
            videoRules={VIDEO ? videoRules : null}
            onVideoRulesChange={setVideoRules}
          />
          <AssignTargetingSection
            rosters={ROSTERS}
            selectedRosterIds={ROSTERS.map((r) => r.id)}
            value={targeting}
            onChange={setTargeting}
            scheduleHidden
            kind={VIDEO ? 'video-activity' : 'quiz'}
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
