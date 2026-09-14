import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { UrlWidgetConfig } from '@/types';
import {
  DEFAULT_URL_COLOR,
  DEFAULT_URL_ICON_ID,
  URL_COLORS,
  URL_ICONS,
} from './icons';

type LinkRow = UrlWidgetConfig['urls'][number];

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === '' || /^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

export default defineSettings<UrlWidgetConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'urls',
          type: 'list',
          label: 'links',
          addLabel: 'addLink',
          sortable: true,
          cleanupImageKey: 'imageUrl',
          row: {
            createRow: (): LinkRow => ({
              id: crypto.randomUUID(),
              url: '',
              title: '',
              color: DEFAULT_URL_COLOR,
              icon: DEFAULT_URL_ICON_ID,
              shape: 'rectangle',
            }),
            fields: [
              {
                key: 'url',
                type: 'text',
                label: 'url',
                placeholder: 'urlPlaceholder',
                normalizeOnBlur: normalizeUrl,
              },
              {
                key: 'title',
                type: 'text',
                label: 'title',
                placeholder: 'titlePlaceholder',
              },
              {
                key: 'shape',
                type: 'segmented',
                label: 'shape',
                options: [
                  { value: 'rectangle', label: 'rectangle' },
                  { value: 'circle', label: 'circle' },
                ],
              },
              {
                key: 'icon',
                type: 'select',
                label: 'iconLabel',
                options: URL_ICONS.map(({ id }) => ({
                  value: id,
                  label: `icon.${id}`,
                })),
              },
              {
                key: 'color',
                type: 'color',
                label: 'backgroundColor',
                presets: URL_COLORS,
              },
              {
                key: 'imageUrl',
                type: 'imageUpload',
                label: 'backgroundImage',
              },
            ],
          },
        },
      ],
    },
  ],
});
