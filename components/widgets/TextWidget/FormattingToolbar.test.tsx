import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
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
    configFontSize: 18,
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

  it('wraps selection in <span style="font-size:Xpx"> when + is clicked', () => {
    const editor = document.createElement('div');
    const text = document.createTextNode('hello');
    editor.appendChild(text);
    document.body.appendChild(editor);

    const editorRef = {
      current: editor,
    } as React.RefObject<HTMLDivElement>;

    const initialRange = document.createRange();
    initialRange.selectNodeContents(text);

    let currentRange: Range = initialRange;
    const mockSelection = {
      get anchorNode() {
        return currentRange.startContainer;
      },
      get rangeCount() {
        return 1;
      },
      getRangeAt: () => currentRange,
      removeAllRanges: vi.fn(),
      addRange: vi.fn((r: Range) => {
        currentRange = r;
      }),
    } as unknown as Selection;
    vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection);

    render(<FormattingToolbar {...defaultProps} editorRef={editorRef} />);

    fireEvent.click(screen.getByTitle('Increase font size'));

    const span = editor.querySelector<HTMLElement>('span[style*="font-size"]');
    expect(span).not.toBeNull();
    expect(span?.style.fontSize).toBe('19px');
    expect(span?.textContent).toBe('hello');
    expect(mockOnContentChange).toHaveBeenCalled();

    document.body.removeChild(editor);
    vi.restoreAllMocks();
  });

  it('increments by +1px per click, not to xx-large', () => {
    const editor = document.createElement('div');
    const text = document.createTextNode('hello');
    editor.appendChild(text);
    document.body.appendChild(editor);

    const editorRef = {
      current: editor,
    } as React.RefObject<HTMLDivElement>;

    const initialRange = document.createRange();
    initialRange.selectNodeContents(text);

    let currentRange: Range = initialRange;
    const mockSelection = {
      get anchorNode() {
        return currentRange.startContainer;
      },
      get rangeCount() {
        return 1;
      },
      getRangeAt: () => currentRange,
      removeAllRanges: vi.fn(),
      addRange: vi.fn((r: Range) => {
        currentRange = r;
      }),
    } as unknown as Selection;
    vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection);

    render(<FormattingToolbar {...defaultProps} editorRef={editorRef} />);

    const increaseButton = screen.getByTitle('Increase font size');
    fireEvent.click(increaseButton);
    fireEvent.click(increaseButton);
    fireEvent.click(increaseButton);

    const spans = editor.querySelectorAll<HTMLElement>(
      'span[style*="font-size"]'
    );
    expect(spans.length).toBeGreaterThan(0);
    const innermost = spans[spans.length - 1];
    expect(innermost.style.fontSize).toBe('21px');
    expect(innermost.textContent).toBe('hello');
    expect(editor.innerHTML).not.toContain('xx-large');

    document.body.removeChild(editor);
    vi.restoreAllMocks();
  });

  // Builds the structure Chrome produces after typing-then-Enter on multiple
  // lines: text + <div>line</div> + <div>line</div>. Selection mirrors Ctrl+A
  // (selectNodeContents on the editor — commonAncestorContainer === editor).
  const setupMultiBlockEditor = () => {
    const editor = document.createElement('div');
    const text1 = document.createTextNode('text1');
    editor.appendChild(text1);
    const div2 = document.createElement('div');
    div2.appendChild(document.createTextNode('line2'));
    editor.appendChild(div2);
    const div3 = document.createElement('div');
    div3.appendChild(document.createTextNode('line3'));
    editor.appendChild(div3);
    document.body.appendChild(editor);

    const editorRef = {
      current: editor,
    } as React.RefObject<HTMLDivElement>;

    const initialRange = document.createRange();
    initialRange.selectNodeContents(editor);

    let currentRange: Range = initialRange;
    const mockSelection = {
      get anchorNode() {
        return currentRange.startContainer;
      },
      get rangeCount() {
        return 1;
      },
      getRangeAt: () => currentRange,
      removeAllRanges: vi.fn(),
      addRange: vi.fn((r: Range) => {
        currentRange = r;
      }),
    } as unknown as Selection;
    vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection);

    return { editor, editorRef };
  };

  it('applyFontSize wraps every text run on multi-block select-all without nesting div in span', () => {
    const { editor, editorRef } = setupMultiBlockEditor();

    render(<FormattingToolbar {...defaultProps} editorRef={editorRef} />);

    fireEvent.click(screen.getByTitle('Increase font size'));

    // No malformed <span><div>…</div></span> structure.
    expect(editor.querySelectorAll('span > div').length).toBe(0);

    // All three text runs are wrapped in a font-size span.
    const spans = editor.querySelectorAll<HTMLElement>(
      'span[style*="font-size"]'
    );
    expect(spans.length).toBe(3);
    spans.forEach((s) => expect(s.style.fontSize).toBe('19px'));
    expect(Array.from(spans).map((s) => s.textContent)).toEqual([
      'text1',
      'line2',
      'line3',
    ]);

    // Block structure preserved: editor has [text1-span, div2, div3].
    const directChildren = Array.from(editor.children);
    expect(directChildren.length).toBe(3);
    expect(directChildren[0].tagName).toBe('SPAN');
    expect(directChildren[0].textContent).toBe('text1');
    expect(directChildren[1].tagName).toBe('DIV');
    expect(directChildren[1].textContent).toBe('line2');
    expect(directChildren[2].tagName).toBe('DIV');
    expect(directChildren[2].textContent).toBe('line3');

    expect(mockOnContentChange).toHaveBeenCalled();

    document.body.removeChild(editor);
    vi.restoreAllMocks();
  });

  it('Bold on multi-block select-all wraps each text run with font-weight span', () => {
    const { editor, editorRef } = setupMultiBlockEditor();

    render(<FormattingToolbar {...defaultProps} editorRef={editorRef} />);

    fireEvent.click(screen.getByTitle('Bold'));

    const spans = editor.querySelectorAll<HTMLElement>(
      'span[style*="font-weight"]'
    );
    expect(spans.length).toBe(3);
    spans.forEach((s) => expect(s.style.fontWeight).toBe('bold'));
    expect(Array.from(spans).map((s) => s.textContent)).toEqual([
      'text1',
      'line2',
      'line3',
    ]);

    expect(editor.querySelectorAll('span > div').length).toBe(0);
    expect(mockOnContentChange).toHaveBeenCalled();
    // execCommand path is bypassed for the multi-block helper case.
    expect(execCommandMock).not.toHaveBeenCalledWith('bold', false, '');

    document.body.removeChild(editor);
    vi.restoreAllMocks();
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

  it('syncs font size display when configFontSize changes', () => {
    const { rerender } = render(<FormattingToolbar {...defaultProps} />);
    const fontSizeInput = screen.getByLabelText('Font size');
    expect(fontSizeInput).toHaveValue('18');

    // Re-render with a different configFontSize
    rerender(<FormattingToolbar {...defaultProps} configFontSize={24} />);
    expect(fontSizeInput).toHaveValue('24');
  });

  it('detects inline font-size from ancestor span', () => {
    // Set up an editor div with a span containing an inline font-size
    const editor = document.createElement('div');
    const span = document.createElement('span');
    span.style.fontSize = '32px';
    const text = document.createTextNode('hello');
    span.appendChild(text);
    editor.appendChild(span);
    document.body.appendChild(editor);

    const editorRef = {
      current: editor,
    } as React.RefObject<HTMLDivElement>;

    // Create a real Range for getRangeAt
    const range = document.createRange();
    range.selectNodeContents(text);

    const mockSelection = {
      anchorNode: text,
      rangeCount: 1,
      getRangeAt: () => range,
    } as unknown as Selection;
    vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection);

    render(<FormattingToolbar {...defaultProps} editorRef={editorRef} />);

    // Trigger selectionchange to run detectFontSize (wrap in act to flush state)
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });

    const fontSizeInput = screen.getByLabelText('Font size');
    expect(fontSizeInput).toHaveValue('32');

    document.body.removeChild(editor);
    vi.restoreAllMocks();
  });

  it('falls back to configFontSize when no inline style exists', () => {
    // Set up an editor div with plain text (no inline font-size)
    const editor = document.createElement('div');
    const text = document.createTextNode('plain text');
    editor.appendChild(text);
    document.body.appendChild(editor);

    const editorRef = {
      current: editor,
    } as React.RefObject<HTMLDivElement>;

    // Create a real Range for getRangeAt
    const range = document.createRange();
    range.selectNodeContents(text);

    const mockSelection = {
      anchorNode: text,
      rangeCount: 1,
      getRangeAt: () => range,
    } as unknown as Selection;
    vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection);

    render(
      <FormattingToolbar
        {...defaultProps}
        editorRef={editorRef}
        configFontSize={22}
      />
    );

    // Trigger selectionchange to run detectFontSize (wrap in act to flush state)
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });

    const fontSizeInput = screen.getByLabelText('Font size');
    expect(fontSizeInput).toHaveValue('22');

    document.body.removeChild(editor);
    vi.restoreAllMocks();
  });
});
