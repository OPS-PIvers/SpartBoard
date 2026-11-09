import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import {
  act,
  fireEvent,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import '@/i18n';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn(() => Promise.resolve(true)) }),
}));
vi.mock('@/utils/scanContrast', () => ({
  enhancedScanUrl: vi.fn(() => Promise.resolve('blob:enhanced')),
}));
vi.mock('@/utils/paperBatchStore', () => ({
  getPaperBatch: vi.fn(() => Promise.resolve(null)),
}));

import { REEDIT_DEBOUNCE_MS } from '@/components/widgets/QuizWidget/components/FreeResponseGrader';
import { useSavedMarkupComments } from '@/components/quiz/paper/markup/useSavedMarkupComments';
import type { AuthContextType } from '@/context/AuthContextValue';
import { QUIZ_MARKUP_COMMENTS_MAX } from '@/types';
import {
  installMarkupGeometry,
  paper,
  px,
  readyLayer,
  renderMarkupGrader,
  scored,
} from './paperMarkupGraderKit';

beforeAll(installMarkupGeometry);
afterAll(() => {
  vi.restoreAllMocks();
});

const TEXT = 'Cite the text.';

const tool = (name: string | RegExp) =>
  within(screen.getByRole('toolbar', { name: 'Markup tools' })).getByRole(
    'button',
    { name }
  );
const click = (el: Element, at: [number, number]) => {
  fireEvent.pointerDown(el, px(...at));
  fireEvent.pointerUp(el, px(...at));
};
const openComment = async (layer: Element, at: [number, number] = [70, 90]) => {
  fireEvent.click(tool('Comment pin'));
  click(layer, at);
  return screen.findByRole('textbox', { name: 'Comment' });
};
const openMenu = () => {
  fireEvent.click(tool('Choose a saved comment'));
  return screen.getByRole('menu', { name: 'Saved comments' });
};
const manyComments = (n: number) =>
  Array.from({ length: n }, (_, i) => `Saved comment ${i + 1}`);

describe('saved comments: saving', () => {
  it('keeps a comment for reuse on the profile only, never in the grade', async () => {
    const { writes, onSaveGrade } = renderMarkupGrader([
      paper('ada', 1, scored()),
    ]);
    const layer = await readyLayer();
    const box = await openComment(layer);
    expect(
      screen.getByRole('button', { name: 'Save for reuse' })
    ).toBeDisabled();
    fireEvent.change(box, { target: { value: TEXT } });
    fireEvent.click(screen.getByRole('button', { name: 'Save for reuse' }));
    expect(writes).toEqual([['quiz', { markupComments: [TEXT] }]]);
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save for reuse' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaveGrade).toHaveBeenCalled(), {
      timeout: REEDIT_DEBOUNCE_MS + 1000,
    });
    const grade = onSaveGrade.mock.calls[0][2];
    expect(grade.imageMarkup?.items[0]).toMatchObject({ comment: TEXT });
    expect(JSON.stringify(grade)).not.toContain('markupComments');
    expect(
      writes.every(
        ([type, preset]) =>
          type === 'quiz' && Object.keys(preset).join() === 'markupComments'
      )
    ).toBe(true);
  });

  it('does not add the same comment twice, even with extra spaces', async () => {
    const { writes } = renderMarkupGrader([paper('ada', 1, scored())], {
      saved: [TEXT],
    });
    const box = await openComment(await readyLayer());
    fireEvent.change(box, { target: { value: `  ${TEXT}  ` } });
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save for reuse' })).toBeNull();
    expect(writes).toEqual([]);
  });

  it('stops at the limit and says why', async () => {
    const { writes } = renderMarkupGrader([paper('ada', 1, scored())], {
      saved: manyComments(QUIZ_MARKUP_COMMENTS_MAX),
    });
    const box = await openComment(await readyLayer());
    fireEvent.change(box, { target: { value: 'One more.' } });
    const full = screen.getByRole('button', { name: 'List is full' });
    expect(full).toBeDisabled();
    expect(full).toHaveAttribute(
      'title',
      '30 saved comments is the limit. Remove one first.'
    );
    fireEvent.click(full);
    expect(writes).toEqual([]);
  });

  it('offers the saved list in the comment box and fills the text', async () => {
    renderMarkupGrader([paper('ada', 1, scored())], {
      saved: [TEXT, 'Show your work.'],
    });
    const box = await openComment(await readyLayer());
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Insert a saved comment' }),
      { target: { value: 'Show your work.' } }
    );
    expect(box).toHaveValue('Show your work.');
  });
});

describe('saved comments: one-click drop', () => {
  it('arms the pin tool, drops pins that carry the comment, and opens no box', async () => {
    const { onSaveGrade } = renderMarkupGrader([paper('ada', 1, scored())], {
      saved: [TEXT, 'Show your work.'],
    });
    const layer = await readyLayer();
    const menu = openMenu();
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Show your work.' })
    );
    expect(screen.queryByRole('menu')).toBeNull();
    expect(
      screen.getByText('Click the image to add: Show your work.')
    ).toBeInTheDocument();
    expect(tool('Comment pin')).toHaveAttribute('aria-pressed', 'true');

    click(layer, [70, 90]);
    expect(screen.queryByRole('textbox', { name: 'Comment' })).toBeNull();
    click(layer, [120, 110]);
    expect(layer.querySelectorAll('[data-markup-focus]')).toHaveLength(2);
    expect(
      screen.getByText('Click the image to add: Show your work.')
    ).toBeInTheDocument();

    await waitFor(() => expect(onSaveGrade).toHaveBeenCalled(), {
      timeout: REEDIT_DEBOUNCE_MS + 1000,
    });
    const items = onSaveGrade.mock.calls.at(-1)?.[2].imageMarkup?.items ?? [];
    expect(items).toHaveLength(2);
    expect(items).toEqual([
      expect.objectContaining({ kind: 'pin', comment: 'Show your work.' }),
      expect.objectContaining({ kind: 'pin', comment: 'Show your work.' }),
    ]);
  });

  it('disarms on Escape, and the pin tool then opens a blank comment box', async () => {
    renderMarkupGrader([paper('ada', 1, scored())], { saved: [TEXT] });
    const layer = await readyLayer();
    fireEvent.click(within(openMenu()).getByRole('menuitem', { name: TEXT }));
    act(() => layer.focus());
    fireEvent.keyDown(layer, { key: 'Escape' });
    expect(screen.queryByText(/Click the image to add/)).toBeNull();
    click(layer, [70, 90]);
    expect(await screen.findByRole('textbox', { name: 'Comment' })).toHaveValue(
      ''
    );
  });

  it('shows one line telling the teacher how to save a comment when there are none', async () => {
    renderMarkupGrader([paper('ada', 1, scored())]);
    await readyLayer();
    expect(
      within(openMenu()).getByText(
        'No saved comments yet. Save one from a comment box.'
      )
    ).toBeInTheDocument();
  });

  it('truncates a long comment to one line and keeps the whole text as its title', async () => {
    const long = 'A very long saved comment. '.repeat(15).trim();
    renderMarkupGrader([paper('ada', 1, scored())], { saved: [long] });
    await readyLayer();
    const row = within(openMenu()).getByRole('menuitem', {
      name: new RegExp(`^${long.slice(0, 20)}`),
    });
    expect(row).toHaveAttribute('title', long);
    expect(row.querySelector('.truncate')).not.toBeNull();
  });
});

describe('saved comments: removing', () => {
  it('removes one comment and puts it back in place with Undo', async () => {
    const { writes } = renderMarkupGrader([paper('ada', 1, scored())], {
      saved: [TEXT, 'Show your work.', 'Add detail.'],
    });
    await readyLayer();
    const menu = openMenu();
    fireEvent.click(
      within(menu).getByRole('menuitem', {
        name: 'Remove saved comment: Show your work.',
      })
    );
    expect(writes.at(-1)).toEqual([
      'quiz',
      { markupComments: [TEXT, 'Add detail.'] },
    ]);
    expect(within(menu).getByText('Comment removed.')).toBeInTheDocument();
    expect(
      within(menu).queryByRole('menuitem', { name: 'Show your work.' })
    ).toBeNull();

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Undo' }));
    expect(writes.at(-1)).toEqual([
      'quiz',
      { markupComments: [TEXT, 'Show your work.', 'Add detail.'] },
    ]);
    expect(within(menu).queryByText('Comment removed.')).toBeNull();
  });

  it('names each remove button for a screen reader', async () => {
    renderMarkupGrader([paper('ada', 1, scored())], { saved: [TEXT] });
    await readyLayer();
    expect(
      within(openMenu()).getByRole('menuitem', {
        name: `Remove saved comment: ${TEXT}`,
      })
    ).toBeInTheDocument();
  });
});

describe('saved comments: flag off', () => {
  it('shows no markup, no saved list and writes nothing to the profile', async () => {
    const { writes } = renderMarkupGrader([paper('ada', 1, scored())], {
      markup: false,
      saved: [TEXT],
    });
    await screen.findByAltText(/Handwritten answer/);
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Choose a saved comment' })
    ).toBeNull();
    expect(screen.queryByText(TEXT)).toBeNull();
    expect(writes).toEqual([]);
  });
});

describe('useSavedMarkupComments', () => {
  const setup = (list: unknown) => {
    const save = vi.fn();
    const auth = {
      savedWidgetPresets: { quiz: { markupComments: list } },
      saveWidgetPreset: save,
    } as unknown as AuthContextType;
    const hook = renderHook(() => useSavedMarkupComments(auth, true));
    return { save, hook };
  };

  it('writes only savedWidgetPresets.quiz.markupComments, trimmed', () => {
    const { save, hook } = setup(['A']);
    act(() => {
      expect(hook.result.current?.add('  B  ')).toBe(true);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('quiz', { markupComments: ['A', 'B'] });
  });

  it('refuses empty, duplicate and over-limit comments without writing', () => {
    const { save, hook } = setup(manyComments(QUIZ_MARKUP_COMMENTS_MAX));
    const saved = hook.result.current;
    expect(saved?.add('   ')).toBe(false);
    expect(saved?.add('Saved comment 3')).toBe(false);
    expect(saved?.add('Brand new')).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it('survives two quick changes without overwriting the first', () => {
    const { save, hook } = setup(['A']);
    act(() => {
      hook.result.current?.add('B');
      hook.result.current?.add('C');
    });
    expect(save).toHaveBeenLastCalledWith('quiz', {
      markupComments: ['A', 'B', 'C'],
    });
  });

  it('ignores junk in the stored list', () => {
    const { hook } = setup(['A', 3, '', '  ', 'A', null, 'B']);
    expect(hook.result.current?.list).toEqual(['A', 'B']);
  });

  it('is off when the flag is off or there is no profile', () => {
    const auth = {
      savedWidgetPresets: {},
      saveWidgetPreset: vi.fn(),
    } as unknown as AuthContextType;
    expect(
      renderHook(() => useSavedMarkupComments(auth, false)).result.current
    ).toBeUndefined();
    expect(
      renderHook(() => useSavedMarkupComments(undefined, true)).result.current
    ).toBeUndefined();
  });
});
