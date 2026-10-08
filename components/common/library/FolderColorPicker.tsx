import React from 'react';
import { Check } from 'lucide-react';
import type { LibraryFolderColor } from '@/types';
import { FOLDER_COLORS } from './folderColors';

interface FolderColorPickerProps {
  value: LibraryFolderColor | null | undefined;
  onChange: (color: LibraryFolderColor | null) => void;
}

/** Colour row for a folder's "…" menu: no colour, then the eight palette swatches. */
export const FolderColorPicker: React.FC<FolderColorPickerProps> = ({
  value,
  onChange,
}) => {
  const current = value ?? null;
  const swatch = (
    id: LibraryFolderColor | null,
    label: string,
    fill: string
  ): React.ReactNode => {
    const selected = current === id;
    return (
      <button
        key={id ?? 'none'}
        type="button"
        role="menuitemradio"
        aria-checked={selected}
        aria-label={label}
        title={label}
        onClick={() => onChange(id)}
        className={`flex items-center justify-center w-5 h-5 rounded-full ${fill} ${
          selected
            ? 'ring-2 ring-offset-1 ring-brand-blue-primary'
            : 'hover:ring-2 hover:ring-offset-1 hover:ring-slate-300'
        }`}
      >
        {selected && (
          <Check
            className={`w-3 h-3 ${id ? 'text-white' : 'text-slate-500'}`}
            strokeWidth={3}
            aria-hidden="true"
          />
        )}
      </button>
    );
  };

  return (
    <div className="px-2.5 pt-1.5 pb-2">
      <div className="text-xs text-slate-500 mb-1.5">Color</div>
      <div
        role="group"
        aria-label="Folder color"
        className="grid grid-cols-5 gap-1.5"
      >
        {swatch(null, 'No color', 'bg-white border border-slate-300')}
        {FOLDER_COLORS.map((c) => swatch(c.id, c.label, c.swatch))}
      </div>
    </div>
  );
};
