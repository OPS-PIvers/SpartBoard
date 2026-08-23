import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BuilderGrid } from './BuilderGrid';
import { CustomGridDefinition } from '@/types';

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm: vi.fn().mockResolvedValue(true),
    showPrompt: vi.fn().mockResolvedValue(null),
  }),
}));

// Regression: splitting a merged cell dropped its block silently, unlike merge which blocks data loss.
const gridWithMergedBlock: CustomGridDefinition = {
  columns: 2,
  rows: 1,
  cells: [
    {
      id: 'merged',
      colStart: 1,
      rowStart: 1,
      colSpan: 2,
      rowSpan: 1,
      block: {
        id: 'blockA',
        type: 'cb-button',
        config: {},
        style: {},
        name: 'Button A',
      },
    },
  ],
  connections: [],
};

describe('BuilderGrid — split preserves block content', () => {
  it('keeps the block on the origin cell after splitting a merged cell', () => {
    const onChange = vi.fn();
    render(
      <BuilderGrid
        gridDefinition={gridWithMergedBlock}
        onChange={onChange}
        selectedCellId="merged"
        onSelectCell={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /split cell/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const saved = onChange.mock.calls[0][0] as CustomGridDefinition;
    expect(saved.cells).toHaveLength(2);

    const withBlock = saved.cells.filter((c) => c.block !== null);
    expect(withBlock).toHaveLength(1);
    expect(withBlock[0].block?.id).toBe('blockA');
    expect(withBlock[0].colStart).toBe(1);
    expect(withBlock[0].rowStart).toBe(1);
  });
});
