import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type {
  CustomRenderCtx,
  FieldCtx,
} from '@/components/settings/schema/types';
import type { ChecklistConfig } from '@/types';
import {
  ChecklistImportActionsField,
  ChecklistPoolGroupField,
} from './settingsFields';

const isManual = (ctx: FieldCtx) => (ctx.config.mode ?? 'manual') === 'manual';
const isRoster = (ctx: FieldCtx) => ctx.config.mode === 'roster';
const isCustomRoster = (ctx: FieldCtx) =>
  isRoster(ctx) && ctx.config.rosterMode === 'custom';
const renderImports = (ctx: CustomRenderCtx) =>
  React.createElement(ChecklistImportActionsField, { ctx });
const renderPoolGroup = (ctx: CustomRenderCtx) =>
  React.createElement(ChecklistPoolGroupField, { ctx });
// The permission half of the gate; the org-wide switch is a Firestore read, so
// the field itself checks it (see settingsFields.tsx).
const rosterGroupsPermitted = (ctx: FieldCtx) =>
  ctx.canAccessFeature('roster-groups');

export default defineSettings<ChecklistConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'mode',
          type: 'segmented',
          label: 'listSource',
          options: [
            { value: 'manual', label: 'customTasks' },
            { value: 'roster', label: 'classRoster' },
          ],
        },
        {
          key: 'items',
          type: 'list',
          label: 'tasks',
          addLabel: 'addTask',
          sortable: true,
          visibleWhen: isManual,
          row: {
            createRow: () => ({
              id: crypto.randomUUID(),
              text: '',
              completed: false,
            }),
            fields: [{ key: 'text', type: 'text', label: 'task' }],
          },
        },
        {
          key: 'rosterMode',
          type: 'rosterPicker',
          label: 'rosterSource',
          visibleWhen: isRoster,
        },
        {
          key: 'firstNames',
          type: 'textarea',
          label: 'firstNames',
          placeholder: 'firstNamesPlaceholder',
          rows: 8,
          visibleWhen: isCustomRoster,
        },
        {
          key: 'lastNames',
          type: 'textarea',
          label: 'lastNames',
          placeholder: 'lastNamesPlaceholder',
          rows: 8,
          visibleWhen: isCustomRoster,
        },
        // schema-gap: rosterGroupPool
        {
          key: 'rosterPoolGroupId',
          type: 'custom',
          label: 'poolGroup',
          visibleWhen: (ctx) =>
            rosterGroupsPermitted(ctx) && isRoster(ctx) && !isCustomRoster(ctx),
          render: renderPoolGroup,
        },
        // schema-gap: boardImportActions
        {
          key: 'completedNames',
          type: 'custom',
          label: 'importTasks',
          searchTerms: ['pasteTasks', 'importRoutine', 'importText'],
          render: renderImports,
        },
      ],
    },
  ],
  styleKeys: ['textSizePreset', 'fontFamily', 'fontColor', 'cardColor'],
});
