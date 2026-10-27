import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));
vi.mock('@/context/useToolVisibility', () => ({
  useToolVisibility: () => ({
    resetDockToDefaults: vi.fn(),
    hiddenTools: [],
    toggleToolHidden: vi.fn(),
  }),
}));

import { WidgetLibrary } from '@/components/layout/dock/WidgetLibrary';
import { DEFAULT_GLOBAL_STYLE, type DockPosition } from '@/types';

function renderLibrary(props: {
  large?: boolean;
  dockPosition?: DockPosition;
  triggerRef?: React.RefObject<HTMLElement | null>;
}) {
  render(
    <WidgetLibrary
      onToggle={vi.fn()}
      visibleTools={[]}
      canAccess={() => true}
      onClose={vi.fn()}
      globalStyle={DEFAULT_GLOBAL_STYLE}
      libraryOrder={[]}
      onReorderLibrary={vi.fn()}
      {...props}
    />
  );
  const root = document.querySelector<HTMLElement>(
    '[data-tour="library.root"]'
  );
  if (!root?.parentElement) throw new Error('library not rendered');
  return { root, overlay: root.parentElement };
}

afterEach(cleanup);

describe('WidgetLibrary size', () => {
  it('keeps the small fixed box when the flag is off', () => {
    const { root, overlay } = renderLibrary({});
    expect(root.className).toContain('max-w-2xl');
    expect(overlay.className).not.toMatch(/\bp[blr]-3[26]\b/);
  });

  it.each([
    ['bottom', 'pb-32'],
    ['left', 'pl-36'],
    ['right', 'pr-36'],
  ] as const)(
    'fills the screen and leaves a %s dock uncovered',
    (dockPosition, clearance) => {
      const { root, overlay } = renderLibrary({ large: true, dockPosition });
      expect(root.className).toContain('max-w-7xl');
      expect(root.className).not.toContain('max-w-2xl');
      expect(overlay.className.split(/\s+/)).toContain(clearance);
    }
  );

  it('clears the dock by its measured size when a label makes it wide', () => {
    const dock = document.createElement('div');
    dock.getBoundingClientRect = () =>
      ({ left: 24, right: 230, top: 100, bottom: 600 }) as DOMRect;
    document.body.appendChild(dock);
    const { overlay } = renderLibrary({
      large: true,
      dockPosition: 'left',
      triggerRef: { current: dock },
    });
    expect(overlay.style.paddingLeft).toBe('246px');
    dock.remove();
  });
});
