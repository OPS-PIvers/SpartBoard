import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { FormattingToolbar } from './FormattingToolbar';

// Mock useDialog
const mockShowPrompt = vi.fn();
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showPrompt: mockShowPrompt,
  }),
}));

describe('FormattingToolbar', () => {
  // Mock ResizeObserver for jsdom
  beforeAll(() => {
    global.ResizeObserver = vi.fn(function () {
      return {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      };
    }) as unknown as typeof ResizeObserver;
  });

  const mockEditorRef = {
    current: document.createElement('div'),
  } as React.RefObject<HTMLDivElement>;
  const mockVerticalAlignChange = vi.fn();
  const mockSuppressInputRef = { current: false };
  const mockOnContentChange = vi.fn();
  const mockOnBgColorChange = vi.fn();
  let execCommandMock: ReturnType<
    typeof vi.fn<
      (commandId: string, showUI?: boolean, value?: string) => boolean
    >
  >;

  const defaultProps = {
    editorRef: mockEditorRef,
    verticalAlign: 'top' as const,
    onVerticalAlignChange: mockVerticalAlignChange,
    suppressInputRef: mockSuppressInputRef,
    onContentChange: mockOnContentChange,
    bgColor: '#fef9c3',
    onBgColorChange: mockOnBgColorChange,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSuppressInputRef.current = false;
    // Mock document.execCommand
    execCommandMock = vi.fn(
      (_commandId: string, _showUI?: boolean, _value?: string) => true
    );
    document.execCommand = execCommandMock;
  });

  it('renders all main formatting buttons', () => {
    render(<FormattingToolbar {...defaultProps} />);
    expect(screen.getByTitle('Bold')).toBeInTheDocument();
    expect(screen.getByTitle('Italic')).toBeInTheDocument();
    expect(screen.getByTitle('Underline')).toBeInTheDocument();
    expect(screen.getByTitle('Hyperlink (Ctrl+K)')).toBeInTheDocument();
    // Alignment & Layout trigger and Colors trigger
    expect(screen.getByTitle('Alignment & Layout')).toBeInTheDocument();
    expect(screen.getByTitle('Colors')).toBeInTheDocument();
    // Open alignment menu to check internal buttons
    fireEvent.click(screen.getByTitle('Alignment & Layout'));
    expect(screen.getByTitle('Align Left')).toBeInTheDocument();
    expect(screen.getByTitle('Align Center')).toBeInTheDocument();
    expect(screen.getByTitle('Align Right')).toBeInTheDocument();
    expect(screen.getByTitle('Bulleted List')).toBeInTheDocument();
    expect(screen.getByTitle('Numbered List')).toBeInTheDocument();
    expect(screen.getByTitle('Decrease Indent')).toBeInTheDocument();
    expect(screen.getByTitle('Increase Indent')).toBeInTheDocument();
    expect(screen.getByTitle('Align Top')).toBeInTheDocument();
    expect(screen.getByTitle('Align Middle')).toBeInTheDocument();
    expect(screen.getByTitle('Align Bottom')).toBeInTheDocument();
  });

  it('calls execCommand when bold button is clicked', () => {
    render(<FormattingToolbar {...defaultProps} />);
    const boldButton = screen.getByTitle('Bold');
    fireEvent.click(boldButton);
    expect(execCommandMock).toHaveBeenCalledWith('bold', false, '');
  });

  it('opens font family menu and selects a font', () => {
    render(<FormattingToolbar {...defaultProps} />);
    const fontButton = screen.getByTitle('Font Family');
    fireEvent.click(fontButton);
    const lexendFont = screen.getByText('Lexend');
    fireEvent.click(lexendFont);

    expect(execCommandMock).toHaveBeenCalledWith(
      'fontName',
      false,
      'Lexend, sans-serif'
    );
  });

  it('increments font size via stepper button', () => {
    render(<FormattingToolbar {...defaultProps} />);
    const increaseButton = screen.getByTitle('Increase font size');
    fireEvent.click(increaseButton);

    // The marker-replacement technique calls fontSize with '7' as a marker
    expect(execCommandMock).toHaveBeenCalledWith('fontSize', false, '7');
  });

  it('calls showPrompt when link button is clicked', async () => {
    mockShowPrompt.mockResolvedValue('https://google.com');
    render(<FormattingToolbar {...defaultProps} />);
    const linkButton = screen.getByTitle('Hyperlink (Ctrl+K)');

    // Use mousedown to prevent default
    fireEvent.mouseDown(linkButton);
    fireEvent.click(linkButton);

    expect(mockShowPrompt).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(execCommandMock).toHaveBeenCalledWith(
        'createLink',
        false,
        'https://google.com'
      );
    });
  });

  it('updates vertical alignment from toolbar buttons', () => {
    render(<FormattingToolbar {...defaultProps} />);

    // Open alignment menu first, then click Align Bottom inside it
    fireEvent.click(screen.getByTitle('Alignment & Layout'));
    fireEvent.click(screen.getByTitle('Align Bottom'));

    expect(mockVerticalAlignChange).toHaveBeenCalledWith('bottom');
  });

  it('calls execCommand when italic button is clicked', () => {
    render(<FormattingToolbar {...defaultProps} />);
    const italicButton = screen.getByTitle('Italic');
    fireEvent.click(italicButton);
    expect(execCommandMock).toHaveBeenCalledWith('italic', false, '');
  });

  it('calls execCommand when underline button is clicked', () => {
    render(<FormattingToolbar {...defaultProps} />);
    const underlineButton = screen.getByTitle('Underline');
    fireEvent.click(underlineButton);
    expect(execCommandMock).toHaveBeenCalledWith('underline', false, '');
  });

  it('opens alignment popout with all four sections', () => {
    render(<FormattingToolbar {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Alignment & Layout'));
    expect(screen.getByText('Justify')).toBeInTheDocument();
    expect(screen.getByText('Vertical')).toBeInTheDocument();
    expect(screen.getByText('Indent')).toBeInTheDocument();
    expect(screen.getByText('Lists')).toBeInTheDocument();
  });

  it('executes justifyCenter from alignment popout', () => {
    render(<FormattingToolbar {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Alignment & Layout'));
    fireEvent.click(screen.getByTitle('Align Center'));
    expect(execCommandMock).toHaveBeenCalledWith('justifyCenter', false, '');
  });

  it('opens color popout with three sections', () => {
    render(<FormattingToolbar {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Colors'));
    expect(screen.getByText('Font Color')).toBeInTheDocument();
    expect(screen.getByText('Highlight')).toBeInTheDocument();
    expect(screen.getByText('Background')).toBeInTheDocument();
  });

  it('calls onBgColorChange when background color swatch is clicked', () => {
    render(<FormattingToolbar {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Colors'));
    const swatches = screen.getAllByTitle('#fef9c3');
    fireEvent.click(swatches[swatches.length - 1]);
    expect(mockOnBgColorChange).toHaveBeenCalledWith('#fef9c3');
  });

  it('executes list command from alignment popout', () => {
    render(<FormattingToolbar {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Alignment & Layout'));
    fireEvent.click(screen.getByTitle('Bulleted List'));
    expect(execCommandMock).toHaveBeenCalledWith(
      'insertUnorderedList',
      false,
      ''
    );
  });
});
