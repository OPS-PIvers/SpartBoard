import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Plus, RotateCcw } from 'lucide-react';
import { usePenColors } from '@/hooks/usePenColors';
import { toPenHex } from '@/utils/penColors';

const LONG_PRESS_MS = 500;

type PenColorVariant = 'whiteboard' | 'annotation' | 'window';

interface VariantStyles {
  swatch: string;
  active: string;
  inactive: string;
  action: string;
  icon: string;
}

const VARIANTS: Record<PenColorVariant, VariantStyles> = {
  whiteboard: {
    swatch:
      'w-6 h-6 rounded-full focus-visible:ring-2 focus-visible:ring-brand-blue-light focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
    active: 'ring-2 ring-white scale-110 shadow-sm',
    inactive: 'ring-1 ring-white/20 hover:scale-110',
    action:
      'w-6 h-6 rounded-full bg-slate-800/60 ring-1 ring-white/20 text-slate-300 hover:bg-slate-700/80 hover:text-white disabled:opacity-40 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-brand-blue-light focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
    icon: 'w-3.5 h-3.5',
  },
  annotation: {
    swatch:
      'w-7 h-7 rounded-md focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-100',
    active: 'scale-110 shadow-sm ring-2 ring-indigo-500',
    inactive: 'hover:scale-105',
    action:
      'w-7 h-7 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-indigo-500',
    icon: 'w-4 h-4',
  },
  window: {
    swatch:
      'w-5 h-5 rounded-full border border-slate-100 touch-target-expand focus-visible:ring-2 focus-visible:ring-brand-blue-primary',
    active: 'scale-125 ring-2 ring-slate-400 z-10',
    inactive: 'hover:scale-110',
    action:
      'w-5 h-5 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 touch-target-expand disabled:opacity-40 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary',
    icon: 'w-3 h-3',
  },
};

interface PenColorSwatchesProps {
  /** Current pen color; anything that isn't one of the presets lights up the custom button. */
  value: string;
  onSelect: (color: string) => void;
  variant: PenColorVariant;
  className?: string;
}

/** The teacher's 5 pen presets + a custom color picker; right-click or long-press a preset to change it. */
export const PenColorSwatches: React.FC<PenColorSwatchesProps> = ({
  value,
  onSelect,
  variant,
  className = '',
}) => {
  const { t } = useTranslation();
  const { colors, canEdit, isCustomized, replaceColor, resetColors } =
    usePenColors();
  const [editIndex, setEditIndex] = useState<number | null>(null);
  // Mirrors editIndex so a long-press and contextmenu firing together open one editor.
  const editIndexRef = useRef<number | null>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);
  const focusDoneRef = useRef(false);
  const styles = VARIANTS[variant];

  useEffect(
    () => () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    },
    []
  );

  const currentHex = toPenHex(value);
  const isCustomActive = currentHex !== null && !colors.includes(currentHex);

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // A mouse right-click still carries user activation, so the native picker can
  // open immediately; touch long-press and the keyboard menu key cannot.
  const startEditing = (index: number, via: 'mouse' | 'touch' | 'keyboard') => {
    if (!canEdit || editIndexRef.current !== null) return;
    editIndexRef.current = index;
    focusDoneRef.current = via === 'keyboard';
    setEditIndex(index);
    onSelect(colors[index]);
    const input = editInputRef.current;
    if (via === 'mouse' && input) {
      input.value = colors[index];
      input.click();
    }
  };

  const stopEditing = () => {
    editIndexRef.current = null;
    setEditIndex(null);
  };

  const hiddenInputs = (
    <>
      <input
        ref={customInputRef}
        type="color"
        value={currentHex ?? colors[0]}
        onChange={(e) => onSelect(e.target.value)}
        className="sr-only"
        aria-label={t('penColors.custom')}
        tabIndex={-1}
      />
      <input
        ref={editInputRef}
        type="color"
        value={editIndex !== null ? colors[editIndex] : colors[0]}
        onChange={(e) => {
          if (editIndex === null) return;
          replaceColor(editIndex, e.target.value);
          onSelect(e.target.value);
        }}
        className="sr-only"
        aria-hidden
        tabIndex={-1}
      />
    </>
  );

  if (editIndex !== null) {
    const index = editIndex;
    return (
      <div
        role="group"
        aria-label={t('penColors.group')}
        className={className}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.stopPropagation();
          stopEditing();
        }}
      >
        {hiddenInputs}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              editInputRef.current?.click();
            }}
            className={`shrink-0 transition-transform focus-visible:outline-none ${styles.swatch} ${styles.active}`}
            style={{ backgroundColor: colors[index] }}
            aria-label={t('penColors.change', { index: index + 1 })}
            title={t('penColors.change', { index: index + 1 })}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              resetColors();
            }}
            disabled={!isCustomized}
            className={`shrink-0 flex items-center justify-center transition-colors focus-visible:outline-none ${styles.action}`}
            aria-label={t('penColors.reset')}
            title={t('penColors.reset')}
          >
            <RotateCcw className={styles.icon} aria-hidden />
          </button>
          <button
            type="button"
            ref={(el) => {
              if (el && focusDoneRef.current) {
                focusDoneRef.current = false;
                el.focus();
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              stopEditing();
            }}
            className={`shrink-0 flex items-center justify-center transition-colors focus-visible:outline-none ${styles.action}`}
            aria-label={t('penColors.done')}
            title={t('penColors.done')}
          >
            <Check className={styles.icon} aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div role="group" aria-label={t('penColors.group')} className={className}>
      {hiddenInputs}
      {colors.map((c, index) => {
        const label = t('penColors.preset', { index: index + 1 });
        return (
          <button
            key={index}
            type="button"
            aria-pressed={currentHex === c}
            onPointerDown={(e) => {
              suppressClickRef.current = false;
              if (!canEdit || e.pointerType === 'mouse') return;
              clearLongPress();
              longPressTimerRef.current = setTimeout(() => {
                longPressTimerRef.current = null;
                suppressClickRef.current = true;
                startEditing(index, 'touch');
              }, LONG_PRESS_MS);
            }}
            onPointerUp={clearLongPress}
            onPointerLeave={clearLongPress}
            onPointerCancel={clearLongPress}
            onContextMenu={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              e.stopPropagation();
              clearLongPress();
              suppressClickRef.current = true;
              const fromKeyboard = e.clientX === 0 && e.clientY === 0;
              startEditing(index, fromKeyboard ? 'keyboard' : 'mouse');
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              onSelect(c);
            }}
            className={`relative shrink-0 select-none transition-transform focus-visible:outline-none ${styles.swatch} ${
              currentHex === c ? styles.active : styles.inactive
            }`}
            style={{ backgroundColor: c, WebkitTouchCallout: 'none' }}
            aria-label={label}
            title={canEdit ? `${label} · ${t('penColors.editHint')}` : label}
          />
        );
      })}
      <button
        type="button"
        aria-pressed={isCustomActive}
        onClick={(e) => {
          e.stopPropagation();
          customInputRef.current?.click();
        }}
        className={`relative shrink-0 flex items-center justify-center transition-transform focus-visible:outline-none ${
          isCustomActive ? `${styles.swatch} ${styles.active}` : styles.action
        }`}
        style={
          isCustomActive && currentHex
            ? { backgroundColor: currentHex }
            : undefined
        }
        aria-label={t('penColors.custom')}
        title={t('penColors.custom')}
      >
        {!isCustomActive && <Plus className={styles.icon} aria-hidden />}
      </button>
    </div>
  );
};
