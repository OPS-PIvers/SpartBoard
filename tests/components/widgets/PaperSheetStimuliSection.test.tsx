/**
 * The "Add to the answer sheet" editor (docs/plans/QUIZ_PAPER_SHEET_STIMULI.md
 * D8, D10, D11, D13, D18). Presentational, so every source and every edit is
 * checked through the list it hands back.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { PaperSheetStimuliSection } from '@/components/widgets/QuizWidget/components/PaperSheetStimuliSection';
import type { PaperSheetStimulus, QuizStimulus } from '@/types';
import { MAX_STIMULI_PER_PAGE } from '@/utils/paperSheetStimulusLayout';

const stim = (over: Partial<PaperSheetStimulus> = {}): PaperSheetStimulus => ({
  id: 'a',
  label: 'Unit 3 graph',
  source: 'image',
  driveFileId: 'drive-a',
  widthPx: 800,
  heightPx: 600,
  ...over,
});

const setup = (
  over: Partial<React.ComponentProps<typeof PaperSheetStimuliSection>> = {}
) => {
  const onChange = vi.fn<(next: PaperSheetStimulus[]) => void>();
  const onUploadFile = vi.fn<
    (file: File) => Promise<PaperSheetStimulus | null>
  >(() => Promise.resolve(stim({ id: 'new', label: 'Pasted' })));
  const onPickFromDrive = vi.fn(() =>
    Promise.resolve(stim({ id: 'picked', label: 'From Drive' }))
  );
  const props: React.ComponentProps<typeof PaperSheetStimuliSection> = {
    stimuli: [],
    onChange,
    quizImageStimuli: [],
    pageCount: 2,
    imageSrc: {},
    failed: [],
    onUploadFile,
    onPickFromDrive,
    busy: false,
    ...over,
  };
  const view = render(<PaperSheetStimuliSection {...props} />);
  return { ...view, onChange, onUploadFile, onPickFromDrive };
};

const expand = () =>
  fireEvent.click(
    screen.getByRole('button', { name: /Add to the answer sheet/ })
  );

describe('PaperSheetStimuliSection', () => {
  it('stays out of the way until a teacher opens it', () => {
    setup();
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'From Drive' })
    ).not.toBeInTheDocument();
    expand();
    expect(
      screen.getByRole('button', { name: 'Upload or PDF' })
    ).toBeInTheDocument();
  });

  it('opens already expanded when the quiz has stimuli on it', () => {
    setup({ stimuli: [stim()] });
    expect(
      screen.getByRole('button', { name: 'Upload or PDF' })
    ).toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeInTheDocument();
  });

  it('appends what the Drive picker returns', async () => {
    const { onChange } = setup({ stimuli: [stim()] });
    fireEvent.click(screen.getByRole('button', { name: 'From Drive' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls[0][0].map((s) => s.id)).toEqual(['a', 'picked']);
  });

  it('copies a quiz stimulus rather than re-uploading it', () => {
    const quizStimulus = {
      id: 'qs-1',
      label: 'Map of the colonies',
      type: 'image',
      driveFileId: 'drive-shared',
    } as QuizStimulus;
    const { onChange } = setup({ quizImageStimuli: [quizStimulus] });
    expand();
    fireEvent.click(screen.getByRole('button', { name: 'From this quiz' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Map of the colonies' })
    );
    const [added] = onChange.mock.calls[0][0];
    expect(added.driveFileId).toBe('drive-shared');
    expect(added.label).toBe('Map of the colonies');
    expect(added.id).not.toBe('qs-1');
  });

  it('offers "From this quiz" only when the quiz has an image on it', () => {
    setup({ stimuli: [stim()] });
    expect(
      screen.queryByRole('button', { name: 'From this quiz' })
    ).not.toBeInTheDocument();
  });

  it('reorders and removes rows', () => {
    const list = [
      stim({ id: 'a', label: 'First' }),
      stim({ id: 'b', label: 'Second' }),
    ];
    const { onChange } = setup({ stimuli: list });
    fireEvent.click(screen.getByRole('button', { name: 'Move Second up' }));
    expect(onChange.mock.calls[0][0].map((s) => s.id)).toEqual(['b', 'a']);
    onChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Remove First' }));
    expect(onChange.mock.calls[0][0].map((s) => s.id)).toEqual(['b']);
  });

  it('cannot move the ends off the list', () => {
    setup({
      stimuli: [
        stim({ id: 'a', label: 'First' }),
        stim({ id: 'b', label: 'Second' }),
      ],
    });
    expect(
      screen.getByRole('button', { name: 'Move First up' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Move Second down' })
    ).toBeDisabled();
  });

  it('writes a caption and a pinned page back onto the stimulus', () => {
    const { onChange } = setup({ stimuli: [stim()] });
    fireEvent.change(screen.getByLabelText('Caption for Unit 3 graph'), {
      target: { value: 'Use for questions 1-10' },
    });
    expect(onChange.mock.calls[0][0][0].caption).toBe('Use for questions 1-10');

    onChange.mockClear();
    fireEvent.change(screen.getByLabelText('Pages for Unit 3 graph'), {
      target: { value: '2' },
    });
    expect(onChange.mock.calls[0][0][0].page).toBe(2);
  });

  it('offers one option per page, and "every page" clears the pin', () => {
    const { onChange } = setup({ stimuli: [stim({ page: 2 })], pageCount: 3 });
    const select = screen.getByLabelText('Pages for Unit 3 graph');
    expect(
      Array.from(select.querySelectorAll('option')).map((o) => o.textContent)
    ).toEqual(['Every page', 'Page 1', 'Page 2', 'Page 3']);
    fireEvent.change(select, { target: { value: '0' } });
    expect(onChange.mock.calls[0][0][0].page).toBeUndefined();
  });

  it('flags a stimulus pinned past the end of a test that got shorter', () => {
    setup({ stimuli: [stim({ label: 'Graph', page: 5 })], pageCount: 2 });
    expect(
      screen.getByText(/Graph is pinned to a page this test no longer has/)
    ).toBeInTheDocument();
  });

  it('warns when a page holds more than it can print', () => {
    setup({
      stimuli: Array.from({ length: MAX_STIMULI_PER_PAGE + 1 }, (_, i) =>
        stim({ id: `s${i}`, label: `Item ${i}`, page: 1 })
      ),
      pageCount: 2,
    });
    expect(
      screen.getByText(
        new RegExp(`A page prints at most ${MAX_STIMULI_PER_PAGE} of these`)
      )
    ).toBeInTheDocument();
  });

  it('names a row whose image never loaded', () => {
    const failed = stim({ label: 'Unit 3 graph' });
    setup({ stimuli: [failed], failed: [failed] });
    expect(screen.getByText(/Could not load this image/)).toBeInTheDocument();
  });

  describe('grids and lines', () => {
    const openTemplates = () => {
      expand();
      fireEvent.click(screen.getByRole('button', { name: 'Grid or lines' }));
    };

    it('offers every kind the plan names, the grid both ways', () => {
      setup();
      openTemplates();
      for (const name of [
        'Coordinate grid',
        'Coordinate grid (first quadrant)',
        'Number line 0 to 10',
        'Graph paper',
        'Lined writing area',
        'Blank box',
      ]) {
        expect(screen.getByRole('button', { name })).toBeInTheDocument();
      }
    });

    it('adds a template as a spec, with no file behind it', () => {
      const { onChange } = setup();
      openTemplates();
      fireEvent.click(screen.getByRole('button', { name: 'Graph paper' }));
      const [added] = onChange.mock.calls[0][0];
      expect(added).toMatchObject({
        source: 'template',
        label: 'Graph paper',
        template: { kind: 'graph-paper', heightMm: 80 },
      });
      expect(added.driveFileId).toBeUndefined();
      expect(added.url).toBeUndefined();
    });

    it('edits a grid in place and renames the row to match', () => {
      const grid: PaperSheetStimulus = {
        id: 'g',
        label: 'Number line 0 to 10',
        source: 'template',
        template: { kind: 'number-line', min: 0, max: 10, step: 1 },
      };
      const { onChange } = setup({ stimuli: [grid] });
      fireEvent.change(screen.getByLabelText('Highest'), {
        target: { value: '20' },
      });
      expect(onChange.mock.calls[0][0][0]).toMatchObject({
        label: 'Number line 0 to 20',
        template: { kind: 'number-line', min: 0, max: 20, step: 1 },
      });
    });

    it('pins a one-quadrant grid to the origin whatever the lowest was', () => {
      const grid: PaperSheetStimulus = {
        id: 'g',
        label: 'Coordinate grid',
        source: 'template',
        template: {
          kind: 'coordinate-grid',
          quadrants: 4,
          min: -10,
          max: 10,
          step: 1,
          showNumbers: true,
        },
      };
      const { onChange } = setup({ stimuli: [grid] });
      fireEvent.change(screen.getByLabelText('Quadrants'), {
        target: { value: '1' },
      });
      expect(onChange.mock.calls[0][0][0].template).toMatchObject({
        quadrants: 1,
        min: 0,
      });
    });

    it('hides the lowest value where one quadrant makes it meaningless', () => {
      setup({
        stimuli: [
          {
            id: 'g',
            label: 'Coordinate grid (first quadrant)',
            source: 'template',
            template: {
              kind: 'coordinate-grid',
              quadrants: 1,
              min: 0,
              max: 10,
              step: 1,
              showNumbers: true,
            },
          },
        ],
      });
      expect(screen.queryByLabelText('Lowest')).toBeNull();
      expect(screen.getByLabelText('Highest')).toBeInTheDocument();
    });

    it('gives a plain box just its height', () => {
      setup({
        stimuli: [
          {
            id: 'b',
            label: 'Blank box',
            source: 'template',
            template: { kind: 'blank-box', heightMm: 60 },
          },
        ],
      });
      expect(screen.getByLabelText('Height (mm)')).toHaveValue(60);
      expect(screen.queryByLabelText('Step')).toBeNull();
    });
  });

  it('keeps saying which images the PLC still cannot open', () => {
    const unshared = stim({ label: 'Amelia map' });
    setup({ stimuli: [stim(), unshared], unshared: [unshared] });
    expect(
      screen.getByText(/Amelia map is only visible to you/)
    ).toBeInTheDocument();
  });

  it('says nothing about sharing outside a PLC', () => {
    setup({ stimuli: [stim()] });
    expect(screen.queryByText(/only visible to you/)).toBeNull();
  });

  it('adds a pasted image, and leaves a paste into a caption alone', async () => {
    const file = new File(['x'], 'pasted.png', { type: 'image/png' });
    const { onChange, onUploadFile } = setup({ stimuli: [stim()] });

    const caption = screen.getByLabelText('Caption for Unit 3 graph');
    const intoCaption = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(intoCaption, 'clipboardData', {
      value: { files: [file] },
    });
    caption.dispatchEvent(intoCaption);
    expect(onUploadFile).not.toHaveBeenCalled();

    const intoPage = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(intoPage, 'clipboardData', {
      value: { files: [file] },
    });
    window.dispatchEvent(intoPage);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onUploadFile).toHaveBeenCalledWith(file);
    expect(intoPage.defaultPrevented).toBe(true);
    expect(onChange.mock.calls[0][0].map((s) => s.id)).toEqual(['a', 'new']);
  });

  it('does not listen for a paste while it is collapsed', () => {
    const { onUploadFile } = setup();
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { files: [new File(['x'], 'p.png', { type: 'image/png' })] },
    });
    window.dispatchEvent(event);
    expect(onUploadFile).not.toHaveBeenCalled();
  });

  it('locks the source buttons while an upload is in flight', () => {
    setup({ stimuli: [stim()], busy: true });
    expect(
      screen.getByRole('button', { name: 'Upload or PDF' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'From Drive' })).toBeDisabled();
  });
});
