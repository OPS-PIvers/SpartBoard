import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { MaterialsConfig } from '@/types';
import {
  MaterialsCatalogField,
  MaterialsTitleField,
  MaterialsTitleFontField,
} from './settingsFields';

const renderTitle = (ctx: CustomRenderCtx) =>
  React.createElement(MaterialsTitleField, { ctx });

const renderCatalog = (ctx: CustomRenderCtx) =>
  React.createElement(MaterialsCatalogField, { ctx });

const renderTitleFont = (ctx: CustomRenderCtx) =>
  React.createElement(MaterialsTitleFontField, { ctx });

export default defineSettings<MaterialsConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // The title also seeds the account-wide Materials preference, so this
        // contextual control owns the sparse widget write plus that side effect.
        {
          key: 'title',
          type: 'custom',
          label: 'title',
          render: renderTitle,
        },
        // schema-gap: contextualMaterialsCatalog
        {
          key: 'selectedItems',
          type: 'custom',
          label: 'availableMaterials',
          searchTerms: [
            'addMaterial',
            'selectAll',
            'deselectAll',
            'hiddenMaterials',
            'selectionTip',
          ],
          render: renderCatalog,
        },
      ],
    },
    {
      id: 'display',
      fields: [
        // schema-gap: materialsTitleFont
        {
          key: 'titleFont',
          type: 'custom',
          label: 'titleFont',
          render: renderTitleFont,
        },
      ],
    },
  ],
  styleKeys: ['titleColor'],
});
