import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChecklistSelect } from '@/components/common/ChecklistSelect';

const options = [
  { id: 'a', label: 'Quiz' },
  { id: 'b', label: 'Writing' },
];

describe('ChecklistSelect', () => {
  it('moves focus to the first checked row when there is no search box', () => {
    render(
      <ChecklistSelect
        label="Type"
        options={options}
        selected={['b']}
        onToggle={vi.fn()}
        emptyText="Any type"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Type' }));
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Writing' })
    ).toHaveFocus();
  });

  it('opens on ArrowDown and stays open while picking', () => {
    const onToggle = vi.fn();
    render(
      <ChecklistSelect
        label="Type"
        options={options}
        selected={[]}
        onToggle={onToggle}
        emptyText="Any type"
      />
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Type' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Quiz' }));
    expect(onToggle).toHaveBeenCalledWith('a', true);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('tells the parent it closed when it unmounts open', () => {
    const onOpenChange = vi.fn();
    const { unmount } = render(
      <ChecklistSelect
        label="Type"
        options={options}
        selected={[]}
        onToggle={vi.fn()}
        emptyText="Any type"
        onOpenChange={onOpenChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Type' }));
    unmount();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('clears a full search box on the first Escape, then closes', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: `o${i}`,
      label: `Option ${i}`,
    }));
    render(
      <ChecklistSelect
        label="Standards"
        options={many}
        selected={[]}
        onToggle={vi.fn()}
        emptyText="None"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Standards' }));
    const box = screen.getByRole('searchbox');
    fireEvent.change(box, { target: { value: 'Option 3' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box).toHaveValue('');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
