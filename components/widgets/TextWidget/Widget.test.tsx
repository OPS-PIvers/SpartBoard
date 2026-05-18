import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TextWidget, TextSettings } from './index';
import { WidgetData, TextConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';

// Mock useDashboard
const mockUpdateWidget = vi.fn();
const mockSetSelectedWidgetId = vi.fn();
const mockDashboardContext = {
  updateWidget: mockUpdateWidget,
  selectedWidgetId: null,
  setSelectedWidgetId: mockSetSelectedWidgetId,
  activeDashboard: {
    globalStyle: { fontFamily: 'sans' },
  },
};

// Mock useDialog
const mockShowPrompt = vi.fn();

vi.mock('@/context/useDashboard');
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showPrompt: mockShowPrompt,
  }),
}));

describe('TextWidget', () => {
  let execCommandMock: ReturnType<
    typeof vi.fn<
      (commandId: string, showUI?: boolean, value?: string) => boolean
    >
  >;

  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockDashboardContext
    );
    // Mock document.execCommand
    execCommandMock = vi.fn(
      (_commandId: string, _showUI?: boolean, _value?: string) => true
    );
    document.execCommand = execCommandMock;
  });

  const mockConfig: TextConfig = {
    content: 'Hello World',
    bgColor: '#fef9c3',
    fontSize: 18,
  };

  const mockWidget: WidgetData = {
    id: 'test-widget',
    type: 'text',
    x: 0,
    y: 0,
    w: 4,
    h: 4,
    z: 1,
    flipped: false,
    config: mockConfig,
  };

  it('renders content correctly', () => {
    render(<TextWidget widget={mockWidget} />);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('shows toolbar when selected', async () => {
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockDashboardContext,
      selectedWidgetId: 'test-widget',
    });
    render(<TextWidget widget={mockWidget} />);
    // Toolbar renders via portal and depends on RAF-based position tracking.
    // In jsdom getBoundingClientRect returns zeros, so we wait for the RAF to fire.
    await waitFor(() => {
      expect(screen.getByTitle('Bold')).toBeInTheDocument();
    });
  });

  it('updates vertical alignment from the toolbar', async () => {
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockDashboardContext,
      selectedWidgetId: 'test-widget',
    });

    render(<TextWidget widget={mockWidget} />);

    // Wait for toolbar to appear via portal
    await waitFor(() => {
      expect(screen.getByTitle('Alignment & Layout')).toBeInTheDocument();
    });

    // Open alignment popout first (Align Bottom is inside it now)
    fireEvent.click(screen.getByTitle('Alignment & Layout'));
    fireEvent.click(screen.getByTitle('Align Bottom'));

    expect(mockUpdateWidget).toHaveBeenCalledWith('test-widget', {
      config: { ...mockConfig, verticalAlign: 'bottom' },
    });
  });

  it('hides toolbar when not selected', () => {
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockDashboardContext,
      selectedWidgetId: 'other-widget',
    });
    render(<TextWidget widget={mockWidget} />);
    expect(screen.queryByTitle('Bold')).not.toBeInTheDocument();
  });

  it('does not bubble pointerdown from the formatting toolbar to ancestor handlers', async () => {
    // The toolbar renders to document.body via createPortal, but React
    // synthetic events still bubble through the COMPONENT tree — meaning a
    // pointerdown on a toolbar button reaches DraggableWindow's
    // `handlePointerDown` ancestor in production. That handler calls
    // `.focus()` on the widget chrome whenever the target isn't inside a
    // contentEditable, which fires the editor's `onBlur` and drops the
    // live selection. execCommand calls (lists, foreColor, …) then run
    // against a stale collapsed selection and silently no-op.
    //
    // The fix attaches `onPointerDown={(e) => e.stopPropagation()}` on the
    // toolbar's portal wrapper. This test guards that regression by
    // mounting an ancestor pointerdown handler around TextWidget and
    // verifying it does NOT fire when a toolbar button is pressed.
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockDashboardContext,
      selectedWidgetId: 'test-widget',
    });

    const ancestorPointerDown = vi.fn();
    render(
      <div onPointerDown={ancestorPointerDown}>
        <TextWidget widget={mockWidget} />
      </div>
    );

    // Toolbar renders via portal + RAF position tracking — wait for it.
    await waitFor(() => {
      expect(screen.getByTitle('Bold')).toBeInTheDocument();
    });

    fireEvent.pointerDown(screen.getByTitle('Bold'));

    expect(ancestorPointerDown).not.toHaveBeenCalled();
  });

  it('triggers hyperlink prompt on Control+K', async () => {
    mockShowPrompt.mockResolvedValue('https://test.com');
    render(<TextWidget widget={mockWidget} />);
    const editableDiv = screen
      .getByText('Hello World')
      .closest('div[contentEditable="true"]');

    expect(editableDiv).not.toBeNull();
    if (editableDiv) {
      fireEvent.keyDown(editableDiv, { key: 'k', ctrlKey: true });
      await waitFor(() => {
        expect(mockShowPrompt).toHaveBeenCalled();
        expect(execCommandMock).toHaveBeenCalledWith(
          'createLink',
          false,
          'https://test.com'
        );
      });
    }
  });

  it('applies background color', () => {
    const { container } = render(<TextWidget widget={mockWidget} />);
    // The background color is applied to an overlay div
    const overlay = container.querySelector('.absolute.inset-0');
    expect(overlay).toHaveStyle({ backgroundColor: '#fef9c3' });
  });

  it('applies font size', () => {
    const { container } = render(<TextWidget widget={mockWidget} />);
    const contentDiv = container.querySelector(
      'div[contentEditable="true"]'
    ) as HTMLElement;
    // JSDOM does not support container units (cqw/cqh) and will strip them from the style attribute.
    // We verify that the style object is being passed by checking for lineHeight which is supported.
    const styleAttr = contentDiv.getAttribute('style') ?? '';
    expect(styleAttr).toContain('line-height: 1.5');
  });

  it('applies centered vertical alignment to the editor layout', () => {
    const centeredWidget: WidgetData = {
      ...mockWidget,
      config: { ...mockConfig, verticalAlign: 'center' },
    };

    const { container } = render(<TextWidget widget={centeredWidget} />);
    const alignmentWrapper = container.querySelector(
      '.min-h-full.w-full.flex.flex-col'
    ) as HTMLElement;

    expect(alignmentWrapper).toHaveStyle({ justifyContent: 'center' });
  });

  it('updates content on blur', () => {
    render(<TextWidget widget={mockWidget} />);
    const editableDiv = screen
      .getByText('Hello World')
      .closest('div[contentEditable="true"]');

    expect(editableDiv).not.toBeNull();
    if (editableDiv) {
      editableDiv.innerHTML = 'New Content';
      fireEvent.blur(editableDiv);
      expect(mockUpdateWidget).toHaveBeenCalledWith('test-widget', {
        config: { ...mockConfig, content: 'New Content' },
      });
    }
  });

  it('clears placeholder content when focused (empty content)', () => {
    const emptyWidget: WidgetData = {
      ...mockWidget,
      config: { ...mockConfig, content: '' },
    };
    const { container } = render(<TextWidget widget={emptyWidget} />);
    const editableDiv = container.querySelector(
      'div[contentEditable="true"]'
    ) as HTMLElement;

    expect(editableDiv).not.toBeNull();

    // In JSDOM, setting focus to it triggers the focus event
    fireEvent.focus(editableDiv);

    // Empty innerHTML is expected
    expect(editableDiv.innerHTML).toBe('');
    expect(mockSetSelectedWidgetId).toHaveBeenCalledWith(
      String(emptyWidget.id)
    );
  });

  it('clears placeholder content when focused (placeholder content)', () => {
    const placeholderWidget: WidgetData = {
      ...mockWidget,
      config: { ...mockConfig, content: 'Click to edit...' },
    };
    const { container } = render(<TextWidget widget={placeholderWidget} />);
    const editableDiv = container.querySelector(
      'div[contentEditable="true"]'
    ) as HTMLElement;

    expect(editableDiv).not.toBeNull();
    // Inline-only placeholder content is left unwrapped (the normalizer
    // only acts on mixed/multi-paragraph structures).
    expect(editableDiv.innerHTML).toBe('Click to edit...');

    // In JSDOM, setting focus to it triggers the focus event
    fireEvent.focus(editableDiv);

    // Empty innerHTML is expected
    expect(editableDiv.innerHTML).toBe('');
    expect(mockSetSelectedWidgetId).toHaveBeenCalledWith(
      String(placeholderWidget.id)
    );
  });

  it('updates content when changed externally', () => {
    const { container, rerender } = render(<TextWidget widget={mockWidget} />);
    const editableDiv = container.querySelector(
      'div[contentEditable="true"]'
    ) as HTMLElement;
    expect(editableDiv).not.toBeNull();
    // Inline-only content is left untouched by the normalizer.
    expect(editableDiv.innerHTML).toBe('Hello World');

    const updatedWidget = {
      ...mockWidget,
      config: { ...mockConfig, content: 'Updated External Content' },
    };

    rerender(<TextWidget widget={updatedWidget} />);

    // External sync replaces the DOM contents wholesale, not appends.
    expect(editableDiv.innerHTML).toBe('Updated External Content');
    expect(editableDiv.textContent).toBe('Updated External Content');
  });

  it('does not update DOM from external change when editing', () => {
    const { container, rerender } = render(<TextWidget widget={mockWidget} />);
    const editableDiv = container.querySelector(
      'div[contentEditable="true"]'
    ) as HTMLElement;
    expect(editableDiv).not.toBeNull();
    fireEvent.focus(editableDiv);
    editableDiv.innerHTML = 'My Edit';

    const updatedWidget = {
      ...mockWidget,
      config: { ...mockConfig, content: 'Updated External Content' },
    };

    rerender(<TextWidget widget={updatedWidget} />);

    // Should not have overwritten since focus/isEditing is true
    expect(editableDiv.innerHTML).toBe('My Edit');
  });

  it('handles null/empty content correctly on mount and update', () => {
    // Mount with null content
    const nullWidget = {
      ...mockWidget,
      config: { ...mockConfig, content: null as unknown as string },
    };
    const { container, rerender } = render(<TextWidget widget={nullWidget} />);
    const editableDiv = container.querySelector(
      'div[contentEditable="true"]'
    ) as HTMLElement;
    expect(editableDiv).not.toBeNull();
    expect(editableDiv.innerHTML).toBe('');

    // Update with undefined content
    const undefinedWidget = {
      ...mockWidget,
      config: { ...mockConfig, content: undefined as unknown as string },
    };
    rerender(<TextWidget widget={undefinedWidget} />);
    expect(editableDiv.innerHTML).toBe('');
  });

  it('updates content on input', () => {
    const { container } = render(<TextWidget widget={mockWidget} />);
    const editableDiv = container.querySelector(
      'div[contentEditable="true"]'
    ) as HTMLElement;

    expect(editableDiv).not.toBeNull();

    editableDiv.innerHTML = 'Immediate Save';
    fireEvent.input(editableDiv);

    expect(mockUpdateWidget).toHaveBeenCalledWith('test-widget', {
      config: { ...mockConfig, content: 'Immediate Save' },
    });
  });

  it('normalizes mixed bare-text-then-<div> structure during live editing', () => {
    // Reproduces the exact shape Chrome produces while typing: the user
    // types "First", hits Enter (Chrome creates `<div><br></div>` for the
    // new line), then types "Second" — leaving the first line as a bare
    // text node. Without input-time normalization the editor is stuck in
    // a mixed structure that breaks drag-selection across the boundary
    // and confuses list commands. handleInput should rewrite the structure
    // to uniform block children on the same event.
    const { container } = render(<TextWidget widget={mockWidget} />);
    const editableDiv = container.querySelector(
      'div[contentEditable="true"]'
    ) as HTMLElement;
    expect(editableDiv).not.toBeNull();

    editableDiv.innerHTML = 'First<div>Second</div>';
    fireEvent.input(editableDiv);

    // After normalization every top-level child is a block element.
    const childTags = Array.from(editableDiv.childNodes).map((n) =>
      n.nodeType === Node.ELEMENT_NODE
        ? (n as HTMLElement).tagName
        : n.nodeType === Node.TEXT_NODE
          ? '#text'
          : '#other'
    );
    expect(childTags.every((t) => t !== '#text' && t !== 'BR')).toBe(true);
    expect(editableDiv.children.length).toBe(2);
    expect(editableDiv.textContent).toBe('FirstSecond');

    // Saved content reflects the normalized structure (so the same
    // mixed shape doesn't re-appear after a save → external sync round
    // trip).
    const lastCall = mockUpdateWidget.mock.lastCall;
    expect(lastCall).toBeDefined();
    if (lastCall) {
      const payload = lastCall[1] as { config: TextConfig };
      const savedContent = payload.config.content ?? '';
      expect(savedContent).not.toMatch(/^First</); // bare-text prefix is gone
      expect(savedContent).toContain('<div>First</div>');
      expect(savedContent).toContain('<div>Second</div>');
    }
  });

  it('leaves already-uniform block structure alone on input', () => {
    // The normalizer only rewrites mixed structures. Pure-block content is
    // a no-op so steady-state typing inside an existing paragraph doesn't
    // shuffle node identity (which would invalidate the caret) on every
    // keystroke.
    const { container } = render(<TextWidget widget={mockWidget} />);
    const editableDiv = container.querySelector(
      'div[contentEditable="true"]'
    ) as HTMLElement;

    editableDiv.innerHTML = '<div>One</div><div>Two</div>';
    fireEvent.input(editableDiv);

    expect(editableDiv.innerHTML).toBe('<div>One</div><div>Two</div>');
  });

  it('wraps loose top-level text in a <div> on mount so drag-selection works across paragraphs', () => {
    const mixedWidget: WidgetData = {
      ...mockWidget,
      config: {
        ...mockConfig,
        // Templates ship with <br>-separated lines and content authored by
        // users on older builds has bare first-line text followed by <div>
        // paragraphs. Both shapes must end up as uniform <div> blocks.
        content: 'First line<br/><div>Second line</div>Third line',
      },
    };
    const { container } = render(<TextWidget widget={mixedWidget} />);
    const editableDiv = container.querySelector(
      'div[contentEditable="true"]'
    ) as HTMLElement;

    // All direct children of the editor are now block-level elements.
    const childTags = Array.from(editableDiv.childNodes).map((n) =>
      n.nodeType === Node.ELEMENT_NODE
        ? (n as HTMLElement).tagName
        : n.nodeType === Node.TEXT_NODE
          ? '#text'
          : '#other'
    );
    expect(childTags.every((t) => t !== '#text' && t !== 'BR')).toBe(true);
    // Verify content was preserved without loss or re-ordering.
    expect(editableDiv.children.length).toBe(3);
    expect(editableDiv.textContent).toBe('First lineSecond lineThird line');
  });

  it('wraps a selection in a <ul> from Ctrl+Shift+8', () => {
    // Ctrl+Shift+8 routes through our custom `toggleList` helper (NOT
    // `execCommand('insertUnorderedList')`, which is broken in Chrome
    // for multi-block selections). The assertion is the observable
    // DOM change — a `<ul>` element appears in the editor — rather
    // than an execCommand spy call, because the new path bypasses
    // execCommand entirely.
    render(<TextWidget widget={mockWidget} />);
    const editableDiv = screen
      .getByText('Hello World')
      .closest('div[contentEditable="true"]');
    expect(editableDiv).not.toBeNull();
    if (!editableDiv) return;
    editableDiv.innerHTML = '<div>Line one</div><div>Line two</div>';
    const range = document.createRange();
    range.selectNodeContents(editableDiv);
    const sel = window.getSelection();
    if (!sel) throw new Error('window.getSelection() unavailable');
    sel.removeAllRanges();
    sel.addRange(range);

    fireEvent.keyDown(editableDiv, {
      key: '8',
      code: 'Digit8',
      ctrlKey: true,
      shiftKey: true,
    });

    expect(editableDiv.querySelector('ul')).not.toBeNull();
    expect(editableDiv.querySelectorAll('li').length).toBe(2);
  });

  it('wraps a selection in a <ol> from Ctrl+Shift+7', () => {
    render(<TextWidget widget={mockWidget} />);
    const editableDiv = screen
      .getByText('Hello World')
      .closest('div[contentEditable="true"]');
    expect(editableDiv).not.toBeNull();
    if (!editableDiv) return;
    editableDiv.innerHTML = '<div>Line one</div><div>Line two</div>';
    const range = document.createRange();
    range.selectNodeContents(editableDiv);
    const sel = window.getSelection();
    if (!sel) throw new Error('window.getSelection() unavailable');
    sel.removeAllRanges();
    sel.addRange(range);

    fireEvent.keyDown(editableDiv, {
      key: '7',
      code: 'Digit7',
      ctrlKey: true,
      shiftKey: true,
    });

    expect(editableDiv.querySelector('ol')).not.toBeNull();
    expect(editableDiv.querySelectorAll('li').length).toBe(2);
  });

  it('normalizes empty browser markup to empty string on input', () => {
    const { container } = render(<TextWidget widget={mockWidget} />);
    const editableDiv = container.querySelector(
      'div[contentEditable="true"]'
    ) as HTMLElement;

    expect(editableDiv).not.toBeNull();

    editableDiv.innerHTML = '<br>';
    fireEvent.input(editableDiv);

    expect(mockUpdateWidget).toHaveBeenCalledWith('test-widget', {
      config: { ...mockConfig, content: '' },
    });
    expect(mockUpdateWidget).toHaveBeenCalledTimes(1);

    mockUpdateWidget.mockClear();

    editableDiv.innerHTML = '<div><br></div>';
    fireEvent.input(editableDiv);

    expect(mockUpdateWidget).toHaveBeenCalledWith('test-widget', {
      config: { ...mockConfig, content: '' },
    });
    expect(mockUpdateWidget).toHaveBeenCalledTimes(1);
  });
});

describe('TextSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockDashboardContext
    );
  });

  const mockConfig: TextConfig = {
    content: '',
    bgColor: '#fef9c3',
    fontSize: 18,
  };

  const mockWidget: WidgetData = {
    id: 'test-widget',
    type: 'text',
    x: 0,
    y: 0,
    w: 4,
    h: 4,
    z: 1,
    flipped: true,
    config: mockConfig,
  };

  it('applies template when clicked', () => {
    render(<TextSettings widget={mockWidget} />);
    const templateButton = screen.getByText('Integrity Code');
    fireEvent.click(templateButton);

    expect(mockUpdateWidget).toHaveBeenCalledTimes(1);

    const lastCall = mockUpdateWidget.mock.lastCall;
    expect(lastCall).toBeDefined();

    if (lastCall) {
      expect(lastCall[0]).toBe('test-widget');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(lastCall[1].config.content).toContain('Integrity Code');
    }
  });
});
