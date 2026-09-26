import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImportDestinationPicker } from './ImportDestinationPicker';

describe('ImportDestinationPicker', () => {
  it('renders nothing for a plain file without the choice', () => {
    const { container } = render(
      <ImportDestinationPicker
        canChoose={false}
        destination="personal"
        hasTour={false}
        onChange={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('warns that tour steps stay inert in a personal set', () => {
    render(
      <ImportDestinationPicker
        canChoose={false}
        destination="personal"
        hasTour
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/only run from a building set/)).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('lets an admin switch to the building library', () => {
    const onChange = vi.fn();
    render(
      <ImportDestinationPicker
        canChoose
        destination="building"
        hasTour
        onChange={onChange}
      />
    );
    expect(screen.queryByText(/only run from a building set/)).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Personal' }));
    expect(onChange).toHaveBeenCalledWith('personal');
  });
});
