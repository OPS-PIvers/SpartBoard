import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WallLayout } from './WallLayout';
import { ColumnsLayout } from './ColumnsLayout';
import { TableLayout } from './TableLayout';
import { TimelineLayout } from './TimelineLayout';
import {
  columnsDropPatch,
  tableDropPatch,
  timelineDropPatch,
  UNSORTED_ID,
} from './wallDrag';
import type { DragEndEvent } from '@dnd-kit/core';
import { WordCloudLayout } from './WordCloudLayout';
import { LayoutRouter } from './LayoutRouter';
import { makeSession, makeSubmission } from './fixtures';

vi.mock('@/config/firebase', () => ({ storage: {} }));
vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(() =>
    Promise.resolve('https://storage.test/photo.png')
  ),
  ref: (_storage: unknown, path: string) => path,
}));

describe('wall layouts', () => {
  it('WallLayout renders approved cards pinned-first and hides pending posts', () => {
    render(
      <WallLayout
        session={makeSession()}
        mode="gallery"
        showNames={false}
        submissions={[
          makeSubmission({ id: 'a', content: 'first', submittedAt: 1 }),
          makeSubmission({
            id: 'b',
            content: 'pinned',
            submittedAt: 2,
            pinned: true,
          }),
          makeSubmission({ id: 'c', content: 'waiting', status: 'pending' }),
        ]}
      />
    );
    const cards = screen
      .getByTestId('aw-layout-wall')
      .querySelectorAll('article');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('pinned');
    expect(screen.queryByText('waiting')).not.toBeInTheDocument();
  });

  it('ColumnsLayout groups cards by section and collects the rest under Unsorted', () => {
    render(
      <ColumnsLayout
        session={makeSession({
          layout: 'columns',
          sections: [
            { id: 'c1', label: 'Claims' },
            { id: 'c2', label: 'Evidence' },
          ],
        })}
        mode="gallery"
        showNames={false}
        submissions={[
          makeSubmission({ id: 'a', content: 'claim one', sectionId: 'c1' }),
          makeSubmission({ id: 'b', content: 'stray' }),
        ]}
      />
    );
    expect(screen.getByText('Claims')).toBeInTheDocument();
    expect(screen.getByText('Evidence')).toBeInTheDocument();
    expect(screen.getByTestId('aw-dropzone-c1')).toHaveTextContent('claim one');
    expect(screen.getByTestId('aw-dropzone-__unsorted')).toHaveTextContent(
      'stray'
    );
  });

  it('TableLayout renders a droppable cell per row/column intersection', () => {
    render(
      <TableLayout
        session={makeSession({
          layout: 'table',
          tableRows: [{ id: 'r1', label: 'Before' }],
          tableCols: [
            { id: 'k1', label: 'Know' },
            { id: 'k2', label: 'Wonder' },
          ],
        })}
        mode="gallery"
        showNames={false}
        submissions={[
          makeSubmission({ id: 'a', content: 'in cell', cellKey: 'r1|k2' }),
        ]}
      />
    );
    expect(screen.getByTestId('aw-dropzone-r1|k1')).toBeEmptyDOMElement();
    expect(screen.getByTestId('aw-dropzone-r1|k2')).toHaveTextContent(
      'in cell'
    );
  });

  it('TableLayout keeps submissions whose cellKey matches no cell in an Unsorted row', () => {
    render(
      <TableLayout
        session={makeSession({
          layout: 'table',
          tableRows: [{ id: 'r1', label: 'Before' }],
          tableCols: [{ id: 'k1', label: 'Know' }],
        })}
        mode="gallery"
        showNames={false}
        submissions={[
          makeSubmission({ id: 'a', content: 'stale', cellKey: 'gone|k9' }),
          makeSubmission({ id: 'b', content: 'never placed' }),
        ]}
      />
    );
    const unsorted = screen.getByTestId(`aw-dropzone-${UNSORTED_ID}`);
    expect(unsorted).toHaveTextContent('stale');
    expect(unsorted).toHaveTextContent('never placed');
  });

  it('TimelineLayout orders by the order field and shows the label', () => {
    render(
      <TimelineLayout
        session={makeSession({ layout: 'timeline' })}
        mode="gallery"
        showNames={false}
        submissions={[
          makeSubmission({
            id: 'a',
            content: 'later',
            order: 20,
            label: 'Then',
          }),
          makeSubmission({
            id: 'b',
            content: 'earlier',
            order: 10,
            label: 'First',
          }),
        ]}
      />
    );
    const cards = screen
      .getByTestId('aw-layout-timeline')
      .querySelectorAll('article');
    expect(cards[0]).toHaveTextContent('earlier');
    expect(screen.getByText('First')).toBeInTheDocument();
  });

  it('WordCloudLayout weights repeated words and drops stop words', () => {
    render(
      <WordCloudLayout
        session={makeSession({ layout: 'wordcloud' })}
        mode="gallery"
        showNames={false}
        submissions={[
          makeSubmission({ id: 'a', type: 'word', content: 'curious the' }),
          makeSubmission({ id: 'b', type: 'word', content: 'curious' }),
          makeSubmission({ id: 'c', type: 'word', content: 'brave' }),
        ]}
      />
    );
    expect(screen.getByTitle('curious (2)')).toBeInTheDocument();
    expect(screen.getByTitle('brave (1)')).toBeInTheDocument();
    expect(screen.queryByText('the')).not.toBeInTheDocument();
    expect(screen.getByTitle('curious (2)')).toHaveStyle({
      fontSize: '15.00vmin',
    });
    expect(screen.getByTitle('brave (1)')).toHaveStyle({
      fontSize: '9.00vmin',
    });
  });

  it('WordCloudLayout clamps widget-mode font size instead of using bare vmin/cqmin', () => {
    render(
      <WordCloudLayout
        session={makeSession({ layout: 'wordcloud' })}
        mode="widget"
        showNames={false}
        submissions={[
          makeSubmission({ id: 'a', type: 'word', content: 'curious' }),
        ]}
      />
    );
    expect(screen.getByTitle('curious (1)')).toHaveStyle({
      fontSize: 'clamp(11px, 15.00cqmin, 96px)',
    });
  });

  it('drag handlers emit the placement patch each layout owns', () => {
    const dropOn = (activeId: string, overId: string) =>
      ({
        active: { id: activeId },
        over: { id: overId },
      }) as unknown as DragEndEvent;

    expect(columnsDropPatch(dropOn('a', 'c1'))).toEqual({ sectionId: 'c1' });
    expect(columnsDropPatch(dropOn('a', '__unsorted'))).toEqual({
      sectionId: null,
    });
    expect(tableDropPatch(dropOn('a', 'r1|k2'))).toEqual({
      cellKey: 'r1|k2',
    });
    expect(tableDropPatch(dropOn('a', UNSORTED_ID))).toEqual({
      cellKey: null,
    });

    const items = [
      makeSubmission({ id: 'a', order: 10 }),
      makeSubmission({ id: 'b', order: 20 }),
      makeSubmission({ id: 'c', order: 30 }),
    ];
    expect(timelineDropPatch(items, dropOn('a', 'c'))).toEqual({ order: 31 });
    expect(timelineDropPatch(items, dropOn('c', 'b'))).toEqual({ order: 15 });
    expect(timelineDropPatch(items, dropOn('a', 'a'))).toBeNull();
  });

  it('wraps columns into a responsive grid that scrolls vertically, never sideways', () => {
    const columns = makeSession({
      layout: 'columns',
      sections: [{ id: 'c1', label: 'Claims' }],
    });
    render(
      <ColumnsLayout
        session={columns}
        mode="widget"
        showNames={false}
        submissions={[makeSubmission({ id: 'a', content: 'claim one' })]}
        onMove={vi.fn()}
      />
    );
    const board = screen.getByTestId('aw-layout-columns');
    expect(board.className).toContain('overflow-y-auto');
    expect(board.className).toContain('overflow-x-hidden');
    expect(board.style.gridTemplateColumns).toContain('auto-fit');
    expect(screen.getByTestId('aw-dropzone-c1')).toBeInTheDocument();
  });

  it('offers drag handles in widget mode when onMove is supplied, never in gallery', () => {
    const columns = makeSession({
      layout: 'columns',
      sections: [{ id: 'c1', label: 'Claims' }],
    });
    const posts = [makeSubmission({ id: 'a', content: 'claim one' })];
    const { rerender } = render(
      <ColumnsLayout
        session={columns}
        mode="widget"
        showNames={false}
        submissions={posts}
        onMove={vi.fn()}
      />
    );
    expect(
      screen.getAllByRole('button', { name: 'Drag to move' }).length
    ).toBeGreaterThan(0);

    rerender(
      <ColumnsLayout
        session={columns}
        mode="widget"
        showNames={false}
        submissions={posts}
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Drag to move' })
    ).not.toBeInTheDocument();

    rerender(
      <ColumnsLayout
        session={columns}
        mode="gallery"
        showNames={false}
        submissions={posts}
        onMove={vi.fn()}
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Drag to move' })
    ).not.toBeInTheDocument();
  });

  it('LayoutRouter picks the layout named on the session and paints appearance', () => {
    const { rerender, container } = render(
      <LayoutRouter
        session={makeSession({ layout: 'timeline' })}
        mode="gallery"
        showNames={false}
        submissions={[makeSubmission()]}
      />
    );
    expect(screen.getByTestId('aw-layout-timeline')).toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="aw-layout-router"]')
    ).toHaveClass('bg-gradient-to-br');

    rerender(
      <LayoutRouter
        session={makeSession({ layout: 'columns', sections: [] })}
        mode="gallery"
        showNames={false}
        submissions={[makeSubmission()]}
        appearance={{ kind: 'color', value: 'bg-emerald-700' }}
      />
    );
    expect(screen.getByTestId('aw-layout-columns')).toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="aw-layout-router"]')
    ).toHaveClass('bg-emerald-700');
  });
});
