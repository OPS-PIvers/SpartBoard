import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AssignmentClassNames } from './AssignmentClassNames';

describe('AssignmentClassNames', () => {
  it('shows a count that opens the full class names', () => {
    render(
      <AssignmentClassNames
        names={[
          'MS Science 8 - Ivers - Period 1 (2026-27 S1)',
          'MS Science 8 - Ivers - Period 2 (2026-27 S1)',
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '2 classes' }));
    const dialog = screen.getByRole('dialog', { name: 'Classes' });
    expect(dialog.textContent).toContain(
      'MS Science 8 - Ivers - Period 2 (2026-27 S1)'
    );
  });

  it('says 1 class for one', () => {
    render(<AssignmentClassNames names={['Sample - Mock Period 1']} />);
    expect(screen.getByRole('button', { name: '1 class' })).toBeTruthy();
  });

  it('renders nothing without classes', () => {
    const { container } = render(<AssignmentClassNames names={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
