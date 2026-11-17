import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { QuizSupport } from '@/types';
import { SupportsPanel } from './QuizSupportsParts';

const SUPPORTS: QuizSupport[] = [
  { kind: 'text', title: 'Word bank', text: 'cell, nucleus' },
  { kind: 'link', title: 'Notes', url: 'https://example.org/notes' },
  { kind: 'drive', title: 'Diagram', fileId: '1AbCdEfGhIjK' },
];

describe('SupportsPanel', () => {
  it('shows a single support with no tabs', () => {
    render(<SupportsPanel supports={[SUPPORTS[0]]} light onClose={vi.fn()} />);
    expect(screen.getByText('cell, nucleus')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('embeds links and Drive files in the panel, never as new-tab links', () => {
    render(<SupportsPanel supports={SUPPORTS} light onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Diagram' }));
    expect(screen.getByTitle('Diagram').getAttribute('src')).toBe(
      'https://drive.google.com/file/d/1AbCdEfGhIjK/preview'
    );
    const notes = screen.getByTitle('Notes');
    expect(notes.getAttribute('src')).toBe('https://example.org/notes');
    expect(notes.getAttribute('sandbox')).not.toContain('allow-popups');
    expect(notes.getAttribute('sandbox')).not.toContain('allow-top-navigation');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('never embeds a non-https link', () => {
    render(
      <SupportsPanel
        supports={[{ kind: 'link', title: 'Bad', url: 'javascript:alert(1)' }]}
        light
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByTitle('Bad')).toBeNull();
  });

  it('closes on the close button', () => {
    const onClose = vi.fn();
    render(<SupportsPanel supports={SUPPORTS} light onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
