import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bold,
  Heading,
  Italic,
  List,
  ListChecks,
  ListOrdered,
} from 'lucide-react';
import { ensureTopLevelBlocks } from '@/utils/contentEditableBlocks';
import {
  collectSelectedBlocks,
  restoreSelectionOffsets,
  saveSelectionOffsets,
  toggleList,
} from '@/utils/contentEditableLists';
import { installDragSelectEnhancer } from '@/utils/contentEditableDragSelect';
import { editorDomToMarkdown, markdownToEditorHtml } from './notesRichText';

interface PlcNoteRichEditorProps {
  /** Note body as Markdown. */
  value: string;
  onChange: (markdown: string) => void;
  readOnly: boolean;
  /** Hidden for viewers, who can't edit at all. */
  showToolbar: boolean;
}

const HEADING_TAGS = new Set(['H1', 'H2', 'H3']);

function selectionRange(editor: HTMLElement): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  return editor.contains(range.commonAncestorContainer) ? range : null;
}

function isChecklistItem(el: HTMLElement): boolean {
  return (
    el.tagName === 'LI' &&
    el.parentElement?.tagName === 'UL' &&
    el.dataset.checked !== undefined
  );
}

export const PlcNoteRichEditor: React.FC<PlcNoteRichEditorProps> = ({
  value,
  onChange,
  readOnly,
  showToolbar,
}) => {
  const { t } = useTranslation();
  const editorRef = useRef<HTMLDivElement>(null);
  // The Markdown the DOM currently represents; null until first render.
  const renderedRef = useRef<string | null>(null);

  // Rebuild the DOM only when the value came from outside (note switch or a
  // teammate's edit), keeping the caret where it was.
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === renderedRef.current) return;
    const range =
      document.activeElement === editor ? selectionRange(editor) : null;
    const saved = range ? saveSelectionOffsets(editor, range) : null;
    editor.innerHTML = markdownToEditorHtml(value);
    renderedRef.current = value;
    if (saved) restoreSelectionOffsets(editor, saved);
  }, [value]);

  useEffect(() => {
    if (!editorRef.current) return undefined;
    return installDragSelectEnhancer(editorRef.current);
  }, []);

  const emit = () => {
    const editor = editorRef.current;
    if (!editor || readOnly) return;
    const markdown = editorDomToMarkdown(editor);
    if (markdown === renderedRef.current) return;
    renderedRef.current = markdown;
    onChange(markdown);
  };

  const handleInput = () => {
    const editor = editorRef.current;
    if (!editor) return;
    ensureTopLevelBlocks(editor, { wrapTag: 'p' });
    // Enter on a ticked item copies its tick onto the new empty item.
    const range = selectionRange(editor);
    const li = range?.startContainer.parentElement?.closest('li');
    const target =
      range?.startContainer instanceof HTMLElement &&
      range.startContainer.tagName === 'LI'
        ? range.startContainer
        : li;
    if (
      target instanceof HTMLElement &&
      target.dataset.checked === 'true' &&
      !(target.textContent ?? '').trim()
    ) {
      target.dataset.checked = 'false';
    }
    emit();
  };

  const runCommand = (fn: (editor: HTMLDivElement) => void) => {
    const editor = editorRef.current;
    if (!editor || readOnly) return;
    editor.focus();
    fn(editor);
    handleInput();
  };

  const toggleHeading = (editor: HTMLDivElement) => {
    ensureTopLevelBlocks(editor, { wrapTag: 'p' });
    const range = selectionRange(editor);
    if (!range) return;
    const blocks = collectSelectedBlocks(editor, range).filter(
      (b) => b.tagName !== 'LI'
    );
    if (blocks.length === 0) return;
    const saved = saveSelectionOffsets(editor, range);
    const toParagraph = blocks.every((b) => HEADING_TAGS.has(b.tagName));
    for (const block of blocks) {
      const next = document.createElement(toParagraph ? 'p' : 'h2');
      while (block.firstChild) next.appendChild(block.firstChild);
      if (!next.firstChild) next.appendChild(document.createElement('br'));
      block.replaceWith(next);
    }
    restoreSelectionOffsets(editor, saved);
  };

  const toggleBullets = (editor: HTMLDivElement) => {
    ensureTopLevelBlocks(editor, { wrapTag: 'p' });
    const range = selectionRange(editor);
    if (!range) return;
    const blocks = collectSelectedBlocks(editor, range);
    if (blocks.length > 0 && blocks.every(isChecklistItem)) {
      blocks.forEach((b) => delete b.dataset.checked);
      return;
    }
    toggleList(editor, 'ul', 'p');
  };

  const toggleChecklist = (editor: HTMLDivElement) => {
    ensureTopLevelBlocks(editor, { wrapTag: 'p' });
    const range = selectionRange(editor);
    if (!range) return;
    const blocks = collectSelectedBlocks(editor, range);
    if (blocks.length === 0) return;
    if (blocks.every(isChecklistItem)) {
      blocks.forEach((b) => delete b.dataset.checked);
      toggleList(editor, 'ul', 'p');
      return;
    }
    const inBullets = blocks.every(
      (b) => b.tagName === 'LI' && b.parentElement?.tagName === 'UL'
    );
    if (!inBullets) toggleList(editor, 'ul', 'p');
    const after = selectionRange(editor);
    if (!after) return;
    collectSelectedBlocks(editor, after).forEach((b) => {
      if (b.tagName === 'LI' && b.dataset.checked === undefined) {
        b.dataset.checked = 'false';
      }
    });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target;
    if (
      readOnly ||
      !(target instanceof HTMLElement) ||
      !isChecklistItem(target) ||
      e.clientX >= target.getBoundingClientRect().left
    ) {
      return;
    }
    e.preventDefault();
    target.dataset.checked =
      target.dataset.checked === 'true' ? 'false' : 'true';
    emit();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (readOnly) return;
    const text = e.clipboardData.getData('text/plain');
    if (text) document.execCommand('insertText', false, text);
  };

  const tools: Array<{
    id: string;
    label: string;
    icon: React.ElementType;
    run: (editor: HTMLDivElement) => void;
  }> = [
    {
      id: 'bold',
      label: t('plcDashboard.notes.rich.bold', { defaultValue: 'Bold' }),
      icon: Bold,
      run: () => document.execCommand('bold'),
    },
    {
      id: 'italic',
      label: t('plcDashboard.notes.rich.italic', { defaultValue: 'Italic' }),
      icon: Italic,
      run: () => document.execCommand('italic'),
    },
    {
      id: 'heading',
      label: t('plcDashboard.notes.rich.heading', { defaultValue: 'Heading' }),
      icon: Heading,
      run: toggleHeading,
    },
    {
      id: 'bullets',
      label: t('plcDashboard.notes.rich.bullets', {
        defaultValue: 'Bulleted list',
      }),
      icon: List,
      run: toggleBullets,
    },
    {
      id: 'numbers',
      label: t('plcDashboard.notes.rich.numbers', {
        defaultValue: 'Numbered list',
      }),
      icon: ListOrdered,
      run: (editor) => {
        ensureTopLevelBlocks(editor, { wrapTag: 'p' });
        toggleList(editor, 'ol', 'p');
      },
    },
    {
      id: 'checklist',
      label: t('plcDashboard.notes.rich.checklist', {
        defaultValue: 'Checklist',
      }),
      icon: ListChecks,
      run: toggleChecklist,
    },
  ];

  const isEmpty = value.trim() === '';

  return (
    <div className="flex-1 min-h-[8rem] flex flex-col">
      {showToolbar && (
        <div
          role="toolbar"
          aria-label={t('plcDashboard.notes.rich.toolbar', {
            defaultValue: 'Formatting',
          })}
          className="shrink-0 flex items-center gap-0.5 px-3 py-1.5 border-b border-slate-100"
        >
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                disabled={readOnly}
                // Keep the text selection the command applies to.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runCommand(tool.run)}
                aria-label={tool.label}
                title={tool.label}
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      )}
      <div className="relative flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          aria-label={t('plcDashboard.notes.rich.body', {
            defaultValue: 'Note',
          })}
          aria-readonly={readOnly}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          spellCheck
          onInput={handleInput}
          onPaste={handlePaste}
          onMouseDown={handleMouseDown}
          onFocus={() =>
            document.execCommand('defaultParagraphSeparator', false, 'p')
          }
          className="plc-note-rich rich-text-content min-h-full w-full p-4 text-sm text-slate-700 leading-relaxed focus:outline-none"
        />
        {isEmpty && !readOnly && (
          <div
            aria-hidden
            className="absolute top-4 left-4 text-sm text-slate-300 pointer-events-none select-none"
          >
            {t('plcDashboard.notes.rich.placeholder', {
              defaultValue: 'Write your notes',
            })}
          </div>
        )}
      </div>
    </div>
  );
};
