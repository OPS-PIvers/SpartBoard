import { render, screen, fireEvent } from '@testing-library/react';
import { SeatingChartWidget } from './Widget';
import {
  generateColumnsLayout,
  generateHorseshoeLayout,
  generatePodsLayout,
} from './seatingChartLayouts';
import { useDashboard } from '@/context/useDashboard';
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';
import { WidgetData, SeatingChartConfig, FurnitureItem } from '@/types';
import { DashboardContextValue } from '@/context/DashboardContextValue';

vi.mock('@/context/useDashboard');

const mockUpdateWidget = vi.fn();

const mockDashboardContext: Partial<DashboardContextValue> = {
  updateWidget: mockUpdateWidget,
  rosters: [],
  activeRosterId: null,
  addToast: vi.fn(),
  zoom: 1,
};

describe('SeatingChartWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDashboard).mockReturnValue(
      mockDashboardContext as DashboardContextValue
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createWidget = (): WidgetData => ({
    id: 'test-widget-id',
    type: 'seating-chart',
    config: {
      furniture: [
        {
          id: 'desk-1',
          type: 'desk',
          x: 100,
          y: 100,
          width: 60,
          height: 50,
          rotation: 0,
        } as FurnitureItem,
      ],
      assignments: {},
      gridSize: 20,
      rosterMode: 'class',
    } as SeatingChartConfig,
    x: 0,
    y: 0,
    w: 800,
    h: 600,
    z: 1,
    flipped: false,
  });

  it('should only call updateWidget on pointerUp, not on pointerMove', () => {
    const widget = createWidget();
    const { container } = render(<SeatingChartWidget widget={widget} />);

    // 1. Switch to Setup mode
    const setupButton = screen.getByText('Setup');
    fireEvent.click(setupButton);

    // 2. Find the furniture item
    const furnitureItem = container.querySelector(
      'div[style*="left: 100px"][style*="top: 100px"]'
    );
    expect(furnitureItem).toBeTruthy();

    if (!furnitureItem) throw new Error('Furniture item not found');

    // 3. Start dragging (PointerDown)
    fireEvent.pointerDown(furnitureItem, {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
      bubbles: true,
    });

    // 4. Move (PointerMove)
    fireEvent(
      window,
      new PointerEvent('pointermove', {
        clientX: 120,
        clientY: 120,
        bubbles: true,
      })
    );

    // EXPECTATION: updateWidget should NOT be called yet (optimization)
    expect(mockUpdateWidget).not.toHaveBeenCalled();

    // 5. Stop dragging (PointerUp)
    fireEvent(
      window,
      new PointerEvent('pointerup', {
        bubbles: true,
      })
    );

    // 6. Now it SHOULD be called
    expect(mockUpdateWidget).toHaveBeenCalledTimes(1);

    // Check arguments
    const lastCall = (mockUpdateWidget as Mock).mock.lastCall as [
      string,
      { config: SeatingChartConfig },
    ];
    expect(lastCall).toBeDefined();

    const [id, updates] = lastCall;
    expect(id).toBe('test-widget-id');

    const newFurniture = updates.config.furniture[0];
    expect(newFurniture.x).toBe(120);
    expect(newFurniture.y).toBe(120);
  });

  it('should select an item on click and not deselect it immediately', () => {
    const widget = createWidget();
    const { container } = render(<SeatingChartWidget widget={widget} />);

    // 1. Switch to Setup mode
    const setupButton = screen.getByText('Setup');
    fireEvent.click(setupButton);

    // 2. Find the furniture item
    const furnitureItem = container.querySelector(
      'div[style*="left: 100px"][style*="top: 100px"]'
    );
    expect(furnitureItem).toBeTruthy();
    if (!furnitureItem) throw new Error('Furniture item not found');

    // 3. Click the item (PointerDown + PointerUp + Click)
    fireEvent.pointerDown(furnitureItem);
    fireEvent.pointerUp(window);
    fireEvent.click(furnitureItem);

    // 4. Verify selection (the item should have a ring class or the floating menu should be visible)
    expect(furnitureItem.className).toContain('ring-2');
    expect(screen.getByTitle('Rotate Left')).toBeTruthy();
  });

  it('should deselect an item when clicking the canvas', () => {
    const widget = createWidget();
    const { container } = render(<SeatingChartWidget widget={widget} />);

    // 1. Switch to Setup mode
    fireEvent.click(screen.getByText('Setup'));

    // 2. Find the furniture item and canvas
    const furnitureItem = container.querySelector('div[style*="left: 100px"]');
    const canvas = container.querySelector('.flex-1.relative.bg-white');

    if (!furnitureItem || !canvas) throw new Error('Elements not found');

    // 3. Select the item
    fireEvent.pointerDown(furnitureItem);
    fireEvent.pointerUp(window);
    fireEvent.click(furnitureItem);
    expect(furnitureItem.className).toContain('ring-2');

    // 4. Click the canvas
    fireEvent.click(canvas);

    // 5. Verify deselection
    expect(furnitureItem.className).not.toContain('ring-2');
    expect(screen.queryByTitle('Rotate Left')).toBeNull();
  });

  it('should rotate an item by given delta', async () => {
    const widget = createWidget();
    const { container } = render(<SeatingChartWidget widget={widget} />);

    // Switch to Setup mode
    fireEvent.click(screen.getByText('Setup'));

    // Find items
    const desk1 = container.querySelector('div[style*="left: 100px"]');
    if (!desk1) throw new Error('Desks not found');

    // 1. Select item normally
    fireEvent.pointerDown(desk1, {
      bubbles: true,
      clientX: 100,
      clientY: 100,
      button: 0,
    });
    fireEvent.pointerUp(window);
    fireEvent.click(desk1);

    // 2. Give component time to update state and find rotate button
    const rotateLeftBtn = await screen.findByTitle('Rotate Left');

    // Clear mock before actual action to ignore selection state updates
    mockUpdateWidget.mockClear();

    // 3. Click rotate left (-45)
    fireEvent.click(rotateLeftBtn);

    expect(mockUpdateWidget).toHaveBeenCalledTimes(1);
    const lastCall = (mockUpdateWidget as Mock).mock.lastCall as [
      string,
      { config: SeatingChartConfig },
    ];
    const updates = lastCall[1].config.furniture;

    // The rotated item should be 315 (-45 = 315)
    expect(updates[0].rotation).toBe(315);
  });

  it('should delete a selected item', async () => {
    const widget = createWidget();
    const { container } = render(<SeatingChartWidget widget={widget} />);

    fireEvent.click(screen.getByText('Setup'));

    const desk1 = container.querySelector('div[style*="left: 100px"]');
    if (!desk1) throw new Error('Desk not found');

    // Select the item
    fireEvent.pointerDown(desk1, {
      clientX: 100,
      clientY: 100,
      button: 0,
      bubbles: true,
    });
    fireEvent.pointerUp(window);
    fireEvent.click(desk1);

    const deleteBtn = await screen.findByTitle('Delete');

    // Clear mock before actual action to ignore selection state updates
    mockUpdateWidget.mockClear();

    fireEvent.click(deleteBtn);

    expect(mockUpdateWidget).toHaveBeenCalledTimes(1);
    const lastCall = (mockUpdateWidget as Mock).mock.lastCall as [
      string,
      { config: SeatingChartConfig },
    ];
    const updates = lastCall[1].config.furniture;

    // Furniture array should be empty
    expect(updates.length).toBe(0);
  });

  it('should apply templates to generate new layouts', () => {
    // Need custom roster for students
    const widget = createWidget();
    widget.config = {
      ...widget.config,
      rosterMode: 'custom',
      names: 'Student 1\nStudent 2\nStudent 3\nStudent 4',
      template: 'rows',
      templateColumns: 2,
    } as SeatingChartConfig;

    render(<SeatingChartWidget widget={widget} />);

    fireEvent.click(screen.getByText('Setup'));

    // Apply template
    const applyBtn = screen.getByRole('button', { name: 'Apply Layout' });
    fireEvent.click(applyBtn);

    expect(mockUpdateWidget).toHaveBeenCalledTimes(1);
    const lastCall = (mockUpdateWidget as Mock).mock.lastCall as [
      string,
      { config: SeatingChartConfig },
    ];
    const updates = lastCall[1].config.furniture;

    // 4 students should generate 4 desks
    expect(updates.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Pure layout generator tests — no React rendering needed
// ---------------------------------------------------------------------------

const CANVAS_W = 400;
const CANVAS_H = 400;
const GRID = 20;

const allSnapped = (items: { x: number; y: number }[]) =>
  items.every((i) => i.x % GRID === 0 && i.y % GRID === 0);

const allUniqueIds = (items: { id: string }[]) =>
  new Set(items.map((i) => i.id)).size === items.length;

const allDesks = (items: { type: string }[]) =>
  items.every((i) => i.type === 'desk');

describe('generateColumnsLayout', () => {
  it('returns empty array for 0 students', () => {
    expect(generateColumnsLayout(0, 6, CANVAS_W, CANVAS_H, GRID)).toEqual([]);
  });

  it('returns correct desk count for 30 students in 6 columns', () => {
    expect(generateColumnsLayout(30, 6, CANVAS_W, CANVAS_H, GRID)).toHaveLength(
      30
    );
  });

  it('does not exceed student count when columns × desksPerColumn > students', () => {
    // 5 students, 3 columns → desksPerColumn=2 → 6 slots but only 5 filled
    expect(generateColumnsLayout(5, 3, CANVAS_W, CANVAS_H, GRID)).toHaveLength(
      5
    );
  });

  it('handles a single student', () => {
    expect(generateColumnsLayout(1, 1, CANVAS_W, CANVAS_H, GRID)).toHaveLength(
      1
    );
  });

  it('snaps all positions to the grid', () => {
    expect(
      allSnapped(generateColumnsLayout(15, 3, CANVAS_W, CANVAS_H, GRID))
    ).toBe(true);
  });

  it('all items are desks', () => {
    expect(
      allDesks(generateColumnsLayout(10, 2, CANVAS_W, CANVAS_H, GRID))
    ).toBe(true);
  });

  it('all items have unique IDs', () => {
    expect(
      allUniqueIds(generateColumnsLayout(12, 3, CANVAS_W, CANVAS_H, GRID))
    ).toBe(true);
  });
});

describe('generateHorseshoeLayout', () => {
  // The horseshoe generates a fixed 23-desk layout regardless of roster size:
  // outer U = 4 left + 6 bottom + 4 right (14), inner U = 3 left + 3 bottom + 3 right (9).
  const FIXED_DESK_COUNT = 23;

  it('always returns 23 desks regardless of student count', () => {
    expect(generateHorseshoeLayout(0, CANVAS_W, CANVAS_H, GRID)).toHaveLength(
      FIXED_DESK_COUNT
    );
    expect(generateHorseshoeLayout(30, CANVAS_W, CANVAS_H, GRID)).toHaveLength(
      FIXED_DESK_COUNT
    );
    expect(generateHorseshoeLayout(2, CANVAS_W, CANVAS_H, GRID)).toHaveLength(
      FIXED_DESK_COUNT
    );
  });

  it('side arm desks are rotated inward (90° or 270°), bottom rows are 0°', () => {
    const items = generateHorseshoeLayout(0, CANVAS_W, CANVAS_H, GRID);
    // All rotations should be 0, 90, or 270 only
    expect(items.every((i) => [0, 90, 270].includes(i.rotation))).toBe(true);
    // Some desks must be rotated (the arm desks)
    expect(items.some((i) => i.rotation !== 0)).toBe(true);
  });

  it('snaps all positions to the grid', () => {
    expect(
      allSnapped(generateHorseshoeLayout(20, CANVAS_W, CANVAS_H, GRID))
    ).toBe(true);
  });

  it('all items are desks', () => {
    expect(
      allDesks(generateHorseshoeLayout(15, CANVAS_W, CANVAS_H, GRID))
    ).toBe(true);
  });

  it('all items have unique IDs', () => {
    expect(
      allUniqueIds(generateHorseshoeLayout(10, CANVAS_W, CANVAS_H, GRID))
    ).toBe(true);
  });
});

describe('generatePodsLayout', () => {
  it('returns empty array for 0 students', () => {
    expect(generatePodsLayout(0, CANVAS_W, CANVAS_H, GRID)).toEqual([]);
  });

  it('returns correct desk count for 30 students (7 pods of 4 + 1 pod of 2)', () => {
    expect(generatePodsLayout(30, CANVAS_W, CANVAS_H, GRID)).toHaveLength(30);
  });

  it('returns correct desk count for an exact multiple of 4', () => {
    expect(generatePodsLayout(8, CANVAS_W, CANVAS_H, GRID)).toHaveLength(8);
  });

  it('handles a single student', () => {
    expect(generatePodsLayout(1, CANVAS_W, CANVAS_H, GRID)).toHaveLength(1);
  });

  it('snaps all positions to the grid', () => {
    expect(allSnapped(generatePodsLayout(12, CANVAS_W, CANVAS_H, GRID))).toBe(
      true
    );
  });

  it('all items are desks', () => {
    expect(allDesks(generatePodsLayout(9, CANVAS_W, CANVAS_H, GRID))).toBe(
      true
    );
  });

  it('all items have unique IDs', () => {
    expect(allUniqueIds(generatePodsLayout(16, CANVAS_W, CANVAS_H, GRID))).toBe(
      true
    );
  });
});
