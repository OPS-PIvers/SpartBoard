import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { SettingsDrawer } from '@/components/settings/SettingsDrawer';
import type { GlobalStyle, TextConfig, WidgetData } from '@/types';
import schema from './settings.schema';

const config: TextConfig = {
  content: '<p>Hello class!</p>',
  bgColor: '#fef9c3',
  fontSize: 18,
  fontFamily: 'global',
  fontColor: '#334155',
  verticalAlign: 'center',
};

const widget = {
  id: 'w1',
  type: 'text',
  x: 0,
  y: 0,
  w: 400,
  h: 300,
  z: 1,
  config,
} as WidgetData;

// jsdom has no layout, so axe's color-contrast rule can only report "incomplete"; token contrast is covered elsewhere.
const STRUCTURAL_ONLY = { rules: { 'color-contrast': { enabled: false } } };

describe('text SettingsDrawer accessibility', () => {
  it('has no structural axe violations and every field has an accessible name', async () => {
    const { baseElement, getAllByRole } = render(
      <SettingsDrawer
        widget={widget}
        title="Note"
        placement="right"
        width={400}
        onWidthCommit={vi.fn()}
        onClose={vi.fn()}
        updateWidget={vi.fn()}
        updateConfig={vi.fn()}
        globalStyle={{ windowTransparency: 0.5 } as GlobalStyle}
        schema={schema}
      />
    );

    expect(await axe(baseElement, STRUCTURAL_ONLY)).toHaveNoViolations();

    for (const button of getAllByRole('button')) {
      expect(button).toHaveAccessibleName();
    }
  });
});
