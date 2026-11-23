import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PaperPrintPreview } from './PaperPrintPreview';
import type { PaperPreviewPage } from '@/utils/paperSheetPrint';

const page = (doc: string): PaperPreviewPage => ({ kind: 'test', doc });

describe('PaperPrintPreview', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private cb: (e: unknown[]) => void) {}
        observe() {
          this.cb([{ contentRect: { width: 900, height: 1200 } }]);
        }
        disconnect() {
          this.cb = () => undefined;
        }
      }
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the other pages while a new picture loads', async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal('fetch', fetchMock);
    const first = page('<p>one</p>');
    const { rerender } = render(
      <PaperPrintPreview pages={[first]} emptyText="none" />
    );
    rerender(
      <PaperPrintPreview
        pages={[first, page('<img src="blob:x/1">')]}
        emptyText="none"
      />
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const frames = screen.getAllByTitle(/^Page /);
    expect(frames).toHaveLength(2);
    expect(frames[0].getAttribute('srcdoc')).toBe('<p>one</p>');
    expect(frames[1].getAttribute('srcdoc')).toBe('<img src="">');
  });

  it('keeps the same frames while the pages are null and loading', () => {
    const pages = [page('<p>one</p>'), page('<p>two</p>')];
    const { rerender } = render(
      <PaperPrintPreview pages={pages} emptyText="none" />
    );
    const frame = screen.getAllByTitle(/^Page /)[0];
    rerender(<PaperPrintPreview pages={null} loading emptyText="none" />);
    expect(screen.getAllByTitle(/^Page /)[0]).toBe(frame);
    rerender(
      <PaperPrintPreview
        pages={[pages[0], page('<p>three</p>')]}
        emptyText="none"
      />
    );
    const after = screen.getAllByTitle(/^Page /)[0];
    expect(after).toBe(frame);
    expect(after.getAttribute('srcdoc')).toBe('<p>one</p>');
  });
});
