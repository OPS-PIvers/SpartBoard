import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { DoItemsField } from './settingsFields';

const Harness: React.FC = () => {
  const [config, setConfig] = useState<Record<string, unknown>>({
    doItems: ['', 'Second'],
  });
  const ctx = {
    config,
    updateConfig: (updates: Record<string, unknown>) =>
      setConfig((prev) => ({ ...prev, ...updates })),
    t: (key: string) => key,
    id: 'do-items',
    labelId: 'do-items-label',
  } as unknown as CustomRenderCtx;
  return <DoItemsField ctx={ctx} />;
};

describe('NeedDoPutThen DoItemsField', () => {
  it('keeps focus in a Do step while typing', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const [first] = screen.getAllByRole('textbox');
    await user.click(first);
    await user.keyboard('Read chapter 3');

    const [updated] = screen.getAllByRole('textbox');
    expect(updated).toHaveValue('Read chapter 3');
    expect(updated).toHaveFocus();
  });
});
