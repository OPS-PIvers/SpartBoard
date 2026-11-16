import type { CustomField } from '@/components/settings/schema/types';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { EmbedConfig } from '@/types';
import { EmbedContentControl } from './EmbedContentControl';

const renderContentControl: CustomField<'mode'>['render'] = (ctx) => (
  <EmbedContentControl {...ctx} />
);

const schema = defineSettings<EmbedConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // schema-gap: buildingGatedContent — see EmbedContentControl.tsx.
        {
          key: 'mode',
          type: 'custom',
          label: 'modeLabel',
          render: renderContentControl,
        },
      ],
    },
    {
      id: 'behavior',
      fields: [
        {
          key: 'refreshInterval',
          type: 'select',
          label: 'refreshIntervalLabel',
          options: [
            { value: 0, label: 'refreshDisabled' },
            { value: 1, label: 'refresh1Min' },
            { value: 5, label: 'refresh5Min' },
            { value: 15, label: 'refresh15Min' },
            { value: 30, label: 'refresh30Min' },
            { value: 60, label: 'refresh1Hour' },
          ],
        },
        {
          key: 'blockNewTabs',
          type: 'toggle',
          label: 'blockNewTabsLabel',
          help: 'blockNewTabsHelp',
          visibleWhen: (ctx) => ctx.canAccessFeature('embed-block-new-tabs'),
        },
      ],
    },
  ],
});

export default schema;
