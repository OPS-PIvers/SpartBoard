// The question prompt as a formatted box: bold, italic, underline and lists, stored as text marks.
import React, {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Bold, Italic, List, ListOrdered, Underline } from 'lucide-react';
import { ensureTopLevelBlocks } from '@/utils/contentEditableBlocks';
import { toggleList } from '@/utils/contentEditableLists';
import { installDragSelectEnhancer } from '@/utils/contentEditableDragSelect';
import { fillPromptEditor, readPromptEditor } from '@/utils/promptEditorDom';
import { type TourAnchorAttrs, tourTypeAttr } from '@/config/tourAnchors';

export interface PromptRichEditorHandle {
  /** Types text at the teacher's last caret spot (or the end), with a space before it when needed. */
  insertText: (text: string, spaceBefore?: boolean) => void;
}

type Tool = 'bold' | 'italic' | 'underline' | 'ul' | 'ol';

interface PromptRichEditorProps {
  value: string;
  onChange: (text: string) => void;
  onBlur?: () => void;
  readOnly?: boolean;
  placeholder?: string;
  anchor: TourAnchorAttrs;
  ref?: React.Ref<PromptRichEditorHandle>;
}

function selectionIn(editor: HTMLElement): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  return editor.contains(range.commonAncestorContainer) ? range : null;
}

function activeTools(editor: HTMLElement): Set<Tool> {
  const on = new Set<Tool>();
  const range = selectionIn(editor);
  if (!range) return on;
  for (const cmd of ['bold', 'italic', 'underline'] as const) {
    if (document.queryCommandState(cmd)) on.add(cmd);
  }
  const start =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
  const list = start?.closest('ul, ol');
  if (list && editor.contains(list))
    on.add(list.tagName === 'UL' ? 'ul' : 'ol');
  return on;
}

const TOOLS: {
  id: Tool;
  label: string;
  icon: React.ElementType;
  anchor: TourAnchorAttrs;
}[] = [
  {
    id: 'bold',
    label: 'Bold',
    icon: Bold,
    anchor: tourTypeAttr('quiz-editor.prompt-bold', 'quiz'),
  },
  {
    id: 'italic',
    label: 'Italic',
    icon: Italic,
    anchor: tourTypeAttr('quiz-editor.prompt-italic', 'quiz'),
  },
  {
    id: 'underline',
    label: 'Underline',
    icon: Underline,
    anchor: tourTypeAttr('quiz-editor.prompt-underline', 'quiz'),
  },
  {
    id: 'ul',
    label: 'Bulleted list',
    icon: List,
    anchor: tourTypeAttr('quiz-editor.prompt-bullets', 'quiz'),
  },
  {
    id: 'ol',
    label: 'Numbered list',
    icon: ListOrdered,
    anchor: tourTypeAttr('quiz-editor.prompt-numbers', 'quiz'),
  },
];

export const PromptRichEditor: React.FC<PromptRichEditorProps> = ({
  value,
  onChange,
  onBlur,
  readOnly = false,
  placeholder,
  anchor,
  ref,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  // The text the DOM shows now; a different value came from outside and is redrawn.
  const renderedRef = useRef<string | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [active, setActive] = useState<Set<Tool>>(() => new Set());

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === renderedRef.current) return;
    fillPromptEditor(editor, value);
    renderedRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!editorRef.current) return undefined;
    return installDragSelectEnhancer(editorRef.current);
  }, []);

  useEffect(() => {
    const onSelection = () => {
      const editor = editorRef.current;
      if (!editor) return;
      const range = selectionIn(editor);
      if (range) savedRangeRef.current = range.cloneRange();
      setActive(activeTools(editor));
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, []);

  const emit = () => {
    const editor = editorRef.current;
    if (!editor || readOnly) return;
    ensureTopLevelBlocks(editor, { wrapTag: 'p' });
    const text = readPromptEditor(editor);
    if (text === renderedRef.current) return;
    renderedRef.current = text;
    onChange(text);
  };

  const run = (tool: Tool) => {
    const editor = editorRef.current;
    if (!editor || readOnly) return;
    editor.focus();
    if (tool === 'ul' || tool === 'ol') {
      ensureTopLevelBlocks(editor, { wrapTag: 'p' });
      toggleList(editor, tool, 'p');
    } else {
      document.execCommand(tool);
    }
    emit();
    setActive(activeTools(editor));
  };

  useImperativeHandle(ref, () => ({
    insertText: (text, spaceBefore = false) => {
      const editor = editorRef.current;
      if (!editor || readOnly) return;
      editor.focus();
      const sel = window.getSelection();
      let range = savedRangeRef.current;
      if (!range || !editor.contains(range.commonAncestorContainer)) {
        range = document.createRange();
        range.selectNodeContents(editor.lastElementChild ?? editor);
        range.collapse(false);
      }
      sel?.removeAllRanges();
      sel?.addRange(range);
      const before =
        range.startContainer.nodeType === Node.TEXT_NODE
          ? (range.startContainer.textContent ?? '').slice(0, range.startOffset)
          : '';
      const pad = spaceBefore && before && !/\s$/.test(before) ? ' ' : '';
      document.execCommand('insertText', false, `${pad}${text}`);
      emit();
    },
  }));

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (readOnly) return;
    const text = e.clipboardData.getData('text/plain');
    if (text) document.execCommand('insertText', false, text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const key = e.key.toLowerCase();
    const tool =
      key === 'b'
        ? 'bold'
        : key === 'i'
          ? 'italic'
          : key === 'u'
            ? 'underline'
            : null;
    if (!tool) return;
    e.preventDefault();
    run(tool);
  };

  return (
    <div className="rounded-lg border border-slate-300 bg-white focus-within:border-brand-blue-primary focus-within:ring-2 focus-within:ring-brand-blue-primary/40">
      <div
        role="toolbar"
        aria-label="Prompt formatting"
        className="flex items-center gap-0.5 border-b border-slate-200 px-1.5 py-0.5"
      >
        {TOOLS.map((tool, i) => {
          const Icon = tool.icon;
          const on = active.has(tool.id);
          return (
            <React.Fragment key={tool.id}>
              {i === 3 && (
                <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden />
              )}
              <button
                type="button"
                aria-label={tool.label}
                aria-pressed={on}
                title={tool.label}
                disabled={readOnly}
                // Keep the selection the command applies to.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(tool.id)}
                className={`rounded p-1 transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-brand-blue-primary ${
                  on
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                }`}
                {...tool.anchor}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </button>
            </React.Fragment>
          );
        })}
      </div>
      <div className="relative">
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          aria-label="Question prompt"
          aria-placeholder={placeholder}
          aria-readonly={readOnly}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          onInput={emit}
          onBlur={onBlur}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onFocus={() =>
            document.execCommand('defaultParagraphSeparator', false, 'p')
          }
          className="rich-text-content min-h-[4.75rem] max-h-[60vh] resize-y overflow-y-auto whitespace-pre-wrap wrap-break-word px-3 py-2 text-sm text-slate-900 focus:outline-hidden"
          {...anchor}
        />
        {value === '' && placeholder && (
          <div
            aria-hidden
            className="pointer-events-none absolute left-3 top-2 select-none text-sm text-slate-400"
          >
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
};
