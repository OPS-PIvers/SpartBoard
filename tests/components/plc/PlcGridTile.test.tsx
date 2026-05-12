/**
 * Focused unit tests for `PlcGridTile`'s Phase 5 keyboard-resize handler.
 *
 * The keyboard resize is wired directly on the grip button's onKeyDown so
 * Shift+Arrow keys grow/shrink the tile by one cell along an axis. Plain
 * Arrow keys (without Shift) are passed through to @dnd-kit's
 * KeyboardSensor handler — we assert those do NOT invoke `onResizeCommit`.
 *
 * The component depends on `useSortable` (from @dnd-kit), which requires
 * being rendered inside a `DndContext` + `SortableContext`. We provide a
 * minimal wrapper so the test does not have to mock dnd-kit internals.
 */

import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18n from 'i18next';

import { PlcGridTile } from '@/components/plc/grid/PlcGridTile';
import type { PlcBentoTile, PlcGridCoords } from '@/types';

beforeAll(async () => {
  // i18next is consumed by `useTranslation()` inside the tile; provide a
  // minimal init so `t(key, { defaultValue })` returns the default value
  // without warnings.
  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      resources: { en: { translation: {} } },
      interpolation: { escapeValue: false },
    });
  }
});

const tile: PlcBentoTile = {
  kind: 'notes',
  size: 'sm',
  hidden: false,
};

const baseCoords: PlcGridCoords = { x: 2, y: 1, w: 4, h: 3 };

function renderTile(opts: {
  coords?: PlcGridCoords;
  onResizeCommit?: (kind: PlcBentoTile['kind'], next: PlcGridCoords) => void;
}) {
  const onResizeCommit = opts.onResizeCommit ?? vi.fn();
  const coords = opts.coords ?? baseCoords;
  return {
    onResizeCommit,
    ...render(
      <I18nextProvider i18n={i18n}>
        <DndContext>
          <SortableContext items={[tile.kind]}>
            <PlcGridTile
              tile={tile}
              coords={coords}
              editMode
              showResizeHandles
              getCellMetrics={() => ({ cellW: 100, cellH: 88 })}
              onResizeCommit={onResizeCommit}
            >
              <div data-testid="tile-body" />
            </PlcGridTile>
          </SortableContext>
        </DndContext>
      </I18nextProvider>
    ),
  };
}

function grip(): HTMLElement {
  // The grip button advertises its keyboard contract through aria-label.
  // Match the leading phrase so this test stays stable if the translation
  // tail gets tweaked.
  return screen.getByRole('button', { name: /Drag to reorder/i });
}

describe('PlcGridTile keyboard resize', () => {
  it('grows width on Shift+ArrowRight (clamped to grid columns)', () => {
    const { onResizeCommit } = renderTile({});
    fireEvent.keyDown(grip(), { key: 'ArrowRight', shiftKey: true });
    expect(onResizeCommit).toHaveBeenCalledWith('notes', {
      x: 2,
      y: 1,
      w: 5,
      h: 3,
    });
  });

  it('shrinks width on Shift+ArrowLeft (clamped at GRID_MIN_W)', () => {
    const { onResizeCommit } = renderTile({});
    fireEvent.keyDown(grip(), { key: 'ArrowLeft', shiftKey: true });
    expect(onResizeCommit).toHaveBeenCalledWith('notes', {
      x: 2,
      y: 1,
      w: 3,
      h: 3,
    });
  });

  it('grows height on Shift+ArrowDown', () => {
    const { onResizeCommit } = renderTile({});
    fireEvent.keyDown(grip(), { key: 'ArrowDown', shiftKey: true });
    expect(onResizeCommit).toHaveBeenCalledWith('notes', {
      x: 2,
      y: 1,
      w: 4,
      h: 4,
    });
  });

  it('shrinks height on Shift+ArrowUp', () => {
    const { onResizeCommit } = renderTile({});
    fireEvent.keyDown(grip(), { key: 'ArrowUp', shiftKey: true });
    expect(onResizeCommit).toHaveBeenCalledWith('notes', {
      x: 2,
      y: 1,
      w: 4,
      h: 2,
    });
  });

  it('does not commit when growing past GRID_COLS would clamp to current w', () => {
    // x=8, w=4 → already at 12. Shift+Right is a no-op (clamped maxW=4).
    const { onResizeCommit } = renderTile({
      coords: { x: 8, y: 0, w: 4, h: 2 },
    });
    fireEvent.keyDown(grip(), { key: 'ArrowRight', shiftKey: true });
    expect(onResizeCommit).not.toHaveBeenCalled();
  });

  it('does not commit when shrinking below GRID_MIN_W (= 2)', () => {
    const { onResizeCommit } = renderTile({
      coords: { x: 0, y: 0, w: 2, h: 2 },
    });
    fireEvent.keyDown(grip(), { key: 'ArrowLeft', shiftKey: true });
    expect(onResizeCommit).not.toHaveBeenCalled();
  });

  it('ignores plain Arrow keys without Shift (reorder is handled by dnd-kit)', () => {
    const { onResizeCommit } = renderTile({});
    fireEvent.keyDown(grip(), { key: 'ArrowRight' });
    fireEvent.keyDown(grip(), { key: 'ArrowLeft' });
    fireEvent.keyDown(grip(), { key: 'ArrowDown' });
    fireEvent.keyDown(grip(), { key: 'ArrowUp' });
    expect(onResizeCommit).not.toHaveBeenCalled();
  });

  it('ignores non-arrow keys even with Shift', () => {
    const { onResizeCommit } = renderTile({});
    fireEvent.keyDown(grip(), { key: 'a', shiftKey: true });
    fireEvent.keyDown(grip(), { key: 'Enter', shiftKey: true });
    expect(onResizeCommit).not.toHaveBeenCalled();
  });
});
