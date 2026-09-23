import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { LaunchedBySubTag } from './LaunchedBySubTag';

const STAMP = {
  uid: 'sub-1',
  email: 'sub@orono.k12.mn.us',
  shareId: 'share-1',
};
// 2026-09-23T14:00:00Z, read in the runner's own zone like a teacher's browser.
const AT = Date.UTC(2026, 8, 23, 14, 0, 0);

describe('LaunchedBySubTag', () => {
  // Every run a teacher started themselves has no stamp, so the default has to
  // be invisible rather than an empty row.
  it('renders nothing on the teacher’s own run', () => {
    const { container } = render(<LaunchedBySubTag launchedBy={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows who started it', () => {
    render(<LaunchedBySubTag launchedBy={STAMP} at={AT} />);
    expect(screen.getByTestId('launched-by-sub')).toHaveTextContent(
      /Launched by sub@orono\.k12\.mn\.us/
    );
  });

  // slate-600 on a slate-800 results panel falls below the AA minimum.
  it('lightens the text on a dark surface', () => {
    render(<LaunchedBySubTag launchedBy={STAMP} at={AT} onDark />);
    expect(screen.getByTestId('launched-by-sub')).toHaveClass('text-slate-300');
  });
});
