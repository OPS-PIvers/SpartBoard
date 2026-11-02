import React from 'react';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { describe, expect, it, vi } from 'vitest';
import { ShuffleList } from './ShuffleList';

const names = ['Ava Patel', 'Kai Nguyen', 'Zoe Rivera'];

const renderList = (
  props: Partial<React.ComponentProps<typeof ShuffleList>> = {}
) =>
  render(
    <DndContext>
      <ShuffleList
        names={names}
        lockedNames={[]}
        onToggleLock={vi.fn()}
        doneNames={[]}
        onToggleDone={vi.fn()}
        {...props}
      />
    </DndContext>
  );

const chipFor = (name: string) =>
  screen.getByText(name).closest('.group\\/chip') as HTMLElement;

describe('ShuffleList styling', () => {
  it('keeps the default white cards when nothing is set', () => {
    renderList();
    const chip = chipFor('Kai Nguyen');
    expect(chip.className).toContain('bg-white');
    expect(chip.className).toContain('border-slate-200');
    expect(chip.style.backgroundColor).toBe('');
    expect(chip.style.color).toBe('');
  });

  it('applies the card and text colors to cards', () => {
    renderList({
      cardColor: '#fef3c7',
      cardOpacity: 0.5,
      fontColor: '#1d4ed8',
    });
    const chip = chipFor('Kai Nguyen');
    expect(chip.style.backgroundColor).toBe('rgba(254, 243, 199, 0.5)');
    expect(chip.style.color).toBe('rgb(29, 78, 216)');
  });

  it('draws hairlines between rows in lines style', () => {
    renderList({ rowStyle: 'lines' });
    const first = chipFor('Ava Patel');
    const second = chipFor('Kai Nguyen');
    expect(first.className).not.toContain('border-slate-200');
    expect(second.className).not.toContain('shadow-xs');
    const firstRow = first.parentElement?.parentElement as HTMLElement;
    const secondRow = second.parentElement?.parentElement as HTMLElement;
    expect(firstRow.style.borderTop).toBe('');
    expect(secondRow.style.borderTop).toContain('1px solid');
  });

  it('keeps the teacher text color on a locked name in lines style', () => {
    renderList({
      rowStyle: 'lines',
      fontColor: '#ffffff',
      lockedNames: ['Kai Nguyen'],
    });
    expect(chipFor('Kai Nguyen').style.color).toBe('rgb(255, 255, 255)');
  });
});
