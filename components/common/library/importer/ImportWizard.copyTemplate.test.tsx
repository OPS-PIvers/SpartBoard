import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImportWizard } from './ImportWizard';
import type { ImportAdapter } from '../types';

const makeAdapter = (
  createTemplate: () => Promise<{ url: string }>
): ImportAdapter<string> => ({
  widgetLabel: 'Quiz',
  supportedSources: ['csv', 'sheet'],
  templateHelper: { createTemplate, instructions: 'help' },
  parse: () => Promise.reject(new Error('unused')),
  validate: () => ({ ok: true, errors: [] }) as never,
  renderPreview: () => null,
  save: () => Promise.resolve(),
});

describe('ImportWizard copy template URL', () => {
  it('creates one template for a double click and confirms the copy', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    let resolve: (v: { url: string }) => void = () => undefined;
    const createTemplate = vi.fn(
      () => new Promise<{ url: string }>((r) => (resolve = r))
    );
    render(
      <ImportWizard
        isOpen
        onClose={() => undefined}
        adapter={makeAdapter(createTemplate)}
      />
    );
    fireEvent.click(screen.getByText(/Template .* format help/));
    const btn = screen.getByRole('button', { name: /copy template url/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(createTemplate).toHaveBeenCalledTimes(1);
    resolve({ url: 'https://sheet' });
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Link copied')).toBeTruthy();
  });
});
