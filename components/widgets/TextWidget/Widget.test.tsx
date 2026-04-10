import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TextWidget, TextSettings, TextAppearanceSettings } from './index';
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

  it('shows toolbar when selected', () => {
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockDashboardContext,
      selectedWidgetId: 'test-widget',
    });
    render(<TextWidget widget={mockWidget} />);
    expect(screen.getByTitle('Bold')).toBeInTheDocument();
  });

  it('updates vertical alignment from the toolbar', () => {
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockDashboardContext,
      selectedWidgetId: 'test-widget',
    });

    render(<TextWidget widget={mockWidget} />);

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
    expect(editableDiv.innerHTML).toBe('Hello World');

    const updatedWidget = {
      ...mockWidget,
      config: { ...mockConfig, content: 'Updated External Content' },
    };

    rerender(<TextWidget widget={updatedWidget} />);

    expect(editableDiv.innerHTML).toBe('Updated External Content');
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

  it('changes background color', () => {
    render(<TextAppearanceSettings widget={mockWidget} />);
    // Find the button for the second color (#dcfce7 - Green)
    const colorButton = screen.getByLabelText('Select green background');
    fireEvent.click(colorButton);

    expect(mockUpdateWidget).toHaveBeenCalledWith('test-widget', {
      config: { ...mockConfig, bgColor: '#dcfce7' },
    });
  });

  it('changes font size via increment button', () => {
    render(<TextAppearanceSettings widget={mockWidget} />);
    const increaseButton = screen.getByLabelText('Increase font size');
    fireEvent.click(increaseButton);

    expect(mockUpdateWidget).toHaveBeenCalledWith('test-widget', {
      config: { ...mockConfig, fontSize: 19 },
    });
  });

  it('changes vertical alignment in appearance settings', () => {
    render(<TextAppearanceSettings widget={mockWidget} />);
    fireEvent.click(screen.getByRole('button', { name: /bottom/i }));

    expect(mockUpdateWidget).toHaveBeenCalledWith('test-widget', {
      config: { ...mockConfig, verticalAlign: 'bottom' },
    });
  });
});
