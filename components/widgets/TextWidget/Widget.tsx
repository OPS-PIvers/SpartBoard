import React, { useRef, useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, TextConfig, DEFAULT_GLOBAL_STYLE } from '@/types';
import { STICKY_NOTE_COLORS } from '@/config/colors';
import { resolveTextPresetMultiplier } from '@/config/widgetAppearance';
import { sanitizeHtml } from '@/utils/security';
import { getFontClass } from '@/utils/styles';
import { useDialog } from '@/context/useDialog';

import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { FormattingToolbar } from './FormattingToolbar';
import { PLACEHOLDER_TEXT } from './constants';

export const TextWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const {
    updateWidget,
    activeDashboard,
    selectedWidgetId,
    setSelectedWidgetId,
  } = useDashboard();
  const { showPrompt } = useDialog();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const config = widget.config as TextConfig;
  const {
    content = '',
    bgColor = STICKY_NOTE_COLORS.yellow,
    fontSize = 18,
    fontFamily = 'global',
    fontColor = '#334155',
    verticalAlign = 'center',
    textSizePreset,
  } = config;

  const resolvedFontSize = Math.round(
    fontSize * resolveTextPresetMultiplier(textSizePreset, 1)
  );

  const fontClass = getFontClass(fontFamily, globalStyle.fontFamily);
  const isSelected = selectedWidgetId === widget.id;

  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isEditingRef = useRef(false);
  const lastExternalContent = useRef(content);
  const didInit = useRef(false);
  // When true, handleInput skips saving — used by toolbar font-size operations
  // that mutate the DOM in multiple steps (execCommand + span replacement).
  const suppressInputRef = useRef(false);
  const [toolbarPos, setToolbarPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Track container position so the portal toolbar can be placed above the widget.
  // Uses a lightweight RAF loop while selected to stay in sync during drag/resize.
  useEffect(() => {
    if (!isSelected || !containerRef.current) return;
    let rafId = 0;
    let prevTop = NaN;
    let prevLeft = NaN;
    let prevWidth = NaN;
    const tick = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const top = Math.round(rect.top);
        const left = Math.round(rect.left);
        const width = Math.round(rect.width);
        if (top !== prevTop || left !== prevLeft || width !== prevWidth) {
          prevTop = top;
          prevLeft = left;
          prevWidth = width;
          setToolbarPos({ top, left, width });
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isSelected]);

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
    setSelectedWidgetId(widget.id);
    // Clear placeholder content when user focuses
    if (editorRef.current && isPlaceholder) {
      editorRef.current.innerHTML = '';
    }
  }, [isPlaceholder, setSelectedWidgetId, widget.id]);

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
    // Skip save when the toolbar is performing a multi-step DOM mutation
    // (e.g. execCommand + span replacement for font-size changes).
    if (suppressInputRef.current) return;
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

  /** Called by the toolbar after completing multi-step DOM operations. */
  const saveEditorContent = useCallback(() => {
    const content = readEditorContent();
    lastExternalContent.current = content;
    updateWidget(widget.id, {
      config: {
        ...config,
        content,
      } as TextConfig,
    });
  }, [widget.id, config, updateWidget, readEditorContent]);

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent) => {
      // Control+K for hyperlinking
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const url = await showPrompt('Enter the URL for the link:', {
          placeholder: 'https://example.com',
        });
        if (url) {
          document.execCommand('styleWithCSS', false, 'true');
          document.execCommand('createLink', false, url);
          // Trigger input to save changes
          handleInput();
        }
      }
    },
    [showPrompt, handleInput]
  );

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div ref={containerRef} className="relative h-full w-full">
          {/* Floating formatting toolbar — rendered via portal overlapping the widget top edge */}
          {isSelected &&
            toolbarPos &&
            createPortal(
              <div
                data-click-outside-ignore="true"
                style={{
                  position: 'fixed',
                  top: toolbarPos.top,
                  left: toolbarPos.left,
                  width: toolbarPos.width,
                  transform: 'translateY(calc(-100% - 8px))',
                  zIndex: 11000,
                  pointerEvents: 'auto',
                }}
              >
                <FormattingToolbar
                  editorRef={editorRef}
                  configFontSize={resolvedFontSize}
                  verticalAlign={verticalAlign}
                  onVerticalAlignChange={(value) =>
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        verticalAlign: value,
                      } as TextConfig,
                    })
                  }
                  suppressInputRef={suppressInputRef}
                  onContentChange={saveEditorContent}
                  bgColor={bgColor}
                  onBgColorChange={(color) =>
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        bgColor: color,
                      } as TextConfig,
                    })
                  }
                />
              </div>,
              document.body
            )}

          <div
            className={`h-full w-full ${fontClass} outline-none transition-colors overflow-y-auto custom-scrollbar bg-transparent relative flex flex-col`}
          >
            {/* Background color overlay */}
            <div
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{ backgroundColor: bgColor }}
            />
            <div className="relative z-content flex-1 min-h-0 w-full overflow-y-auto custom-scrollbar">
              <div
                className="flex min-h-full w-full flex-col"
                style={{
                  justifyContent:
                    verticalAlign === 'center'
                      ? 'center'
                      : verticalAlign === 'bottom'
                        ? 'flex-end'
                        : 'flex-start',
                }}
              >
                <div
                  ref={editorRef}
                  className="w-full outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400/60 empty:before:pointer-events-none"
                  style={{
                    padding: 'min(16px, 3.5cqmin)',
                    color: fontColor,
                    fontSize: `min(${resolvedFontSize}px, ${resolvedFontSize * 0.5}cqmin)`,
                    lineHeight: 1.5,
                  }}
                  data-placeholder={PLACEHOLDER_TEXT}
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck={isSelected}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  onInput={handleInput}
                  onKeyDown={handleKeyDown}
                />
              </div>
            </div>
          </div>
        </div>
      }
    />
  );
};
