import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { PdfConfig } from '@/types';
import { PdfCurrentDocumentField } from './settingsFields';

const renderCurrentDocument = (ctx: CustomRenderCtx) =>
  React.createElement(PdfCurrentDocumentField, { ctx });

export default defineSettings<PdfConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // schema-gap: pdfLibrarySelection
        {
          key: 'activePdfId',
          type: 'custom',
          label: 'currentDocument',
          searchTerms: ['switchDocument'],
          render: renderCurrentDocument,
        },
      ],
    },
  ],
});
