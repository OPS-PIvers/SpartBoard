import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WallLayout } from './WallLayout';
import { ColumnsLayout } from './ColumnsLayout';
import { TableLayout } from './TableLayout';
import { TimelineLayout } from './TimelineLayout';
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
