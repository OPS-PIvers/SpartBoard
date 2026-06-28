import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { flushSync } from 'react-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphicOrganizerWidget, EditableNode } from './Widget';
import {
  useDashboardActions,
  useGlobalStyle,
  useIsActiveBoardReadOnly,
  type DashboardActions,
} from '@/context/dashboardCanvasStore';
import { useAuth } from '@/context/useAuth';
import {
  WidgetData,
  GraphicOrganizerConfig,
  DEFAULT_GLOBAL_STYLE,
} from '@/types';

// Mock the canvas store surfaces the widget now consumes
vi.mock('@/context/dashboardCanvasStore');

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

// Mock the WidgetLayout
vi.mock('@/components/widgets/WidgetLayout', () => ({
  WidgetLayout: ({ content }: { content: React.ReactNode }) => (
    <div data-testid="widget-layout">{content}</div>
  ),
}));

describe('GraphicOrganizerWidget', () => {
  const mockUpdateWidget = vi.fn();

  beforeEach(() => {
    vi.mocked(useDashboardActions).mockReturnValue({
      updateWidget: mockUpdateWidget,
    } as unknown as DashboardActions);
    vi.mocked(useGlobalStyle).mockReturnValue(DEFAULT_GLOBAL_STYLE);
    vi.mocked(useIsActiveBoardReadOnly).mockReturnValue(false);
    vi.mocked(useAuth).mockReturnValue({
      user: { buildingId: 'test-building' } as unknown,
      selectedBuildings: ['test-building'],
      featurePermissions: [],
    } as unknown as ReturnType<typeof useAuth>);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  const createWidgetData = (
    templateType: GraphicOrganizerConfig['templateType'],
    nodes = {}
  ): WidgetData => ({
    id: 'test-widget-1',
    type: 'graphic-organizer',
    x: 0,
    y: 0,
    w: 8,
    h: 6,
    z: 1,
    flipped: false,
    config: {
      templateType,
      nodes,
    } as GraphicOrganizerConfig,
  });

  it('renders Frayer model by default and allows editing', () => {
    const widgetData = createWidgetData('frayer');
    render(<GraphicOrganizerWidget widget={widgetData} />);

    // Frayer model has 5 nodes (4 quadrants + center)
    expect(screen.getByText('Definition')).toBeInTheDocument();
    expect(screen.getByText('Characteristics')).toBeInTheDocument();
    expect(screen.getByText('Examples')).toBeInTheDocument();
    expect(screen.getByText('Non-Examples')).toBeInTheDocument();

    // The nodes are rendered without roles initially, just as divs
    // Let's find them by their placeholder attributes
    const editableNodes = document.querySelectorAll('[contenteditable="true"]');
    expect(editableNodes).toHaveLength(5);

    // Edit the first node
    const firstNode = Array.from(editableNodes)[0] as HTMLElement;

    // Simulate an input event
    fireEvent.input(firstNode, { target: { innerText: 'New Definition' } });

    // Fast-forward debounce timer
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'test-widget-1',
      expect.objectContaining({
        config: expect.objectContaining({
          nodes: expect.objectContaining({
            'top-left': { id: 'top-left', text: 'New Definition' },
          } as Record<string, unknown>),
        } as Record<string, unknown>),
      } as Record<string, unknown>)
    );
  });

  it('renders T-Chart correctly', () => {
    const widgetData = createWidgetData('t-chart');
    render(<GraphicOrganizerWidget widget={widgetData} />);

    // T-Chart has 4 nodes (2 headers, 2 content areas)
    const editableNodes = document.querySelectorAll('[contenteditable="true"]');
    expect(editableNodes).toHaveLength(4);
  });

  it('renders Venn Diagram correctly', () => {
    const widgetData = createWidgetData('venn');
    render(<GraphicOrganizerWidget widget={widgetData} />);

    // Venn has 6 nodes (3 headers, 3 content areas)
    const editableNodes = document.querySelectorAll('[contenteditable="true"]');
    expect(editableNodes).toHaveLength(6);
  });

  it('renders KWL Chart correctly', () => {
    const widgetData = createWidgetData('kwl');
    render(<GraphicOrganizerWidget widget={widgetData} />);

    // KWL has 3 content nodes
    expect(screen.getByText('What I Know')).toBeInTheDocument();
    expect(screen.getByText('What I Wonder')).toBeInTheDocument();
    expect(screen.getByText('What I Learned')).toBeInTheDocument();
    const editableNodes = document.querySelectorAll('[contenteditable="true"]');
    expect(editableNodes).toHaveLength(3);
  });

  it('renders Cause and Effect correctly', () => {
    const widgetData = createWidgetData('cause-effect');
    render(<GraphicOrganizerWidget widget={widgetData} />);

    expect(screen.getByText('Cause')).toBeInTheDocument();
    expect(screen.getByText('Effect')).toBeInTheDocument();
    const editableNodes = document.querySelectorAll('[contenteditable="true"]');
    expect(editableNodes).toHaveLength(2);
  });

  it('updates text immediately on blur', () => {
    const widgetData = createWidgetData('cause-effect');
    render(<GraphicOrganizerWidget widget={widgetData} />);

    const editableNodes = document.querySelectorAll('[contenteditable="true"]');
    const causeNode = Array.from(editableNodes)[0] as HTMLElement;

    fireEvent.input(causeNode, { target: { innerText: 'It rained' } });

    // Ensure timer hasn't fired yet
    expect(mockUpdateWidget).not.toHaveBeenCalled();

    // Trigger blur
    fireEvent.blur(causeNode);

    // Should be called immediately without waiting for timeout
    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'test-widget-1',
      expect.objectContaining({
        config: expect.objectContaining({
          nodes: expect.objectContaining({
            cause: { id: 'cause', text: 'It rained' },
          } as Record<string, unknown>),
        } as Record<string, unknown>),
      } as Record<string, unknown>)
    );
  });

  it('displays initial text from config nodes', () => {
    const widgetData = createWidgetData('frayer', {
      center: { id: 'center', text: 'Photosynthesis' },
    });
    render(<GraphicOrganizerWidget widget={widgetData} />);

    // The center node should have this text
    const editableNodes = document.querySelectorAll('[contenteditable="true"]');
    // center node is the last one in the Frayer render order
    const centerNode = Array.from(editableNodes)[4] as HTMLElement;
    expect(centerNode.innerText).toBe('Photosynthesis');
  });

  it('renders building-specific custom templates via feature permissions', () => {
    // Override the mock for this specific test
    vi.mocked(useAuth).mockReturnValue({
      user: { buildingId: 'test-building' } as unknown,
      selectedBuildings: ['test-building'],
      featurePermissions: [
        {
          widgetType: 'graphic-organizer',
          accessLevel: 'public',
          betaUsers: [],
          enabled: true,
          config: {
            buildings: {
              'test-building': {
                templates: [
                  {
                    id: 'template-custom-123',
                    name: 'Custom KWL',
                    layout: 'kwl',
                    fontFamily: 'comic',
                    defaultNodes: {
                      k: 'What I ALREADY Know',
                      w: 'What I STILL Wonder',
                      l: 'What I FINALLY Learned',
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    } as unknown as ReturnType<typeof useAuth>);

    const widgetData = createWidgetData('template-custom-123');
    render(<GraphicOrganizerWidget widget={widgetData} />);

    // Should render the custom KWL chart labels
    expect(screen.getByText('What I ALREADY Know')).toBeInTheDocument();
    expect(screen.getByText('What I STILL Wonder')).toBeInTheDocument();
    expect(screen.getByText('What I FINALLY Learned')).toBeInTheDocument();

    // Should apply the custom font family class (getFontClass maps 'comic' -> 'font-comic')
    const layoutContainer = screen.getByTestId('widget-layout');
    const innerContainer = layoutContainer.firstElementChild;
    expect(innerContainer).toHaveClass('font-comic');
  });

  it('falls back to frayer layout if custom template ID is missing/deleted', () => {
    // The default setup has an empty featurePermissions array, so the template won't be found
    const widgetData = createWidgetData('template-does-not-exist');
    render(<GraphicOrganizerWidget widget={widgetData} />);

    // It should fallback to rendering the default Frayer layout
    expect(screen.getByText('Definition')).toBeInTheDocument();
    expect(screen.getByText('Characteristics')).toBeInTheDocument();

    const editableNodes = document.querySelectorAll('[contenteditable="true"]');
    expect(editableNodes).toHaveLength(5); // Frayer has 5 nodes
  });
});

// ---------------------------------------------------------------------------
// Regression: EditableNode — render-body ref sync
// ---------------------------------------------------------------------------
//
// Bug (pre-fix): onUpdateRef was synced inside a useEffect:
//
//   useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
//
// useEffect is a passive effect — it runs AFTER the browser paints.
// When the parent re-renders (new onUpdate prop) via flushSync, the passive
// effect is scheduled but NOT yet flushed. The debounced triggerUpdate fires
// and calls onUpdateRef.current — which still points to the OLD closure,
// silently discarding any captured state (e.g. prior node edits) that the new
// closure would have included.
//
// Fix: Assign the ref directly in the render body:
//
//   onUpdateRef.current = onUpdate;  // no useEffect wrapper
//
// This mirrors the pattern in TimeTool/useHoldAccelerate.ts and
// Scoreboard/Widget.tsx (both carry the // eslint-disable-next-line
// react-hooks/refs comment per the CLAUDE.md invariant).
//
// Test technique:
//   vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }) fakes ONLY
//   the debounce timer used by EditableNode.handleInput — but NOT setImmediate,
//   which React's passive-effect scheduler relies on. After a flushSync
//   re-render the pending useEffect is still enqueued in real setImmediate.
//   Calling vi.advanceTimersByTime(500) fires only the faked setTimeout
//   (triggerUpdate), leaving passive effects unflushed. This exposes the
//   stale-ref window that would otherwise be invisible when act() flushes
//   all pending work.
// ---------------------------------------------------------------------------
describe('EditableNode — render-body ref sync regression', () => {
  beforeEach(() => {
    vi.mocked(useIsActiveBoardReadOnly).mockReturnValue(false);
    // Fake ONLY setTimeout/clearTimeout (the debounce in handleInput).
    // setImmediate is NOT faked so React's passive-effect scheduler keeps
    // its real scheduling — vi.advanceTimersByTime won't drain effects.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('calls the LATEST onUpdate (not the stale one) after a synchronous re-render via flushSync', () => {
    // Track which version of onUpdate was invoked by triggerUpdate.
    const callLog: string[] = [];
    const onUpdateA = vi.fn((_id: string, _text: string) => {
      callLog.push('A');
    });
    const onUpdateB = vi.fn((_id: string, _text: string) => {
      callLog.push('B');
    });

    // Render with onUpdateA.
    const { rerender } = render(
      <EditableNode id="node-1" initialText="" onUpdate={onUpdateA} />
    );
    const node = document.querySelector(
      '[contenteditable="true"]'
    ) as HTMLElement;

    // Give initial passive effects a chance to flush (real setImmediate runs).
    act(() => {});

    // Simulate typing — schedules setTimeout(triggerUpdate, 500) via fake timer.
    fireEvent.input(node, { target: { innerText: 'hello' } });

    // Swap to onUpdateB via flushSync: commits the React tree (layout effects
    // run) but does NOT flush passive effects — the pending useEffect is still
    // queued in real setImmediate and has not yet run.
    //
    // With the render-body fix: onUpdateRef.current = onUpdateB during render.
    // With the bug: onUpdateRef.current is still onUpdateA (effect pending).
    flushSync(() => {
      rerender(
        <EditableNode id="node-1" initialText="" onUpdate={onUpdateB} />
      );
    });

    // Advance ONLY the faked setTimeout (the 500ms debounce).
    // setImmediate is real, so React's pending useEffect does NOT flush here.
    // triggerUpdate fires and reads onUpdateRef.current.
    //
    // Old code (useEffect ref sync): passive effect hasn't run
    //   → onUpdateRef.current = onUpdateA → callLog = ['A'] → FAILS.
    // New code (render-body ref sync): ref updated during flushSync render
    //   → onUpdateRef.current = onUpdateB → callLog = ['B'] → PASSES.
    vi.advanceTimersByTime(500);

    expect(callLog).toContain('B');
    expect(callLog).not.toContain('A');
  });
});
