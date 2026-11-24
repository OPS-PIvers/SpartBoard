import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { SettingsDrawer } from '@/components/settings/SettingsDrawer';
import type { GlobalStyle, WidgetData } from '@/types';

const widget = {
  id: 'w1',
  type: 'clock',
  x: 0,
  y: 0,
  w: 200,
  h: 200,
  z: 1,
  config: {},
} as WidgetData;

// jsdom has no layout, so axe's color-contrast rule can only report "incomplete"; token contrast is covered by drawerContrastTokens.test.ts.
const STRUCTURAL_ONLY = { rules: { 'color-contrast': { enabled: false } } };

describe('SettingsDrawer accessibility', () => {
  it('has no structural axe violations on the empty drawer', async () => {
    const { baseElement } = render(
      <SettingsDrawer
        widget={widget}
        title="Clock"
        placement="right"
        width={400}
        onWidthCommit={vi.fn()}
        onClose={vi.fn()}
        updateWidget={vi.fn()}
        updateConfig={vi.fn()}
        globalStyle={{ windowTransparency: 0.5 } as GlobalStyle}
        schema={{ groups: [] }}
      />
    );
    expect(await axe(baseElement, STRUCTURAL_ONLY)).toHaveNoViolations();
  });
});
