import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Circle,
  Eraser,
  Lasso,
  MousePointerClick,
  Pencil,
  Redo2,
  Slash,
  Square,
  TypeOutline,
  Undo2,
} from 'lucide-react';
import type { EraserMode } from '@/types';
import {
  WHITEBOARD_COLORS,
  type WhiteboardSize,
  type WhiteboardTool,
} from './whiteboardTools';

const TOOLS: ReadonlyArray<{
  tool: WhiteboardTool;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { tool: 'pen', Icon: Pencil },
  { tool: 'eraser', Icon: Eraser },
  { tool: 'text', Icon: TypeOutline },
  { tool: 'line', Icon: Slash },
  { tool: 'arrow', Icon: ArrowRight },
  { tool: 'rect', Icon: Square },
  { tool: 'ellipse', Icon: Circle },
];

const ERASER_MODES: ReadonlyArray<{
  mode: EraserMode;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { mode: 'stroke', Icon: Eraser },
  { mode: 'object', Icon: MousePointerClick },
  { mode: 'lasso', Icon: Lasso },
];

const SIZES: ReadonlyArray<{ size: WhiteboardSize; dot: number }> = [
  { size: 'thin', dot: 4 },
  { size: 'medium', dot: 8 },
  { size: 'thick', dot: 14 },
];

const btnBase =
  'h-11 w-11 rounded-xl flex items-center justify-center transition-colors [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed';
const btnIdle = 'text-slate-600 hover:bg-slate-100';
const btnActive = 'bg-brand-blue-primary text-white shadow-sm';

interface WhiteboardToolbarProps {
  tool: WhiteboardTool;
  eraserMode: EraserMode;
  color: string;
  size: WhiteboardSize;
  canUndo: boolean;
  canRedo: boolean;
  disabled: boolean;
  onTool: (tool: WhiteboardTool) => void;
  onEraserMode: (mode: EraserMode) => void;
  onColor: (hex: string) => void;
  onSize: (size: WhiteboardSize) => void;
  onUndo: () => void;
  onRedo: () => void;
}

/** Vertical tool rail beside the 4:3 page, two buttons per row. */
export const WhiteboardToolbar: React.FC<WhiteboardToolbarProps> = ({
  tool,
  eraserMode,
  color,
  size,
  canUndo,
  canRedo,
  disabled,
  onTool,
  onEraserMode,
  onColor,
  onSize,
  onUndo,
  onRedo,
}) => {
  const { t } = useTranslation();
  const showSizes =
    tool !== 'text' &&
    !(tool === 'eraser' && (eraserMode === 'object' || eraserMode === 'lasso'));
  const group = 'grid grid-cols-2 gap-1';
  const divider = 'h-px bg-slate-200';

  return (
    <div
      className="flex max-h-full shrink-0 flex-col gap-2 self-center overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 pb-2 shadow-sm"
      data-testid="whiteboard-toolbar"
    >
      <div
        role="group"
        aria-label={t('quizWhiteboard.canvas.tools')}
        className={group}
      >
        {TOOLS.map(({ tool: id, Icon }) => (
          <button
            key={id}
            type="button"
            // no-tour-anchor: student quiz canvas, outside teacher tours
            aria-pressed={tool === id}
            aria-label={t(`quizWhiteboard.canvas.tool.${id}`)}
            title={t(`quizWhiteboard.canvas.tool.${id}`)}
            disabled={disabled}
            onClick={() => onTool(id)}
            className={`${btnBase} ${tool === id ? btnActive : btnIdle}`}
          >
            <Icon className="h-5 w-5" />
          </button>
        ))}
      </div>

      <div className={divider} />

      {tool === 'eraser' ? (
        <div
          role="group"
          aria-label={t('quizWhiteboard.canvas.eraserMode')}
          className={group}
        >
          {ERASER_MODES.map(({ mode, Icon }) => (
            <button
              key={mode}
              type="button"
              // no-tour-anchor: student quiz canvas, outside teacher tours
              aria-pressed={eraserMode === mode}
              aria-label={t(`quizWhiteboard.canvas.eraser.${mode}`)}
              title={t(`quizWhiteboard.canvas.eraser.${mode}`)}
              disabled={disabled}
              onClick={() => onEraserMode(mode)}
              className={`${btnBase} ${eraserMode === mode ? btnActive : btnIdle}`}
            >
              <Icon className="h-5 w-5" />
            </button>
          ))}
        </div>
      ) : (
        <div
          role="group"
          aria-label={t('quizWhiteboard.canvas.colors')}
          className={group}
        >
          {WHITEBOARD_COLORS.map(({ hex, key }) => (
            <button
              key={hex}
              type="button"
              // no-tour-anchor: student quiz canvas, outside teacher tours
              aria-pressed={color === hex}
              aria-label={t(`quizWhiteboard.canvas.color.${key}`)}
              title={t(`quizWhiteboard.canvas.color.${key}`)}
              disabled={disabled}
              onClick={() => onColor(hex)}
              className={`${btnBase} ${color === hex ? 'bg-slate-100' : 'hover:bg-slate-100'}`}
            >
              <span
                aria-hidden
                className={`block h-6 w-6 rounded-full ${
                  color === hex
                    ? 'ring-2 ring-brand-blue-primary ring-offset-2'
                    : 'ring-1 ring-slate-300'
                }`}
                style={{ backgroundColor: hex }}
              />
            </button>
          ))}
        </div>
      )}

      {showSizes && (
        <>
          <div className={divider} />
          <div
            role="group"
            aria-label={t('quizWhiteboard.canvas.sizes')}
            className={group}
          >
            {SIZES.map(({ size: id, dot }) => (
              <button
                key={id}
                type="button"
                // no-tour-anchor: student quiz canvas, outside teacher tours
                aria-pressed={size === id}
                aria-label={t(`quizWhiteboard.canvas.size.${id}`)}
                title={t(`quizWhiteboard.canvas.size.${id}`)}
                disabled={disabled}
                onClick={() => onSize(id)}
                className={`${btnBase} ${size === id ? 'bg-slate-100 ring-1 ring-brand-blue-primary' : btnIdle}`}
              >
                <span
                  aria-hidden
                  className="block rounded-full bg-slate-700"
                  style={{ width: dot, height: dot }}
                />
              </button>
            ))}
          </div>
        </>
      )}

      <div className={divider} />

      <div className={group}>
        <button
          type="button"
          // no-tour-anchor: student quiz canvas, outside teacher tours
          aria-label={t('quizWhiteboard.canvas.undo')}
          title={t('quizWhiteboard.canvas.undo')}
          disabled={disabled || !canUndo}
          onClick={onUndo}
          className={`${btnBase} ${btnIdle}`}
        >
          <Undo2 className="h-5 w-5" />
        </button>
        <button
          type="button"
          // no-tour-anchor: student quiz canvas, outside teacher tours
          aria-label={t('quizWhiteboard.canvas.redo')}
          title={t('quizWhiteboard.canvas.redo')}
          disabled={disabled || !canRedo}
          onClick={onRedo}
          className={`${btnBase} ${btnIdle}`}
        >
          <Redo2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};
