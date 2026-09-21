import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { PdfConfig, WidgetData } from '@/types';
import { PdfCurrentDocumentField } from './settingsFields';

const widget = {
  id: 'pdf-test-1',
  type: 'pdf',
} as unknown as WidgetData;

const makeCtx = (
  config: PdfConfig,
  updateConfig: (patch: Record<string, unknown>) => void
) =>
  ({
    config,
    widget,
    isAdmin: false,
    canAccessFeature: vi.fn(() => true),
    canAccessWidget: vi.fn(() => true),
    toolLabel: vi.fn((type: string) => type),
    t: (key: string) =>
      ({
        'widgetSettings.pdf.none': 'None — library is shown',
        'widgetSettings.pdf.switchDocument': 'Switch to another PDF',
        'widgetSettings.pdf.storageNote': 'Stored in the cloud library.',
      })[key] ?? key,
    surface: 'drawer',
    updateConfig,
    id: 'pdf-field',
    labelId: 'pdf-field-label',
    describedBy: undefined,
  }) as unknown as CustomRenderCtx;

describe('PDF settings drawer field', () => {
  it('returns an active document to the library with a sparse reset', () => {
    const updateConfig = vi.fn();
    const ctx = makeCtx(
      {
        activePdfId: 'pdf-1',
        activePdfUrl: 'https://example.com/lesson.pdf',
        activePdfName: 'Lesson Plan.pdf',
      },
      updateConfig
    );
    render(React.createElement(PdfCurrentDocumentField, { ctx }));
    expect(screen.getByText('Lesson Plan.pdf')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Switch to another PDF' })
    );
    expect(updateConfig).toHaveBeenCalledWith({
      activePdfId: null,
      activePdfUrl: null,
      activePdfName: null,
    });
  });
});
