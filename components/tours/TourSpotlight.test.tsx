import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TourSpotlight } from './TourSpotlight';

const setViewport = (w: number, h: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: h,
  });
};

const dimPath = (): SVGPathElement => {
  const path = screen.getByTestId('tour-spotlight').querySelector('path');
  if (!path) throw new Error('no dim path');
  return path;
};

afterEach(() => {
  setViewport(1024, 768);
  delete (document as Partial<Document>).elementsFromPoint;
  document.body.innerHTML = '';
});

describe('TourSpotlight', () => {
  it('re-renders to cover the viewport after a window resize', () => {
    setViewport(1024, 768);
    render(<TourSpotlight rect={{ x: 10, y: 10, width: 50, height: 20 }} />);
    expect(screen.getByTestId('tour-spotlight').getAttribute('width')).toBe(
      '1024'
    );
    act(() => {
      setViewport(640, 480);
      window.dispatchEvent(new Event('resize'));
    });
    const svg = screen.getByTestId('tour-spotlight');
    expect(svg.getAttribute('width')).toBe('640');
    expect(svg.getAttribute('height')).toBe('480');
    expect(dimPath().getAttribute('d')).toMatch(/^M0,0 H640 V480 H0 Z/);
  });

  it('passes a wheel over the dim through to the scroller underneath', () => {
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    Object.defineProperty(scroller, 'scrollHeight', { value: 1000 });
    Object.defineProperty(scroller, 'clientHeight', { value: 200 });
    const scrollBy = vi.fn();
    scroller.scrollBy = scrollBy;
    const target = document.createElement('p');
    scroller.appendChild(target);
    document.body.appendChild(scroller);
    const seen = vi.fn<(deltaY: number) => void>();
    target.addEventListener('wheel', (e) => {
      seen(e.deltaY);
    });

    render(<TourSpotlight rect={null} />);
    document.elementsFromPoint = vi.fn((): Element[] => [dimPath(), target]);
    fireEvent.wheel(dimPath(), { deltaY: 120, clientX: 5, clientY: 5 });

    expect(seen).toHaveBeenCalledWith(120);
    expect(scrollBy).toHaveBeenCalledWith({ left: 0, top: 120 });
  });

  it('leaves the scroll to an app handler that takes the wheel', () => {
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    Object.defineProperty(scroller, 'scrollHeight', { value: 1000 });
    Object.defineProperty(scroller, 'clientHeight', { value: 200 });
    const scrollBy = vi.fn();
    scroller.scrollBy = scrollBy;
    const board = document.createElement('div');
    board.addEventListener('wheel', (e) => e.preventDefault());
    scroller.appendChild(board);
    document.body.appendChild(scroller);

    render(<TourSpotlight rect={null} />);
    document.elementsFromPoint = vi.fn((): Element[] => [dimPath(), board]);
    fireEvent.wheel(dimPath(), { deltaY: 50 });

    expect(scrollBy).not.toHaveBeenCalled();
  });
});
