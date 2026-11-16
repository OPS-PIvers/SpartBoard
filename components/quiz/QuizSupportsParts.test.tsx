import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { QuizSupport } from '@/types';
import { SupportsDialog } from './QuizSupportsParts';

const SUPPORTS: QuizSupport[] = [
  { kind: 'text', title: 'Word bank', text: 'cell, nucleus' },
  { kind: 'link', title: 'Notes', url: 'https://example.org/notes' },
  { kind: 'drive', title: 'Diagram', fileId: '1AbCdEfGhIjK' },
];

describe('SupportsDialog', () => {
  it('opens a single support straight away', () => {
    render(<SupportsDialog supports={[SUPPORTS[0]]} light onClose={vi.fn()} />);
    expect(screen.getByText('cell, nucleus')).toBeTruthy();
  });

  it('lists several supports and opens the one picked', () => {
    render(<SupportsDialog supports={SUPPORTS} light onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Diagram'));
    expect(screen.getByTitle('Diagram').getAttribute('src')).toBe(
      'https://drive.google.com/file/d/1AbCdEfGhIjK/preview'
    );
    fireEvent.click(screen.getByLabelText('Back'));
    fireEvent.click(screen.getByText('Notes'));
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('https://example.org/notes');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('never renders a non-https link', () => {
    render(
      <SupportsDialog
        supports={[{ kind: 'link', title: 'Bad', url: 'javascript:alert(1)' }]}
        light
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole('link')).toBeNull();
  });
});
