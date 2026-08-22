import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConnectionsTab } from './ConnectionsTab';
import { CustomGridDefinition } from '@/types';

// Regression: an explicit actionValue of 0 was dropped at save time, so blockReducer.ts's `?? 1` fallback fired instead.
const baseGrid: CustomGridDefinition = {
  columns: 2,
  rows: 1,
  cells: [
    {
      id: 'cellA',
      colStart: 1,
      rowStart: 1,
      colSpan: 1,
      rowSpan: 1,
      block: {
        id: 'blockA',
        type: 'cb-button',
        config: {},
        style: {},
        name: 'Button A',
      },
    },
    {
      id: 'cellB',
      colStart: 2,
      rowStart: 1,
      colSpan: 1,
      rowSpan: 1,
      block: {
        id: 'blockB',
        type: 'counter',
        config: {},
        style: {},
        name: 'Counter B',
      },
    },
  ],
  connections: [],
};

describe('ConnectionsTab — actionValue 0 persistence', () => {
  it('saves an explicit actionValue of 0 for an increment rule, not the step-1 default', () => {
    const onChange = vi.fn();
    render(<ConnectionsTab gridDefinition={baseGrid} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /new rule/i }));

    const [sourceSelect, , targetSelect, actionSelect] =
      screen.getAllByRole('combobox');

    fireEvent.change(sourceSelect, { target: { value: 'blockA' } });
    fireEvent.change(targetSelect, { target: { value: 'blockB' } });
    fireEvent.change(actionSelect, { target: { value: 'increment' } });

    const actionValueInput = screen.getByLabelText(/step value/i);
    fireEvent.change(actionValueInput, { target: { value: '0' } });

    fireEvent.click(screen.getByRole('button', { name: /save rule/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const saved = onChange.mock.calls[0][0] as CustomGridDefinition;
    const conn = saved.connections[0];
    expect(conn.action).toBe('increment');
    expect(conn.actionValue).toBe(0);
  });
});
