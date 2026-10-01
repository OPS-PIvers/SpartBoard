import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));
vi.mock('@/context/useToolVisibility', () => ({
  useToolVisibility: () => ({
    resetDockToDefaults: vi.fn(),
    hiddenTools: [],
    toggleToolHidden: vi.fn(),
  }),
}));

import { WidgetLibrary } from '@/components/layout/dock/WidgetLibrary';
import { DEFAULT_GLOBAL_STYLE } from '@/types';

const onlySpecialistIsOtherGrade = (type: string) =>
  type !== 'specialist-schedule';

function renderLibrary(
  props: Partial<React.ComponentProps<typeof WidgetLibrary>> = {}
) {
  return render(
    <WidgetLibrary
      onToggle={vi.fn()}
      visibleTools={[]}
      canAccess={() => true}
      matchesUserBuilding={onlySpecialistIsOtherGrade}
      onClose={vi.fn()}
      globalStyle={DEFAULT_GLOBAL_STYLE}
      libraryOrder={[]}
      onReorderLibrary={vi.fn()}
      {...props}
    />
  );
}

afterEach(cleanup);

describe('WidgetLibrary — other grade levels', () => {
  it('collapses widgets outside the user building behind a section toggle', () => {
    renderLibrary();

    const toggle = screen.getByRole('button', {
      name: /Other grade levels \(1\)/,
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Specialist')).toBeNull();

    fireEvent.click(toggle);

    expect(screen.getByText('Specialist')).toBeInTheDocument();
    expect(screen.getByText('K-8')).toBeInTheDocument();
  });

  it('adds an other-grade widget to the board when tapped', () => {
    const onToggle = vi.fn();
    renderLibrary({ onToggle });

    fireEvent.click(screen.getByRole('button', { name: /Other grade levels/ }));
    fireEvent.click(screen.getByText('Specialist'));

    expect(onToggle).toHaveBeenCalledWith('specialist-schedule');
  });

  it('surfaces other-grade widgets in search results without the empty state', () => {
    renderLibrary();

    fireEvent.change(screen.getByLabelText('Search widgets'), {
      target: { value: 'specialist' },
    });

    expect(screen.getByText('Other grade levels (1)')).toBeInTheDocument();
    expect(screen.getByText('Specialist')).toBeInTheDocument();
    expect(screen.queryByText('No widgets match your search')).toBeNull();
  });

  it('omits the section in edit mode, where every widget already shows', () => {
    renderLibrary({ isEditMode: true });

    expect(screen.queryByText(/Other grade levels/)).toBeNull();
  });

  it('omits widgets already in the dock', () => {
    renderLibrary({ visibleTools: ['specialist-schedule'] });

    expect(screen.queryByText(/Other grade levels/)).toBeNull();
  });
});
