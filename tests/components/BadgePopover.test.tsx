import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BadgePopover } from '@/components/common/BadgePopover';

const PANEL_HEIGHT = 600;

const rect = (top: number, height: number): DOMRect => ({
  top,
  bottom: top + height,
  left: 400,
  right: 440,
  width: 40,
  height,
  x: 400,
  y: top,
  toJSON: () => ({}),
});

const openAt = (badgeTop: number) => {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(
    PANEL_HEIGHT
  );
  render(
    <BadgePopover triggerLabel="Open" dialogLabel="Signs" panel={<p>Long</p>}>
      <span>9</span>
    </BadgePopover>
  );
  const trigger = screen.getByRole('button', { name: 'Open' });
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(
    rect(badgeTop, 20)
  );
  fireEvent.click(trigger);
  return screen.getByRole('dialog', { name: 'Signs' });
};

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('BadgePopover', () => {
  it('opens below the badge when the panel fits there', () => {
    window.innerHeight = 2000;
    const panel = openAt(100);
    expect(panel.style.top).toBe('124px');
    expect(panel.style.bottom).toBe('');
  });

  it('flips above a low badge and caps its height to the room above', () => {
    window.innerHeight = 900;
    const panel = openAt(700);
    expect(panel.style.top).toBe('');
    expect(panel.style.bottom).toBe('204px');
    expect(panel.style.maxHeight).toBe('688px');
  });

  it('stays below and scrolls inside when below has more room', () => {
    window.innerHeight = 900;
    const panel = openAt(200);
    expect(panel.style.top).toBe('224px');
    expect(panel.style.maxHeight).toBe('668px');
    expect(panel.className).toContain('overflow-y-auto');
  });

  it('keeps the panel open while it scrolls, and closes when the page scrolls', () => {
    window.innerHeight = 900;
    const panel = openAt(700);
    fireEvent.scroll(panel);
    expect(screen.getByRole('dialog', { name: 'Signs' })).toBeTruthy();
    fireEvent.scroll(document);
    expect(screen.queryByRole('dialog', { name: 'Signs' })).toBeNull();
  });
});
