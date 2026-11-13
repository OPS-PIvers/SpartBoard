import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import type { Collection } from '@/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

import { MoveToCollectionMenu } from '@/components/boardsModal/MoveToCollectionMenu';

afterEach(cleanup);

const col = (id: string, parent: string | null, order = 0): Collection => ({
  id,
  name: id,
  parentCollectionId: parent,
  order,
  createdAt: 0,
});

describe('MoveToCollectionMenu orphans', () => {
  it('lists a Collection whose parent is missing, with its subtree', () => {
    render(
      <MoveToCollectionMenu
        collections={[
          col('top', null),
          col('stray', 'deleted-parent'),
          col('stray-child', 'stray'),
        ]}
        onMove={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('top')).toBeTruthy();
    expect(screen.getByText('stray')).toBeTruthy();
    expect(screen.getByText('stray-child')).toBeTruthy();
  });
});
