import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RandomFlash } from './RandomFlash';

vi.mock('@/context/dashboardCanvasStore', () => ({
  useGlobalStyle: () => ({ fontFamily: 'sans' }),
}));

describe('RandomFlash', () => {
  it('keeps the widget container for a single word', () => {
    render(
      <RandomFlash
        displayResult="Harper"
        isSpinning={false}
        fontSize="20cqmin"
      />
    );
    const name = screen.getByText('Harper');
    expect(name.parentElement?.style.containerType).toBe('');
    expect(name.style.fontSize).toBe('min(300px, 20cqmin)');
  });

  it('keeps the widget container for the placeholder', () => {
    render(
      <RandomFlash displayResult={null} isSpinning={false} fontSize="20cqmin" />
    );
    expect(screen.getByText('Ready?').parentElement?.style.containerType).toBe(
      ''
    );
  });

  it('fits a multi-word name to its own box by line count', () => {
    render(
      <RandomFlash
        displayResult="Harper Okafor"
        isSpinning={false}
        fontSize="20cqmin"
      />
    );
    const name = screen.getByText('Harper Okafor');
    expect(name.parentElement?.style.containerType).toBe('size');
    expect(name.style.fontSize).toContain('37cqh');
  });

  it('uses the roster-wide size while spinning', () => {
    render(
      <RandomFlash
        displayResult="Harper Okafor"
        isSpinning
        fontSize="20cqmin"
      />
    );
    const name = screen.getByText('Harper Okafor');
    expect(name.parentElement?.style.containerType).toBe('');
    expect(name.style.fontSize).toBe('min(300px, 20cqmin)');
  });
});
