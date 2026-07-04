import React, { useEffect, useRef, useState } from 'react';
import { X, Check, Folder } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isEscapeFromWidgetInput } from '@/utils/domHelpers';

// Curated 10-color palette for Collection accents. Anchored on the SpartBoard
// brand pair (blue + red) plus 8 Tailwind-600 shades chosen for good
// contrast on the white BoardCard background and visual distinguishability
// across warm/cool/neutral. Kept narrow on purpose — wider palettes look
// busy in the modal and don't help teachers organize.
//
// The `name` is announced by screen readers via aria-label, which is what
// makes the swatch grid usable for keyboard / AT users (raw hex is meaningless
// out loud). The order here is the visual order in the grid.
const COLLECTION_COLOR_PRESETS: { hex: string; name: string }[] = [
  { hex: '#2d3f89', name: 'Brand Blue' },
  { hex: '#ad2122', name: 'Brand Red' },
  { hex: '#d97706', name: 'Amber' },
  { hex: '#059669', name: 'Emerald' },
  { hex: '#0284c7', name: 'Sky' },
  { hex: '#7c3aed', name: 'Violet' },
  { hex: '#db2777', name: 'Pink' },
  { hex: '#0d9488', name: 'Teal' },
  { hex: '#ea580c', name: 'Orange' },
  { hex: '#475569', name: 'Slate' },
];

interface CollectionColorPickerProps {
  collectionName: string;
  currentColor?: string;
  onSelect: (color: string) => void;
  onClose: () => void;
}

const sameColor = (a: string | undefined, b: string): boolean =>
  Boolean(a && a.toLowerCase() === b.toLowerCase());

export const CollectionColorPicker: React.FC<CollectionColorPickerProps> = ({
  collectionName,
  currentColor,
  onSelect,
  onClose,
}) => {
  const { t } = useTranslation();
  // Seed the native color input with the current color so the wheel opens
  // on that hue instead of black. Falls back to the brand blue.
  const [customColor, setCustomColor] = useState(currentColor ?? '#2d3f89');
  // Focus seed — points at the first swatch button so keyboard users can
  // immediately Tab through the picker (and aria-modal users know where
  // they are) instead of focus dropping to document.body.
  const firstSwatchRef = useRef<HTMLButtonElement>(null);

  // Whether the current color is one of the presets — used to decide if
  // the custom-color input should show the active ring.
  const customIsActive =
    !!currentColor &&
    !COLLECTION_COLOR_PRESETS.some((c) => sameColor(currentColor, c.hex));

  // Synchronize Escape-to-close with the picker's open lifecycle. Capture
  // phase + stopImmediatePropagation so the picker wins over the parent
  // BoardsModal's own document-level Escape handler — without this, a
  // single Escape would close both surfaces (the modal's handler fires
  // first because it mounted first). Listening on `document` rather than
  // the dialog itself catches presses even when focus briefly escapes the
  // dialog tree (e.g. native color-input wheel popups).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEscapeFromWidgetInput(e)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [onClose]);

  // Seed focus inside the dialog so keyboard users land in the picker
  // rather than wherever they were in the host modal. Empty deps —
  // this is mount-time focus only, not a reaction to prop changes.
  useEffect(() => {
    firstSwatchRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-modal-nested bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="collection-color-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-slate-100">
          <h3
            id="collection-color-title"
            className="text-sm font-bold text-slate-800"
          >
            {t('boardsModal.colorPicker.title', {
              defaultValue: 'Collection color',
            })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', { defaultValue: 'Close' })}
            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Folder
              className="w-3.5 h-3.5"
              style={currentColor ? { color: currentColor } : undefined}
            />
            <span className="font-bold truncate">{collectionName}</span>
          </div>

          <div>
            <div className="text-xxs font-bold uppercase tracking-widest text-slate-500 mb-2">
              {t('boardsModal.colorPicker.swatches', {
                defaultValue: 'Pick a color',
              })}
            </div>
            <div className="grid grid-cols-5 gap-2">
              {COLLECTION_COLOR_PRESETS.map((swatch, idx) => {
                const isActive = sameColor(currentColor, swatch.hex);
                return (
                  <button
                    key={swatch.hex}
                    ref={idx === 0 ? firstSwatchRef : undefined}
                    type="button"
                    onClick={() => onSelect(swatch.hex)}
                    className={`h-9 w-9 rounded-lg border-2 transition flex items-center justify-center hover:scale-110 motion-reduce:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${
                      isActive
                        ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter'
                        : 'border-slate-200'
                    }`}
                    style={{ backgroundColor: swatch.hex }}
                    aria-label={`Set color to ${swatch.name}`}
                    aria-pressed={isActive}
                  >
                    {isActive && <Check className="w-4 h-4 text-white" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-xxs font-bold uppercase tracking-widest text-slate-500 mb-2">
              {t('boardsModal.colorPicker.custom', { defaultValue: 'Custom' })}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                className={`h-9 w-12 rounded-md border-2 bg-white cursor-pointer ${
                  customIsActive
                    ? 'border-brand-blue-primary'
                    : 'border-slate-200'
                }`}
                aria-label="Custom color"
              />
              <button
                type="button"
                onClick={() => onSelect(customColor)}
                className="flex-1 px-3 py-2 text-xxs font-black uppercase tracking-widest text-white bg-brand-blue-primary hover:bg-brand-blue-dark rounded-lg transition-colors"
              >
                {t('boardsModal.colorPicker.applyCustom', {
                  defaultValue: 'Apply custom',
                })}
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-bold text-slate-600 hover:text-slate-800"
          >
            {t('common.done', { defaultValue: 'Done' })}
          </button>
        </div>
      </div>
    </div>
  );
};
