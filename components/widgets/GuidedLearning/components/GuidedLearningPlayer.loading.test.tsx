import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import {
  mockStageLayout,
  type StageLayoutHandle,
} from '@/tests/utils/mockStageLayout';
import { GuidedLearningPlayer } from './GuidedLearningPlayer';
import { preloadWindow } from '../utils/preloadWindow';

let handle: StageLayoutHandle | null = null;
afterEach(() => {
  cleanup();
  handle?.restore();
  handle = null;
  window.localStorage.clear();
});

const url = (i: number) => `https://example.com/slide-${i}.png`;

const makeSet = (slides: number): GuidedLearningSet => ({
  id: 'set',
  schemaVersion: 3,
  title: 'Slides',
  imageUrls: Array.from({ length: slides }, (_, i) => url(i)),
  steps: Array.from(
    { length: slides },
    (_, i): GuidedLearningStep => ({
      id: `s${i}`,
      xPct: 50,
      yPct: 50,
      imageIndex: i,
      interactionType: 'tooltip',
      text: `Step ${i}`,
    })
  ),
  mode: 'structured',
  createdAt: 0,
  updatedAt: 0,
});

const layout = () => {
  handle = mockStageLayout({
    container: { w: 800, h: 600 },
    image: { w: 1600, h: 900 },
  });
};

function renderPlayer(set: GuidedLearningSet, playerV2 = true) {
  layout();
  const view = render(
    <GuidedLearningPlayer set={set} teacherMode playerV2={playerV2} />
  );
  act(() => handle?.fireResize());
  return view;
}

const slideImg = () =>
  document.querySelector('[data-gl-stage] img') as HTMLImageElement;

describe('P8-7 slide loading', () => {
  it('shows a shimmer until the slide loads', () => {
    renderPlayer(makeSet(2));
    const shimmer = screen.getByTestId('gl-slide-loading');
    expect(shimmer).toHaveAttribute('role', 'status');
    expect(shimmer).toHaveTextContent('Loading slide…');
    fireEvent.load(slideImg());
    expect(screen.queryByTestId('gl-slide-loading')).toBeNull();
  });

  it('shows the shimmer again for a new slide', () => {
    renderPlayer(makeSet(2));
    fireEvent.load(slideImg());
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    expect(screen.getByTestId('gl-slide-loading')).toBeInTheDocument();
    fireEvent.load(slideImg());
    expect(screen.queryByTestId('gl-slide-loading')).toBeNull();
  });

  it('shows Couldn’t load this slide with Retry, which reloads the image', () => {
    renderPlayer(makeSet(2));
    const first = slideImg();
    fireEvent.error(first);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load this slide");
    expect(screen.queryByTestId('gl-slide-loading')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(screen.queryByTestId('gl-slide-error')).toBeNull();
    expect(screen.getByTestId('gl-slide-loading')).toBeInTheDocument();
    const second = slideImg();
    expect(second).not.toBe(first);
    expect(second.getAttribute('src')).toBe(url(0));
    fireEvent.load(second);
    expect(screen.queryByTestId('gl-slide-loading')).toBeNull();
    expect(screen.queryByTestId('gl-slide-error')).toBeNull();
  });

  it('keeps v1 without a shimmer or error state', () => {
    renderPlayer(makeSet(2), false);
    expect(screen.queryByTestId('gl-slide-loading')).toBeNull();
    fireEvent.error(slideImg());
    expect(screen.queryByTestId('gl-slide-error')).toBeNull();
  });
});

describe('P8-7 preload window', () => {
  function stubImage() {
    const fetched: string[] = [];
    const decoded: string[] = [];
    class ImageMock {
      private url = '';
      set src(v: string) {
        this.url = v;
        fetched.push(v);
      }
      get src() {
        return this.url;
      }
      decode() {
        decoded.push(this.url);
        return Promise.resolve();
      }
    }
    return { fetched, decoded, ImageMock };
  }

  it('fetches only the current slide ±2 and decodes only the next', () => {
    const { fetched, decoded, ImageMock } = stubImage();
    layout();
    vi.stubGlobal('Image', ImageMock);
    render(<GuidedLearningPlayer set={makeSet(8)} teacherMode playerV2 />);
    expect([...fetched].sort()).toEqual([url(1), url(2)]);
    expect(decoded).toEqual([url(1)]);

    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    expect([...fetched].sort()).toEqual([url(1), url(2), url(3)]);
    expect(decoded).toEqual([url(1), url(2)]);

    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    expect(fetched).not.toContain(url(5));
    expect(fetched).toContain(url(4));
    expect(decoded).toEqual([url(1), url(2), url(3)]);
  });

  it('keeps v1 preloading every image slide', () => {
    const { fetched, ImageMock } = stubImage();
    layout();
    vi.stubGlobal('Image', ImageMock);
    render(<GuidedLearningPlayer set={makeSet(8)} teacherMode />);
    expect(fetched).toHaveLength(8);
  });

  it('skips video slides in the window', () => {
    expect(preloadWindow(3, 10, (i) => i === 4)).toEqual({
      fetch: [1, 2, 5],
      decode: null,
    });
    expect(preloadWindow(0, 2, () => false)).toEqual({
      fetch: [1],
      decode: 1,
    });
    expect(preloadWindow(1, 2, () => false)).toEqual({
      fetch: [0],
      decode: null,
    });
  });
});
