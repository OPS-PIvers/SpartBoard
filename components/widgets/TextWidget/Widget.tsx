import React, { useRef, useEffect, useCallback } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, TextConfig, DEFAULT_GLOBAL_STYLE } from '@/types';
import { STICKY_NOTE_COLORS } from '@/config/colors';
import { sanitizeHtml } from '@/utils/security';
import { getFontClass } from '@/utils/styles';

import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { PLACEHOLDER_TEXT } from './constants';

export const TextWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget, activeDashboard } = useDashboard();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const config = widget.config as TextConfig;
  const {
    content = '',
    bgColor = STICKY_NOTE_COLORS.yellow,
    fontSize = 18,
    fontFamily = 'global',
    fontColor = '#334155',
  } = config;

  const fontClass = getFontClass(fontFamily, globalStyle.fontFamily);

  const editorRef = useRef<HTMLDivElement>(null);
  const isEditingRef = useRef(false);
  const lastExternalContent = useRef(content);
  const didInit = useRef(false);

  // On first render, set initial content. On subsequent renders, sync external
  // content changes into the DOM only when not actively editing and only when
  // the content actually changed externally (e.g. template applied).
  useEffect(() => {
    if (!editorRef.current) return;
    if (!didInit.current) {
      didInit.current = true;
      editorRef.current.innerHTML = content ? sanitizeHtml(content) : '';
      return;
    }
    if (!isEditingRef.current && content !== lastExternalContent.current) {
      lastExternalContent.current = content;
      editorRef.current.innerHTML = content ? sanitizeHtml(content) : '';
    }
  }, [content]);

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
      content={
        <div
          className={`h-full w-full ${fontClass} outline-none transition-colors overflow-y-auto custom-scrollbar bg-transparent relative`}
          style={{ padding: 'min(16px, 3.5cqmin)', color: fontColor }}
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
