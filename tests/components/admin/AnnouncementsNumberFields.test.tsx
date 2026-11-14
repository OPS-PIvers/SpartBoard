import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

import { TextConfigEditor } from '@/components/admin/Announcements/TextConfigEditor';
import type { TextConfig } from '@/types';

const Harness: React.FC = () => {
  const [config, setConfig] = useState<Partial<TextConfig>>({ fontSize: 18 });
  return (
    <>
      <TextConfigEditor config={config} onChange={setConfig} />
      <output data-testid="saved">{config.fontSize}</output>
    </>
  );
};

describe('Announcements text editor font size field', () => {
  it('lets a value be typed digit by digit past the minimum', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('spinbutton');
    await user.tripleClick(input);
    await user.keyboard('48');
    expect(input).toHaveValue(48);
    expect(screen.getByTestId('saved')).toHaveTextContent('48');
  });

  it('still clamps the saved value to the allowed range', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('spinbutton');
    await user.tripleClick(input);
    await user.keyboard('500');
    expect(screen.getByTestId('saved')).toHaveTextContent('72');
  });
});
