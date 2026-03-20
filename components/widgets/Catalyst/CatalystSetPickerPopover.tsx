import React, { useRef, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ImageOff } from 'lucide-react';
import { useCatalystSets } from '@/hooks/useCatalystSets';
import { useClickOutside } from '@/hooks/useClickOutside';
import { GlassCard } from '@/components/common/GlassCard';
import { GlobalStyle } from '@/types';
import { isSafeIconUrl } from '@/components/widgets/Catalyst/catalystHelpers';
import { Z_INDEX } from '@/config/zIndex';

interface Props {
  anchorRect: DOMRect;
  globalStyle: GlobalStyle;
  onSelectSet: (setId: string) => void;
  onClose: () => void;
  buttonRef?: RefObject<HTMLElement | null>;
}

export const CatalystSetPickerPopover: React.FC<Props> = ({
  anchorRect,
  globalStyle,
  onSelectSet,
  onClose,
  buttonRef,
}) => {
  const { sets, loading } = useCatalystSets();
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, onClose, buttonRef ? [buttonRef] : []);

  const bottom = window.innerHeight - anchorRect.top + 10;
  const left = anchorRect.left + anchorRect.width / 2;

  return createPortal(
    <GlassCard
      globalStyle={globalStyle}
      ref={menuRef}
      style={{
        position: 'fixed',
        left,
        bottom,
        transform: 'translateX(-50%)',
        zIndex: Z_INDEX.popover,
      }}
      className="overflow-hidden animate-in slide-in-from-bottom-2 duration-200"
    >
      <div className="px-3 py-2 border-b border-white/30">
        <span className="text-xxs font-black uppercase text-slate-600 tracking-wider">
          Choose a Set
        </span>
      </div>

      <div className="p-2 overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center w-64 h-20 text-slate-500 text-xs">
            Loading…
          </div>
        ) : sets.length === 0 ? (
          <div className="flex items-center justify-center w-64 h-20 text-slate-500 text-xs">
            No sets configured.
          </div>
        ) : (
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${sets.length}, 120px)`,
              gap: '8px',
            }}
          >
            {sets.map((set) => (
              <button
                key={set.id}
                onClick={() => {
                  onSelectSet(set.id);
                }}
                disabled={set.routines.length === 0 && !set.title}
                className="relative rounded-xl overflow-hidden flex flex-col items-stretch text-left shadow-md hover:scale-[1.04] hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 bg-slate-200 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
                style={{ width: 120, height: 160 }}
              >
                {set.imageUrl && isSafeIconUrl(set.imageUrl) ? (
                  <>
                    <img
                      src={set.imageUrl}
                      alt={set.title}
                      className="absolute inset-0 w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-300 border-2 border-dashed border-slate-400">
                    <ImageOff className="w-6 h-6 text-slate-500" />
                  </div>
                )}

                <div
                  className="relative mt-auto z-10 flex flex-col"
                  style={{
                    padding: '8px 10px',
                    background:
                      'linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0.4))',
                  }}
                >
                  <span className="font-black uppercase tracking-widest text-white drop-shadow text-center leading-tight truncate text-xs">
                    {set.title || 'Empty Set'}
                  </span>
                  <span className="text-indigo-200 font-bold text-center mt-0.5 text-xxs">
                    {set.routines.length} ROUTINE
                    {set.routines.length !== 1 ? 'S' : ''}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </GlassCard>,
    document.body
  );
};
