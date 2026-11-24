import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { WidgetData } from '@/types';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { sanitizeHtml } from '@/utils/security';
import { TemplateGrid } from './TemplateGrid';
import { TEXT_WIDGET_TEMPLATES } from './constants';

const widget = { id: 'w1', type: 'text' } as WidgetData;

function makeCtx(
  updateConfig: CustomRenderCtx['updateConfig']
): CustomRenderCtx {
  return {
    config: {},
    widget,
    isAdmin: false,
    canAccessFeature: () => true,
    t: (key) => key,
    updateConfig,
    id: 'field-1',
    labelId: 'field-1-label',
  };
}

describe('TemplateGrid', () => {
  it.each(TEXT_WIDGET_TEMPLATES)(
    'writes the sanitized content for "$name"',
    (template) => {
      const updateConfig = vi.fn();
      render(<TemplateGrid ctx={makeCtx(updateConfig)} />);

      fireEvent.click(screen.getByRole('button', { name: template.name }));

      expect(updateConfig).toHaveBeenCalledTimes(1);
      expect(updateConfig).toHaveBeenCalledWith({
        content: sanitizeHtml(template.content),
      });
    }
  );

  it('labels its group via the id/labelId handed to Custom.render', () => {
    const ctx = makeCtx(vi.fn());
    render(<TemplateGrid ctx={ctx} />);

    const group = screen.getByRole('group');
    expect(group).toHaveAttribute('id', ctx.id);
    expect(group).toHaveAttribute('aria-labelledby', ctx.labelId);
  });
});
