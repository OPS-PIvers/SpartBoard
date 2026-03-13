import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDashboard } from '../../context/useDashboard';
import { Smartphone, ExternalLink, Copy, Check } from 'lucide-react';
import { Z_INDEX } from '../../config/zIndex';
import { Toggle } from '../common/Toggle';

interface Props {
  onClose: () => void;
  anchorRect?: DOMRect | null;
}

const RemoteControlMenu: React.FC<Props> = ({ onClose, anchorRect }) => {
  const { activeDashboard, updateDashboardSettings } = useDashboard();
  const menuRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const enabled = activeDashboard?.settings?.remoteControlEnabled ?? true;
  const remoteUrl = window.location.origin + '/remote';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
    remoteUrl
  )}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(remoteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

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

        {enabled && (
          <div className="space-y-4 pt-2 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 shadow-inner">
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <img
                  src={qrUrl}
                  alt="Remote QR Code"
                  className="w-32 h-32 object-contain"
                />
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Scan to Control Board
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 flex items-center justify-between gap-2 overflow-hidden group hover:border-slate-300 transition-colors">
                <span className="text-[10px] font-mono text-slate-400 truncate">
                  {remoteUrl}
                </span>
                <button
                  onClick={handleCopyLink}
                  className={`shrink-0 p-1 rounded-md transition-all ${
                    copied
                      ? 'bg-green-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
                  }`}
                  title="Copy Remote Link"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          </div>
        )}
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
