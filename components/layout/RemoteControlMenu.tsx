import React, { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDashboard } from '../../context/useDashboard';
import { Smartphone, ExternalLink } from 'lucide-react';
import { Z_INDEX } from '../../config/zIndex';
import { Toggle } from '../common/Toggle';

interface Props {
  onClose: () => void;
  anchorRect?: DOMRect | null;
}

const RemoteControlMenu: React.FC<Props> = ({ onClose, anchorRect }) => {
  const { activeDashboard, updateDashboardSettings } = useDashboard();
  const menuRef = useRef<HTMLDivElement>(null);

  const enabled = activeDashboard?.settings?.remoteControlEnabled ?? true;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        anchorRect
      ) {
        const isClickOnAnchor =
          event.clientX >= anchorRect.left &&
          event.clientX <= anchorRect.right &&
          event.clientY >= anchorRect.top &&
          event.clientY <= anchorRect.bottom;

        if (!isClickOnAnchor) {
          onClose();
        }
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, anchorRect]);

  if (!anchorRect) return null;

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: anchorRect.left + anchorRect.width / 2,
    bottom: window.innerHeight - anchorRect.top + 10,
    transform: 'translateX(-50%)',
    zIndex: Z_INDEX.modalNested,
  };

  return createPortal(
    <div
      ref={menuRef}
      style={menuStyle}
      role="dialog"
      aria-label="Remote Control Menu"
      className="w-72 bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-200"
    >
      <div className="p-3 bg-slate-50 border-b flex items-center justify-between">
        <span className="font-bold text-xs text-slate-500 uppercase flex items-center gap-2">
          <Smartphone size={14} /> Remote Control
        </span>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-700">
              Enable Remote
            </div>
            <div className="text-xs text-slate-500 mt-0.5 pr-4">
              Allow mobile devices to control this board.
            </div>
          </div>
          <Toggle
            checked={enabled}
            onChange={(val) =>
              updateDashboardSettings({ remoteControlEnabled: val })
            }
          />
        </div>
      </div>

      <div className="p-2 border-t bg-slate-50">
        <button
          onClick={() => {
            window.open('/remote', '_blank');
            onClose();
          }}
          className="w-full bg-slate-800 text-white py-2 rounded text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-700 transition-colors"
        >
          <ExternalLink size={14} /> Open Remote View
        </button>
      </div>

      {/* Little arrow at the bottom */}
      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-r border-b border-slate-200 transform rotate-45"></div>
    </div>,
    document.body
  );
};

export default RemoteControlMenu;
