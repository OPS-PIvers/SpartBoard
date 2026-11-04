import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eraser, MoreHorizontal, Trash2, Undo2 } from 'lucide-react';
import { IconButton } from '@/components/common/IconButton';
import { PenColorSwatches } from '@/components/common/PenColorSwatches';
import { tourAttr } from '@/config/tourAnchors';
import { useClickOutside } from '@/hooks/useClickOutside';
import { getAnnotateToolbarLayout } from '@/utils/annotateToolbarLayout';

interface WidgetAnnotateToolbarProps {
  widgetId: string;
  widgetType: string;
  availableWidth: number;
  color: string;
  onColorChange: (color: string) => void;
  onUndo: () => void;
  onClearAll: () => void;
  onDone: () => void;
}

type OpenPopover = 'colors' | 'tools' | null;

export const WidgetAnnotateToolbar: React.FC<WidgetAnnotateToolbarProps> = ({
  widgetId,
  widgetType,
  availableWidth,
  color,
  onColorChange,
  onUndo,
  onClearAll,
  onDone,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState<OpenPopover>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, () => setOpen(null));

  const layout = getAnnotateToolbarLayout(availableWidth);
  const isEraser = color === 'eraser';
  const popoverMaxW = Math.max(availableWidth - 16, 96);

  const toggle = (which: Exclude<OpenPopover, null>) =>
    setOpen((prev) => (prev === which ? null : which));

  const divider = <div className="w-px h-4 bg-slate-300 mx-1 shrink-0" />;

  const toolButtons = (
    <>
      <IconButton
        {...tourAttr('widget.annotate-toolbar.eraser', widgetId, widgetType)}
        onClick={(e) => {
          e.stopPropagation();
          onColorChange('eraser');
          setOpen(null);
        }}
        icon={<Eraser className="w-3.5 h-3.5" />}
        label={t('widgetWindow.eraser')}
        size="sm"
        variant="ghost"
        active={isEraser}
      />
      <IconButton
        {...tourAttr('widget.annotate-toolbar.undo', widgetId, widgetType)}
        onClick={(e) => {
          e.stopPropagation();
          onUndo();
        }}
        icon={<Undo2 className="w-3.5 h-3.5" />}
        label={t('widgetWindow.undo')}
        size="sm"
        variant="ghost"
      />
      <IconButton
        {...tourAttr('widget.annotate-toolbar.clear-all', widgetId, widgetType)}
        onClick={(e) => {
          e.stopPropagation();
          onClearAll();
          setOpen(null);
        }}
        icon={<Trash2 className="w-3.5 h-3.5" />}
        label={t('widgetWindow.clearAll')}
        size="sm"
        variant="danger"
      />
    </>
  );

  const popoverClass =
    'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max flex flex-wrap items-center justify-center gap-1.5 p-1.5 bg-white shadow-lg rounded-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150';

  return (
    <div
      ref={containerRef}
      data-annotate-toolbar-layout={layout}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(null);
        }
      }}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-widget-internal-overlay flex items-center gap-1 p-1 bg-white/90 backdrop-blur-sm shadow-lg rounded-full border border-slate-200 animate-in slide-in-from-bottom-2 fade-in duration-200"
    >
      {layout === 'full' ? (
        <PenColorSwatches
          variant="window"
          value={color}
          onSelect={onColorChange}
          className="flex items-center gap-1 px-1"
        />
      ) : (
        <button
          type="button"
          {...tourAttr('widget.annotate-toolbar.colors', widgetId, widgetType)}
          aria-haspopup="true"
          aria-expanded={open === 'colors'}
          aria-label={t('penColors.group')}
          title={t('penColors.group')}
          onClick={(e) => {
            e.stopPropagation();
            toggle('colors');
          }}
          className="relative shrink-0 w-5 h-5 mx-1 rounded-full border border-slate-200 ring-2 ring-slate-400 touch-target-expand flex items-center justify-center bg-white text-slate-600 focus-visible:outline-hidden focus-visible:ring-brand-blue-primary"
          style={isEraser ? undefined : { backgroundColor: color }}
        >
          {isEraser && <Eraser className="w-3 h-3" aria-hidden />}
        </button>
      )}
      {open === 'colors' && layout !== 'full' && (
        <div className={popoverClass} style={{ maxWidth: popoverMaxW }}>
          <PenColorSwatches
            variant="window"
            value={color}
            onSelect={onColorChange}
            onPresetPick={() => setOpen(null)}
            className="flex flex-wrap items-center justify-center gap-2 p-0.5"
          />
        </div>
      )}
      {divider}
      {layout === 'compact' ? (
        <>
          <IconButton
            {...tourAttr('widget.annotate-toolbar.tools', widgetId, widgetType)}
            aria-haspopup="true"
            aria-expanded={open === 'tools'}
            onClick={(e) => {
              e.stopPropagation();
              toggle('tools');
            }}
            icon={<MoreHorizontal className="w-3.5 h-3.5" />}
            label={t('widgetWindow.moreActions')}
            size="sm"
            variant="ghost"
            active={open === 'tools'}
          />
          {open === 'tools' && (
            <div className={popoverClass} style={{ maxWidth: popoverMaxW }}>
              {toolButtons}
            </div>
          )}
        </>
      ) : (
        toolButtons
      )}
      {divider}
      <button
        {...tourAttr('widget.annotate-toolbar.done', widgetId, widgetType)}
        onClick={(e) => {
          e.stopPropagation();
          onDone();
        }}
        className="shrink-0 px-2 py-0.5 text-xxs font-bold bg-brand-blue-primary text-white rounded-full hover:bg-brand-blue-dark transition-colors"
      >
        {t('widgetWindow.done')}
      </button>
    </div>
  );
};
