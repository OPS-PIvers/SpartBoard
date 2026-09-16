import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { PollConfig } from '@/types';
import { PollSettings } from './settingsFields';

const renderSection = (section: 'content' | 'behavior', ctx: CustomRenderCtx) =>
  React.createElement(
    'div',
    {
      id: ctx.id,
      role: 'group',
      'aria-labelledby': ctx.labelId,
      'aria-describedby': ctx.describedBy,
    },
    React.createElement(PollSettings, { widget: ctx.widget, section })
  );

export default defineSettings<PollConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // schema-gap: multiQuestionEditor
        {
          key: 'questions',
          type: 'custom',
          label: 'questions',
          searchTerms: [
            'importClass',
            'draftWithAi',
            'options',
            'resetResults',
            'exportCsv',
          ],
          render: (ctx) => renderSection('content', ctx),
        },
      ],
    },
    {
      id: 'behavior',
      fields: [
        // schema-gap: remoteVotingSession
        {
          key: 'activePollSessionId',
          type: 'custom',
          label: 'liveVoting',
          searchTerms: [
            'joinCode',
            'startVoting',
            'stopVoting',
            'resumeVoting',
          ],
          render: (ctx) => renderSection('behavior', ctx),
        },
      ],
    },
  ],
});
