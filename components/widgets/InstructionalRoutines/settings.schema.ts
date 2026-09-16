import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type {
  CustomRenderCtx,
  FieldCtx,
} from '@/components/settings/schema/types';
import type { InstructionalRoutinesConfig, RoutineStep } from '@/types';
import { QUICK_TOOLS } from './constants';
import { SwitchRoutineField } from './settingsFields';

const renderSwitchRoutine = (ctx: CustomRenderCtx) =>
  React.createElement(SwitchRoutineField, { ctx });

const attachedToolOptions = QUICK_TOOLS.map((tool) => ({
  value: tool.label,
  label: `tool.${tool.type === 'none' ? 'none' : tool.label.replace(/[^a-z0-9]+/gi, '').toLowerCase()}`,
}));

export default defineSettings<InstructionalRoutinesConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // schema-gap: widgetStateAction
        {
          key: 'selectedRoutineId',
          type: 'custom',
          label: 'routineTemplate',
          render: renderSwitchRoutine,
        },
        {
          key: 'customSteps',
          type: 'list',
          label: 'steps',
          addLabel: 'addStep',
          sortable: true,
          row: {
            createRow: () => ({
              id: crypto.randomUUID(),
              text: '',
              icon: 'Zap',
            }),
            fields: [
              { key: 'icon', type: 'iconPicker', label: 'stepIcon' },
              {
                key: 'label',
                type: 'text',
                label: 'stepKeyword',
                placeholder: 'stepKeywordPlaceholder',
                visibleWhen: (ctx: FieldCtx) => ctx.isAdmin,
              },
              {
                key: 'text',
                type: 'textarea',
                label: 'studentDirection',
                placeholder: 'studentDirectionPlaceholder',
                rows: 2,
              },
              {
                key: 'attachedWidget',
                type: 'select',
                label: 'attachedTool',
                readValue: (ctx) => {
                  const attached = ctx.config.attachedWidget;
                  return attached && typeof attached === 'object'
                    ? (attached as RoutineStep['attachedWidget'])?.label
                    : 'None';
                },
                toPatch: (value) => {
                  const selected = QUICK_TOOLS.find(
                    (tool) => tool.label === value
                  );
                  return selected?.type !== 'none' && selected?.config
                    ? {
                        attachedWidget: {
                          type: selected.type,
                          label: selected.label,
                          config: selected.config,
                        },
                      }
                    : { attachedWidget: undefined };
                },
                options: attachedToolOptions,
              },
            ],
          },
        },
      ],
    },
  ],
  styleKeys: ['scaleMultiplier'],
});
