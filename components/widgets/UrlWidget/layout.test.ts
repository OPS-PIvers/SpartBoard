import { describe, it, expect } from 'vitest';
import { balancedRows, pickLinkLayout } from './layout';

describe('pickLinkLayout', () => {
  it('stacks links in one column on a tall card', () => {
    expect(pickLinkLayout(5, 225, 860, 6)).toEqual({
      mode: 'tiles',
      rows: [1, 1, 1, 1, 1],
    });
  });

  it('lays links in one row on a wide card', () => {
    expect(pickLinkLayout(5, 1400, 340, 6)).toEqual({
      mode: 'tiles',
      rows: [5],
    });
  });

  it('switches to a list when every tile grid is too small', () => {
    expect(pickLinkLayout(5, 76, 76, 1)).toEqual({ mode: 'list', columns: 1 });
  });

  it('keeps a single link as a tile on the smallest card', () => {
    expect(pickLinkLayout(1, 76, 76, 1)).toEqual({ mode: 'tiles', rows: [1] });
  });

  it('falls back to a fixed grid before the card is measured', () => {
    expect(pickLinkLayout(5, 0, 0, 0)).toEqual({ mode: 'tiles', rows: [3, 2] });
  });
});

describe('balancedRows', () => {
  it('puts the longer rows first', () => {
    expect(balancedRows(7, 3)).toEqual([3, 2, 2]);
  });
});
