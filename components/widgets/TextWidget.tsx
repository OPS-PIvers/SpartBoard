import React, { useRef, useEffect, useCallback } from 'react';
import { useDashboard } from '../../context/useDashboard';
import { WidgetData, TextConfig, DEFAULT_GLOBAL_STYLE } from '../../types';
import { STICKY_NOTE_COLORS } from '../../config/colors';
import { FileText, MessageSquare, ShieldCheck, Star } from 'lucide-react';
import { sanitizeHtml } from '../../utils/security';

import { WidgetLayout } from './WidgetLayout';
import { SettingsLabel } from '../common/SettingsLabel';

const PLACEHOLDER_TEXT = 'Click to edit...';

export const TextWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget, activeDashboard } = useDashboard();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const config = widget.config as TextConfig;
  const {
    content = '',
    bgColor = STICKY_NOTE_COLORS.yellow,
    fontSize = 18,
  } = config;

  const editorRef = useRef<HTMLDivElement>(null);
  const isEditingRef = useRef(false);
  const lastExternalContent = useRef(content);

  // Sync external content changes into the DOM only when not actively editing
  // and only when the content actually changed externally (e.g. template applied)
  useEffect(() => {
    if (
      editorRef.current &&
      !isEditingRef.current &&
      content !== lastExternalContent.current
    ) {
      lastExternalContent.current = content;
      editorRef.current.innerHTML = content ? sanitizeHtml(content) : '';
    }
  }, [content]);

  // Set initial content on mount only. The `content` dep is intentionally
  // omitted — ongoing external changes are handled by the effect above,
  // and including `content` here would overwrite the DOM during typing.
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = content ? sanitizeHtml(content) : '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPlaceholder = !content || content === PLACEHOLDER_TEXT;

  const handleFocus = useCallback(() => {
    isEditingRef.current = true;
    // Clear placeholder content when user focuses
    if (editorRef.current && isPlaceholder) {
      editorRef.current.innerHTML = '';
    }
  }, [isPlaceholder]);

  /** Normalize browser empty-editor markup (<br>, <div><br></div>) to '' */
  const readEditorContent = useCallback((): string => {
    if (!editorRef.current) return '';
    const html = editorRef.current.innerHTML;
    // Browsers leave <br> or <div><br></div> when content is fully deleted
    const stripped = html
      .replace(/<br\s*\/?>/gi, '')
      .replace(/<div>\s*<\/div>/gi, '')
      .trim();
    return stripped === '' ? '' : sanitizeHtml(html);
  }, []);

  const handleBlur = useCallback(() => {
    isEditingRef.current = false;
    const content = readEditorContent();
    // Update the ref so the useEffect doesn't re-apply the same content
    lastExternalContent.current = content;
    updateWidget(widget.id, {
      config: {
        ...config,
        content,
      } as TextConfig,
    });
  }, [widget.id, config, updateWidget, readEditorContent]);

  const handleInput = useCallback(() => {
    // Save on every input for immediate persistence (debounced by DashboardContext)
    const content = readEditorContent();
    lastExternalContent.current = content;
    updateWidget(widget.id, {
      config: {
        ...config,
        content,
      } as TextConfig,
    });
  }, [widget.id, config, updateWidget, readEditorContent]);

  return (
    <WidgetLayout
      padding="p-0"
      header={
        <div
          className="w-full flex items-center justify-center border-b border-slate-100/30 cursor-move hover:bg-slate-900/5 transition-colors group/text-header"
          style={{ height: 'min(16px, 3.5cqmin)' }}
        >
          <div
            className="bg-slate-400/30 rounded-full group-hover/text-header:bg-slate-400/50 transition-colors"
            style={{
              width: 'min(32px, 8cqmin)',
              height: 'min(4px, 1cqmin)',
            }}
          />
        </div>
      }
      content={
        <div
          className={`h-full w-full font-${globalStyle.fontFamily} outline-none transition-colors overflow-y-auto custom-scrollbar bg-transparent relative`}
          style={{ padding: 'min(16px, 3.5cqmin)' }}
        >
          {/* Background color overlay */}
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{ backgroundColor: bgColor }}
          />
          <div
            ref={editorRef}
            className="relative z-10 h-full w-full outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400/60 empty:before:pointer-events-none"
            style={{
              fontSize: `min(${fontSize}px, ${fontSize * 0.5}cqmin)`,
              lineHeight: 1.5,
            }}
            data-placeholder={PLACEHOLDER_TEXT}
            contentEditable
            suppressContentEditableWarning
            onFocus={handleFocus}
            onBlur={handleBlur}
            onInput={handleInput}
          />
        </div>
      }
    />
  );
};

export const TextSettings: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as TextConfig;

  const colors = [
    { hex: STICKY_NOTE_COLORS.yellow, label: 'yellow' },
    { hex: STICKY_NOTE_COLORS.green, label: 'green' },
    { hex: STICKY_NOTE_COLORS.blue, label: 'blue' },
    { hex: STICKY_NOTE_COLORS.pink, label: 'pink' },
    { hex: STICKY_NOTE_COLORS.gray, label: 'gray' },
  ];

  const templates = [
    {
      name: 'Integrity Code',
      icon: ShieldCheck,
      content:
        '<b>The Integrity Code</b><br/>I promise that the work I am doing today is my own. I have not received unauthorized help, and I will not share assessment details with others.<br/><br/><i>Signed: ________________</i>',
    },
    {
      name: 'Spartan Scholar',
      icon: Star,
      content:
        '<b>Spartan Scholar Code</b><br/>• I am ready to learn.<br/>• I respect my peers.<br/>• I strive for excellence.<br/>• I own my actions.',
    },
    {
      name: 'Speaking Frames',
      icon: MessageSquare,
      content:
        '<b>Speaking Scaffolds</b><br/>• I agree with ___ because...<br/>• I respectfully disagree with ___ since...<br/>• To build on what ___ said...<br/>• Can you explain what you meant by...?',
    },
    {
      name: 'Writing Frame',
      icon: FileText,
      content:
        "<b>Summary Frame</b><br/>In today's lesson, we learned about ____. One important detail was ____. This is significant because ____.",
    },
  ];

  const applyTemplate = (content: string) => {
    updateWidget(widget.id, {
      config: { ...config, content: sanitizeHtml(content) } as TextConfig,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <SettingsLabel>Templates</SettingsLabel>
        <div className="grid grid-cols-2 gap-2">
          {templates.map((t) => (
            <button
              key={t.name}
              onClick={() => applyTemplate(t.content)}
              className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-lg text-left hover:bg-slate-50 transition-all"
            >
              <t.icon className="w-3 h-3 text-indigo-600" />
              <span className="text-xxs  text-slate-800">{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SettingsLabel>Background Color</SettingsLabel>
        <div className="flex gap-2">
          {colors.map((c) => (
            <button
              key={c.hex}
              aria-label={`Select ${c.label} background`}
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, bgColor: c.hex } as TextConfig,
                })
              }
              className={`w-8 h-8 rounded-full border-2 transition-all ${config.bgColor === c.hex ? 'border-blue-600 scale-110 shadow-md' : 'border-transparent'}`}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
      </div>

      <div>
        <SettingsLabel>Font Size</SettingsLabel>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="12"
            max="48"
            value={config.fontSize}
            onChange={(e) =>
              updateWidget(widget.id, {
                config: {
                  ...config,
                  fontSize: parseInt(e.target.value),
                } as TextConfig,
              })
            }
            className="flex-1 accent-blue-600"
          />
          <span className="w-8 text-center font-mono  text-slate-700 text-xs">
            {config.fontSize}
          </span>
        </div>
      </div>
    </div>
  );
};
