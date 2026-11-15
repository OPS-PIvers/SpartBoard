import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AssignmentClassNames } from './AssignmentClassNames';

describe('AssignmentClassNames', () => {
  it('expands unrelated classes and keeps focus on the list', () => {
    render(
      <AssignmentClassNames names={['Biology', 'Chemistry', 'Physics']} />
    );
    const list = screen.getByTestId('assignment-class-names');
    expect(list.textContent).toBe('Biology +2 more');
    fireEvent.click(screen.getByRole('button', { name: '+2 more' }));
    expect(list.textContent).toBe('Biology, Chemistry, Physics');
    expect(document.activeElement).toBe(list);
  });

  it('renders nothing without classes', () => {
    const { container } = render(<AssignmentClassNames names={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
