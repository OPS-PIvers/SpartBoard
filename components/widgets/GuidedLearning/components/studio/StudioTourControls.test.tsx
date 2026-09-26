import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningStep, WidgetType } from '@/types';
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/context/DashboardContextValue';
import { StudioTourControls } from './StudioTourControls';
import { FIND_FLASH_MS } from './StudioFindOnBoard';

const baseStep: GuidedLearningStep = {
  id: 'step-1',
  xPct: 10,
  yPct: 10,
  imageIndex: 0,
  interactionType: 'tooltip',
};

function renderControls(
  initial: GuidedLearningStep = baseStep,
  extra: Partial<React.ComponentProps<typeof StudioTourControls>> = {}
) {
  const seen = vi.fn();
  const Harness = () => {
    const [step, setStep] = useState(initial);
    return (
      <StudioTourControls
        step={step}
        onChange={(next) => {
          seen(next);
          setStep(next);
        }}
        {...extra}
      />
    );
  };
  render(<Harness />);
  const last = () => seen.mock.lastCall?.[0] as GuidedLearningStep;
  return { last };
}

const anchorSelect = () => screen.getByLabelText('Button on the board');

describe('StudioTourControls', () => {
  it('links a step to a registered button and waits for the click', () => {
    const { last } = renderControls();
    expect(anchorSelect()).toHaveValue('');
    fireEvent.change(anchorSelect(), { target: { value: 'sidebar.boards' } });
    expect(last().tour).toEqual({ anchor: 'sidebar.boards', action: 'click' });
    fireEvent.click(screen.getByRole('button', { name: 'Show it, then Next' }));
    expect(last().tour).toEqual({
      anchor: 'sidebar.boards',
      action: 'observe',
    });
  });

  it('asks which widget for a per-type button and stores it in the ref', () => {
    const { last } = renderControls();
    expect(screen.queryByLabelText('Which widget')).toBeNull();
    fireEvent.change(anchorSelect(), { target: { value: 'dock.item' } });
    fireEvent.change(screen.getByLabelText('Which widget'), {
      target: { value: 'time-tool' },
    });
    expect(last().tour?.anchor).toBe('dock.item:time-tool');
  });

  it('asks for a widget and a setting key for a perField button, from that widget schema', async () => {
    const { last } = renderControls();
    fireEvent.change(anchorSelect(), { target: { value: 'settings.field' } });
    expect(screen.queryByLabelText('Which setting')).toBeNull();
    fireEvent.change(screen.getByLabelText('Which widget'), {
      target: { value: 'clock' },
    });
    const fieldSelect = await screen.findByLabelText('Which setting');
    await screen.findByRole('option', { name: 'themeColor' });
    fireEvent.change(fieldSelect, { target: { value: 'themeColor' } });
    expect(last().tour?.anchor).toBe('settings.field:clock#themeColor');
  });

  it('round-trips an existing perField ref and falls back to a text input with no schema', async () => {
    const { last } = renderControls({
      ...baseStep,
      tour: { anchor: 'settings.field:clock#themeColor', action: 'click' },
    });
    expect(screen.getByLabelText('Which widget')).toHaveValue('clock');
    await screen.findByRole('option', { name: 'themeColor' });
    expect(screen.getByLabelText('Which setting')).toHaveValue('themeColor');
    fireEvent.change(screen.getByLabelText('Which widget'), {
      target: { value: 'magic' },
    });
    const fallback = await screen.findByLabelText('Which setting');
    expect(fallback.tagName).toBe('INPUT');
    fireEvent.change(fallback, { target: { value: 'custom-key' } });
    expect(last().tour?.anchor).toBe('settings.field:magic#custom-key');
  });

  it('unlinks the step', () => {
    const { last } = renderControls({
      ...baseStep,
      tour: { anchor: 'sidebar.boards', action: 'click' },
    });
    fireEvent.change(anchorSelect(), { target: { value: '' } });
    expect(last()).not.toHaveProperty('tour');
  });

  it('keeps a recorded name-only link until another button is picked', () => {
    const { last } = renderControls({
      ...baseStep,
      tour: {
        anchor: '',
        fallback: { role: 'button', name: 'Save' },
        action: 'click',
      },
    });
    expect(anchorSelect()).toHaveValue('__untagged');
    fireEvent.change(anchorSelect(), { target: { value: 'widget.close' } });
    expect(last().tour).toEqual({ anchor: 'widget.close', action: 'click' });
  });

  it('defaults "Teacher must click this" on for destructive buttons and lets it be edited', () => {
    const { last } = renderControls();
    const mustClick = () =>
      screen.queryByRole('checkbox', { name: /Teacher must click this/ });
    fireEvent.change(anchorSelect(), { target: { value: 'sidebar.boards' } });
    expect(mustClick()).not.toBeChecked();
    fireEvent.change(anchorSelect(), { target: { value: 'widget.close' } });
    expect(mustClick()).toBeChecked();
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Teacher must click this/ })
    );
    expect(last().tour).toEqual({
      anchor: 'widget.close',
      action: 'click',
      teacherMustClick: false,
    });
    expect(mustClick()).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Show it, then Next' }));
    expect(mustClick()).toBeNull();
  });

  it('shows the picked anchor id and widget type', () => {
    renderControls({
      ...baseStep,
      tour: { anchor: 'dock.item:clock', action: 'click' },
    });
    const line = screen.getByTestId('gl-studio-tour-anchor-id');
    expect(line).toHaveTextContent('Id: dock.item');
    expect(line).toHaveTextContent('Widget: clock');
  });

  it('offers Run live from this step and Re-record this step', () => {
    const onRunFromStep = vi.fn();
    const onRerecord = vi.fn();
    renderControls(
      { ...baseStep, tour: { anchor: 'sidebar.boards', action: 'click' } },
      { onRunFromStep, onRerecord }
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Run live from this step' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Re-record this step' })
    );
    expect(onRunFromStep).toHaveBeenCalledTimes(1);
    expect(onRerecord).toHaveBeenCalledTimes(1);
  });
});

describe('StudioTourControls untagged warning', () => {
  const untagged: GuidedLearningStep = {
    ...baseStep,
    tour: {
      anchor: '',
      fallback: { role: 'button', name: 'Save Changes' },
      action: 'click',
    },
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('warns on a step the recorder could not tag, with the suggested id copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderControls(untagged);
    expect(screen.getByTestId('gl-studio-untagged')).toHaveTextContent(
      'Not tagged in code yet'
    );
    expect(screen.getByLabelText('Suggested id')).toHaveValue(
      'button.save-changes'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy id' }));
    expect(writeText).toHaveBeenCalledWith('button.save-changes');
    expect(
      await screen.findByRole('button', { name: 'Copied' })
    ).toBeInTheDocument();
  });

  it('selects the id for a manual copy when the clipboard is blocked', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderControls(untagged);
    fireEvent.click(screen.getByRole('button', { name: 'Copy id' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't copy");
    const input = screen.getByLabelText<HTMLInputElement>('Suggested id');
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('button.save-changes'.length);
  });

  it('has no warning for a tagged step', () => {
    renderControls({
      ...baseStep,
      tour: { anchor: 'sidebar.boards', action: 'click' },
    });
    expect(screen.queryByTestId('gl-studio-untagged')).toBeNull();
  });
});

describe('StudioTourControls Find on board', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  const renderFind = (
    anchor: string,
    setupWidgets: WidgetType[] = [],
    boardTypes: WidgetType[] = []
  ) => {
    const onPeekBoard = vi.fn();
    const value = {
      activeDashboard: {
        widgets: boardTypes.map((type, i) => ({ id: `w${i}`, type })),
      },
    } as unknown as DashboardContextValue;
    const utils = render(
      <DashboardContext.Provider value={value}>
        <StudioTourControls
          step={{ ...baseStep, tour: { anchor, action: 'click' } }}
          onChange={vi.fn()}
          setupWidgets={setupWidgets}
          onPeekBoard={onPeekBoard}
        />
      </DashboardContext.Provider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Find on board' }));
    return { ...utils, onPeekBoard };
  };

  it('flashes a button that is on the board, then brings the Studio back', () => {
    vi.useFakeTimers();
    const board = document.createElement('button');
    board.setAttribute('data-tour', 'sidebar.boards');
    board.textContent = 'Boards';
    document.body.appendChild(board);
    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({
      top: 10,
      left: 20,
      width: 30,
      height: 40,
    } as DOMRect);
    const { onPeekBoard } = renderFind('sidebar.boards');
    expect(screen.getByTestId('gl-studio-find-result')).toHaveTextContent(
      'Found on the board.'
    );
    const flash = screen.getByTestId('gl-studio-find-flash');
    expect(flash.style.top).toBe('10px');
    expect(flash.style.width).toBe('30px');
    expect(onPeekBoard).toHaveBeenLastCalledWith(true);
    act(() => {
      vi.advanceTimersByTime(FIND_FLASH_MS);
    });
    expect(screen.queryByTestId('gl-studio-find-flash')).toBeNull();
    expect(onPeekBoard).toHaveBeenLastCalledWith(false);
  });

  it('keeps the Studio faded when Find on board is clicked again mid-flash', () => {
    vi.useFakeTimers();
    const board = document.createElement('button');
    board.setAttribute('data-tour', 'sidebar.boards');
    document.body.appendChild(board);
    vi.spyOn(board, 'getBoundingClientRect').mockImplementation(
      () => ({ top: 10, left: 20, width: 30, height: 40 }) as DOMRect
    );
    const { onPeekBoard } = renderFind('sidebar.boards');
    act(() => {
      vi.advanceTimersByTime(FIND_FLASH_MS / 2);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find on board' }));
    expect(onPeekBoard).toHaveBeenLastCalledWith(true);
    act(() => {
      vi.advanceTimersByTime(FIND_FLASH_MS - 1);
    });
    expect(onPeekBoard).toHaveBeenLastCalledWith(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onPeekBoard).toHaveBeenLastCalledWith(false);
  });

  it('names the widget a missing widget button needs', () => {
    renderFind('widget.close', ['clock', 'time-tool'], ['time-tool']);
    expect(screen.getByTestId('gl-studio-find-result')).toHaveTextContent(
      'Not found. Needs Clock on the board.'
    );
    expect(screen.queryByTestId('gl-studio-find-flash')).toBeNull();
  });

  it('asks for the panel to be opened, or reports not found', () => {
    const { unmount } = renderFind('library.search');
    expect(screen.getByTestId('gl-studio-find-result')).toHaveTextContent(
      "Open the menu or panel it's in"
    );
    unmount();
    renderFind('sidebar.open-menu');
    expect(screen.getByTestId('gl-studio-find-result')).toHaveTextContent(
      'Not found on the board.'
    );
  });
});
