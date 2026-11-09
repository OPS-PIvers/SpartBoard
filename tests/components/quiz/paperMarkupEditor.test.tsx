import React, { useState } from 'react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  act,
} from '@testing-library/react';
import '@/i18n';

vi.mock('@/utils/scanContrast', () => ({
  enhancedScanUrl: vi.fn(() => Promise.resolve('blob:enhanced')),
}));

import { PaperCropPanel } from '@/components/quiz/paper/PaperCropPanel';
import type { PaperMarkupBinding } from '@/components/quiz/paper/markup/types';
import {
  PAPER_MARKUP_MAX_COMMENT_CHARS,
  PAPER_MARKUP_MAX_ITEMS,
  type PaperMarkupItem,
  type QuizResponseAnswer,
} from '@/types';

// Box from a real page map; the crop adds 2 mm, so the image shows x 36..180, y 68..136.
const BOX = { x: 38, y: 70, w: 140, h: 64 };
// Drawn at 5 px per millimetre: client x = (mm - 36) * 5.
const px = (mmX: number, mmY: number) => ({
  clientX: (mmX - 36) * 5,
  clientY: (mmY - 68) * 5,
});

const ZERO = {
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  right: 0,
  bottom: 0,
  x: 0,
  y: 0,
};
const CANVAS = {
  left: 0,
  top: 0,
  width: 720,
  height: 340,
  right: 720,
  bottom: 340,
  x: 0,
  y: 0,
};
beforeAll(() => {
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
    configurable: true,
    get: () => 850,
  });
  Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', {
    configurable: true,
    get: () => 402,
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      return (
        this.getAttribute('data-tour') === 'quiz-grading.markup-canvas'
          ? CANVAS
          : ZERO
      ) as DOMRect;
    }
  );
});
afterAll(() => {
  vi.restoreAllMocks();
});

const answer: QuizResponseAnswer = {
  questionId: 'q1',
  answer: '',
  answeredAt: 0,
  paperScanId: 'scan1',
  paperTranscript: 'image',
  artifacts: [
    {
      id: 'hw_scan1_q1',
      slot: 'primary',
      kind: 'handwriting',
      storagePath: 'paper_written_crops/t1/scan1/3/q1.webp',
      uploadState: 'uploaded',
    },
  ],
};

type Changes = PaperMarkupItem[][];

const Harness: React.FC<{
  initial?: PaperMarkupItem[];
  changes: Changes;
  binding?: Partial<PaperMarkupBinding>;
}> = ({ initial = [], changes, binding }) => {
  const [items, setItems] = useState<PaperMarkupItem[]>(initial);
  return (
    <PaperCropPanel
      questionNumber={2}
      sessionId="s1"
      responseKey="r1"
      questionId="q1"
      answer={answer}
      privateDoc={null}
      hasSnapshot={false}
      resolveCrop={vi.fn().mockResolvedValue('data:image/webp;base64,AA')}
      markup={{
        items,
        onChange: (next) => {
          changes.push(next);
          setItems(next);
        },
        box: { status: 'ready', box: { page: 1, boxMm: BOX } },
        ...binding,
      }}
    />
  );
};

const setup = async (
  initial?: PaperMarkupItem[],
  binding?: Partial<PaperMarkupBinding>
) => {
  const changes: Changes = [];
  const utils = render(
    <Harness initial={initial} changes={changes} binding={binding} />
  );
  const img = await screen.findByAltText('Handwritten answer, question 2');
  await waitFor(() => expect(img).toHaveAttribute('src', 'blob:enhanced'));
  fireEvent.load(screen.getByAltText('Handwritten answer, question 2'));
  const layer = await screen.findByRole('group', {
    name: 'Marks on the handwriting',
  });
  const last = () => changes[changes.length - 1] ?? initial ?? [];
  return { ...utils, layer, changes, last };
};

const itemEl = (layer: Element, id: string): Element => {
  const el = layer.querySelector(`[data-markup-item="${id}"]`);
  if (!el) throw new Error(`no mark ${id}`);
  return el;
};
const handleEl = (layer: Element, corner: string): Element => {
  const el = layer.querySelector(`[data-markup-handle="${corner}"]`);
  if (!el) throw new Error(`no ${corner} handle`);
  return el;
};

const tool = (name: string | RegExp) => screen.getByRole('button', { name });

const drag = (
  el: Element,
  from: [number, number],
  to: [number, number],
  pointerId = 1
) => {
  fireEvent.pointerDown(el, { ...px(...from), pointerId });
  fireEvent.pointerMove(el, {
    ...px((from[0] + to[0]) / 2, (from[1] + to[1]) / 2),
    pointerId,
  });
  fireEvent.pointerMove(el, { ...px(...to), pointerId });
  fireEvent.pointerUp(el, { ...px(...to), pointerId });
};
const click = (el: Element, at: [number, number]) => {
  fireEvent.pointerDown(el, px(...at));
  fireEvent.pointerUp(el, px(...at));
};

const rectItem = (
  id: string,
  kind: 'highlight' | 'rect' | 'ellipse',
  rectMm: { x: number; y: number; w: number; h: number },
  extra: Partial<PaperMarkupItem> = {}
) => ({ id, kind, rectMm, ...extra }) as PaperMarkupItem;

describe('paper markup editor', () => {
  it('is a labelled toolbar with pressed states', async () => {
    await setup();
    const bar = screen.getByRole('toolbar', { name: 'Markup tools' });
    expect(
      within(bar).getByRole('button', { name: 'Select and move' })
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(tool('Highlighter'));
    expect(tool('Highlighter')).toHaveAttribute('aria-pressed', 'true');
    expect(tool('Select and move')).toHaveAttribute('aria-pressed', 'false');
  });

  it.each([
    ['Highlighter', 'highlight'],
    ['Box', 'rect'],
    ['Circle', 'ellipse'],
  ] as const)(
    '%s drag creates a %s in sheet millimetres',
    async (label, kind) => {
      const { layer, last } = await setup();
      fireEvent.click(tool(label));
      drag(layer, [50, 80], [90, 95]);
      expect(last()).toHaveLength(1);
      const item = last()[0];
      expect(item.kind).toBe(kind);
      expect(item).not.toHaveProperty('color');
      expect('rectMm' in item && item.rectMm).toEqual({
        x: 50,
        y: 80,
        w: 40,
        h: 15,
      });
    }
  );

  it('draws a live preview while dragging', async () => {
    const { layer, container } = await setup();
    fireEvent.click(tool('Box'));
    fireEvent.pointerDown(layer, px(50, 80));
    fireEvent.pointerMove(layer, px(70, 90));
    expect(container.querySelectorAll('svg rect[stroke]').length).toBe(1);
    fireEvent.pointerUp(layer, px(70, 90));
  });

  it('reads a tiny drag as a click: no sliver, selection cleared', async () => {
    const { layer, changes } = await setup([
      rectItem('a', 'rect', { x: 100, y: 100, w: 20, h: 10 }),
    ]);
    fireEvent.click(tool('Box'));
    drag(layer, [60, 80], [60.4, 80.3]);
    drag(layer, [60, 80], [70, 80.8]);
    expect(changes).toHaveLength(0);
  });

  it('keeps a drawn shape on the image when the drag leaves it', async () => {
    const { layer, last } = await setup();
    fireEvent.click(tool('Box'));
    drag(layer, [150, 120], [400, 300]);
    expect('rectMm' in last()[0] && last()[0].rectMm).toEqual({
      x: 150,
      y: 120,
      w: 30,
      h: 16,
    });
  });

  it('drops a stamp of the chosen symbol on click', async () => {
    const { layer, last } = await setup();
    fireEvent.click(tool('Choose stamp'));
    const menu = screen.getByRole('menu', { name: 'Choose stamp' });
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: /Star/ }));
    expect(tool('Star stamp')).toHaveAttribute('aria-pressed', 'true');
    click(layer, [60, 90]);
    expect(last()).toEqual([
      expect.objectContaining({
        kind: 'stamp',
        symbol: 'star',
        atMm: { x: 60, y: 90 },
      }),
    ]);
  });

  it('keeps a stamp at the edge wholly on the image', async () => {
    const { layer, last } = await setup();
    fireEvent.click(tool('Check stamp'));
    click(layer, [36.2, 68.1]);
    expect(last()[0]).toMatchObject({ atMm: { x: 39, y: 71 } });
  });

  it('opens a pin comment, saves on Enter and discards an empty pin', async () => {
    const { layer, changes, last } = await setup();
    fireEvent.click(tool('Comment pin'));
    click(layer, [70, 90]);
    const box = await screen.findByRole('textbox', { name: 'Comment' });
    expect(box).toHaveFocus();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(changes).toHaveLength(0);

    click(layer, [70, 90]);
    const again = await screen.findByRole('textbox', { name: 'Comment' });
    fireEvent.change(again, { target: { value: 'Show your units' } });
    fireEvent.keyDown(again, { key: 'Enter', shiftKey: true });
    expect(changes).toHaveLength(0);
    fireEvent.keyDown(again, { key: 'Enter' });
    expect(last()).toEqual([
      expect.objectContaining({
        kind: 'pin',
        atMm: { x: 70, y: 90 },
        comment: 'Show your units',
      }),
    ]);
    expect(
      screen.getByRole('list', { name: 'Comments on the handwriting' })
    ).toHaveTextContent('1Show your units');
  });

  it('adds a comment to a box from its selection and numbers it', async () => {
    const { layer, last } = await setup([
      rectItem('a', 'rect', { x: 50, y: 80, w: 20, h: 10 }),
      { id: 'p', kind: 'pin', atMm: { x: 120, y: 100 }, comment: 'First' },
    ]);
    fireEvent.pointerDown(itemEl(layer, 'a'), px(55, 82));
    fireEvent.pointerUp(layer, px(55, 82));
    fireEvent.click(await screen.findByRole('button', { name: 'Add comment' }));
    const box = screen.getByRole('textbox', { name: 'Comment' });
    fireEvent.change(box, { target: { value: 'Good evidence' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(last()[0]).toMatchObject({ id: 'a', comment: 'Good evidence' });
    const list = screen.getByRole('list', {
      name: 'Comments on the handwriting',
    });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual(['1Good evidence', '2First']);
  });

  it('caps a comment at 500 characters and shows the counter near the cap', async () => {
    const { layer } = await setup();
    fireEvent.click(tool('Comment pin'));
    click(layer, [70, 90]);
    const box = await screen.findByRole('textbox', { name: 'Comment' });
    expect(box).toHaveAttribute(
      'maxLength',
      String(PAPER_MARKUP_MAX_COMMENT_CHARS)
    );
    fireEvent.change(box, { target: { value: 'a'.repeat(100) } });
    expect(screen.queryByText(/\/500$/)).toBeNull();
    fireEvent.change(box, { target: { value: 'a'.repeat(600) } });
    expect(box).toHaveValue('a'.repeat(500));
    expect(screen.getByText('500/500')).toBeInTheDocument();
  });

  it('moves a selected item and resizes it from a corner', async () => {
    const { layer, last } = await setup([
      rectItem('a', 'rect', { x: 50, y: 80, w: 20, h: 10 }),
    ]);
    const shape = itemEl(layer, 'a');
    fireEvent.pointerDown(shape, px(55, 82));
    fireEvent.pointerMove(layer, px(60, 85));
    fireEvent.pointerUp(layer, px(65, 87));
    expect(last()[0]).toMatchObject({ rectMm: { x: 60, y: 85, w: 20, h: 10 } });

    const handle = handleEl(layer, 'se');
    fireEvent.pointerDown(handle, px(80, 95));
    fireEvent.pointerMove(layer, px(90, 100));
    fireEvent.pointerUp(layer, px(90, 100));
    expect(last()[0]).toMatchObject({ rectMm: { x: 60, y: 85, w: 30, h: 15 } });

    // A corner dragged past the opposite one stops at the minimum size.
    fireEvent.pointerDown(handleEl(layer, 'se'), px(90, 100));
    fireEvent.pointerUp(layer, px(20, 20));
    expect(last()[0]).toMatchObject({ rectMm: { x: 60, y: 85, w: 2, h: 2 } });
  });

  it('stops a moved item at the image edge', async () => {
    const { layer, last } = await setup([
      rectItem('a', 'highlight', { x: 50, y: 80, w: 20, h: 10 }),
    ]);
    fireEvent.pointerDown(itemEl(layer, 'a'), px(55, 82));
    fireEvent.pointerUp(layer, px(300, 300));
    expect(last()[0]).toMatchObject({
      rectMm: { x: 160, y: 126, w: 20, h: 10 },
    });
  });

  it('deletes the selection with Delete and Backspace, and undoes and redoes', async () => {
    const { layer, last } = await setup([
      rectItem('a', 'rect', { x: 50, y: 80, w: 20, h: 10 }),
      rectItem('b', 'ellipse', { x: 100, y: 80, w: 20, h: 10 }),
    ]);
    fireEvent.pointerDown(itemEl(layer, 'a'), px(55, 82));
    fireEvent.pointerUp(layer, px(55, 82));
    fireEvent.keyDown(layer, { key: 'Delete' });
    expect(last().map((i) => i.id)).toEqual(['b']);
    fireEvent.pointerDown(itemEl(layer, 'b'), px(105, 82));
    fireEvent.pointerUp(layer, px(105, 82));
    fireEvent.keyDown(layer, { key: 'Backspace' });
    expect(last()).toEqual([]);
    fireEvent.keyDown(layer, { key: 'z', ctrlKey: true });
    expect(last().map((i) => i.id)).toEqual(['b']);
    fireEvent.keyDown(layer, { key: 'z', metaKey: true });
    expect(last().map((i) => i.id)).toEqual(['a', 'b']);
    fireEvent.keyDown(layer, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(last().map((i) => i.id)).toEqual(['b']);
    fireEvent.click(tool('Undo'));
    expect(last().map((i) => i.id)).toEqual(['a', 'b']);
    expect(tool('Undo')).toBeDisabled();
    fireEvent.click(tool('Redo'));
    expect(last().map((i) => i.id)).toEqual(['b']);
  });

  it('never takes Ctrl+Z from the comment box', async () => {
    const { layer, changes } = await setup([
      rectItem('a', 'rect', { x: 50, y: 80, w: 20, h: 10 }),
    ]);
    fireEvent.click(tool('Box'));
    drag(layer, [100, 100], [120, 110]);
    expect(changes).toHaveLength(1);
    fireEvent.click(await screen.findByRole('button', { name: 'Add comment' }));
    const box = screen.getByRole('textbox', { name: 'Comment' });
    fireEvent.keyDown(box, { key: 'z', ctrlKey: true });
    expect(changes).toHaveLength(1);
  });

  it('steps Escape back: drawing, then selection, then tool, then lets the modal have it', async () => {
    const { layer, changes } = await setup();
    const outer = vi.fn();
    document.addEventListener('keydown', outer);
    fireEvent.click(tool('Box'));
    fireEvent.pointerDown(layer, px(50, 80));
    fireEvent.pointerMove(layer, px(80, 100));
    fireEvent.keyDown(layer, { key: 'Escape' });
    fireEvent.pointerUp(layer, px(80, 100));
    expect(changes).toHaveLength(0);
    drag(layer, [50, 80], [80, 100]);
    expect(changes).toHaveLength(1);
    fireEvent.keyDown(layer, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Selected mark' })).toBeNull();
    expect(tool('Box')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(layer, { key: 'Escape' });
    expect(tool('Select and move')).toHaveAttribute('aria-pressed', 'true');
    expect(outer).not.toHaveBeenCalled();
    fireEvent.keyDown(layer, { key: 'Escape' });
    expect(outer).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', outer);
  });

  it(`turns the drawing tools off at ${PAPER_MARKUP_MAX_ITEMS} marks and says why`, async () => {
    const full = Array.from({ length: PAPER_MARKUP_MAX_ITEMS }, (_, i) =>
      rectItem(`i${i}`, 'rect', {
        x: 40 + (i % 10) * 12,
        y: 72 + Math.floor(i / 10) * 14,
        w: 8,
        h: 8,
      })
    );
    const { layer, changes } = await setup(full);
    for (const name of [
      'Highlighter',
      'Box',
      'Circle',
      'Comment pin',
      'Check stamp',
    ])
      expect(tool(name)).toBeDisabled();
    expect(
      screen.getByText('40 marks is the limit. Delete one to add another.')
    ).toBeInTheDocument();
    click(layer, [178, 134]);
    expect(changes).toHaveLength(0);
    fireEvent.pointerDown(itemEl(layer, 'i0'), px(41, 73));
    fireEvent.pointerUp(layer, px(41, 73));
    fireEvent.keyDown(layer, { key: 'Delete' });
    expect(tool('Box')).not.toBeDisabled();
  });

  it('recolors the selection and draws new marks in the picked color', async () => {
    const { layer, last } = await setup([
      rectItem('a', 'rect', { x: 50, y: 80, w: 20, h: 10 }),
    ]);
    fireEvent.pointerDown(itemEl(layer, 'a'), px(55, 82));
    fireEvent.pointerUp(layer, px(55, 82));
    fireEvent.click(tool('Color: Red'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Blue' }));
    expect(last()[0]).toMatchObject({ id: 'a', color: 'blue' });
    fireEvent.click(tool('Circle'));
    drag(layer, [100, 100], [120, 110]);
    expect(last()[1]).toMatchObject({ kind: 'ellipse', color: 'blue' });
    fireEvent.click(tool('Highlighter'));
    expect(tool('Color: Yellow')).toBeInTheDocument();
  });

  it('places a stamp from the keyboard', async () => {
    const { layer, last } = await setup();
    fireEvent.click(tool('Check stamp'));
    act(() => layer.focus());
    fireEvent.keyDown(layer, { key: 'Enter' });
    expect(last()[0]).toMatchObject({
      kind: 'stamp',
      atMm: { x: 108, y: 102 },
    });
  });

  it('shows the notice slot and the score hint', async () => {
    await setup([], { notice: <p>Earlier scan</p>, needsScore: true });
    expect(screen.getByText('Earlier scan')).toBeInTheDocument();
    expect(
      screen.getByText('Marks save once you enter a score.')
    ).toBeInTheDocument();
  });

  it('offers snippets in the comment box when given', async () => {
    const { layer } = await setup([], { snippets: ['Cite the text.'] });
    fireEvent.click(tool('Comment pin'));
    click(layer, [70, 90]);
    const box = await screen.findByRole('textbox', { name: 'Comment' });
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Insert a saved comment' }),
      {
        target: { value: 'Cite the text.' },
      }
    );
    expect(box).toHaveValue('Cite the text.');
  });

  it('keeps the toolbar but disables it while the sheet position is unknown', async () => {
    const changes: Changes = [];
    render(
      <Harness changes={changes} binding={{ box: { status: 'unavailable' } }} />
    );
    await screen.findByAltText('Handwritten answer, question 2');
    expect(tool('Box')).toBeDisabled();
    expect(
      screen.getByText("Markup isn't available for this scan.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Marks on the handwriting' })
    ).toBeNull();
  });
});
