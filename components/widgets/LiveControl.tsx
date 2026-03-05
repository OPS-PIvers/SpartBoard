import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Cast, Snowflake, X, Trash2 } from 'lucide-react';
import { LiveStudent } from '../../types';
import { useClickOutside } from '../../hooks/useClickOutside';
import { Z_INDEX } from '../../config/zIndex';

interface LiveControlProps {
  isLive: boolean;
  studentCount: number;
  students: LiveStudent[];
  code?: string;
  joinUrl?: string;
  onToggleLive: () => void;
  onFreezeStudent: (
    id: string,
    status: 'active' | 'frozen' | 'disconnected'
  ) => void;
  onRemoveStudent: (id: string) => void;
  onFreezeAll: () => void;
}

const MENU_WIDTH = 256; // Width in pixels (w-64 in Tailwind = 16rem = 256px)

export const LiveControl: React.FC<LiveControlProps> = ({
  isLive,
  studentCount,
  students,
  code,
  joinUrl,
  onToggleLive,
  onFreezeStudent,
  onRemoveStudent,
  onFreezeAll,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  // Calculate menu position when opening
  const handleToggleMenu = () => {
    if (!showMenu && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const horizontalMargin = 8; // pixels

      // Initial position aligns the menu's right edge with the button's right edge
      let left = rect.right - MENU_WIDTH;

      // Clamp to keep menu within viewport bounds
      const maxLeft = viewportWidth - MENU_WIDTH - horizontalMargin;
      if (left < horizontalMargin) {
        left = horizontalMargin;
      } else if (left > maxLeft) {
        left = maxLeft;
      }

      const newPosition = {
        top: rect.bottom + 8,
        left,
      };
      setMenuPosition(newPosition);
      setShowMenu(true);
    } else {
      setShowMenu(false);
    }
  };

  // Close menu when clicking outside
  useClickOutside(menuRef, () => {
    if (showMenu) setShowMenu(false);
  }, [buttonRef]);

  // Trap focus within the menu when open
  useEffect(() => {
    if (!showMenu || !menuRef.current) return undefined;

    const focusableElements = menuRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    // If no focusable elements, the menu will have no interactive content
    // and focus should remain on the button. We don't need to trap focus.
    if (focusableElements.length === 0) {
      return undefined;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowMenu(false);
        buttonRef.current?.focus();
        return;
      }

      if (event.key !== 'Tab') return;

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    firstElement?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showMenu]);

  // BUTTON UI (extracted for consistency)
  const ActionButtons = (
    <div className="flex items-center gap-1.5 relative">
      <button
        onClick={onToggleLive}
        aria-label={isLive ? 'End live session' : 'Start live session'}
        className={`
          flex items-center justify-center p-1.5 rounded-full transition-all
          ${
            isLive
              ? 'bg-red-500 text-white shadow-lg animate-pulse'
              : 'hover:bg-slate-800/10 text-slate-600'
          }
        `}
      >
        <Cast size={14} />
      </button>

      {isLive && (
        <button
          ref={buttonRef}
          onClick={handleToggleMenu}
          aria-label={`View ${studentCount} connected student${studentCount !== 1 ? 's' : ''} and session controls`}
          className="w-7 h-7 bg-slate-950/40 hover:bg-slate-950/60 text-white rounded-full flex items-center justify-center transition-all"
        >
          <span className="text-xxs ">{studentCount}</span>
        </button>
      )}
    </div>
  );

  // POPOUT MENU - Rendered as Portal
  if (
    !showMenu ||
    !isLive ||
    !menuPosition ||
    typeof document === 'undefined'
  ) {
    return ActionButtons;
  }

  return (
    <>
      {ActionButtons}

      {/* POPOUT MENU - Rendered as Portal */}
      {createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            zIndex: Z_INDEX.modal,
          }}
          className="w-64 bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col animate-in fade-in slide-in-from-top-2"
        >
          <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-xl">
            <span className="text-xs  text-slate-700 uppercase tracking-wider">
              Classroom ({studentCount})
            </span>
            <button
              onClick={() => setShowMenu(false)}
              aria-label="Close menu"
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 transition-shadow"
            >
              <X size={14} className="text-slate-400 hover:text-slate-600" />
            </button>
          </div>

          {/* SESSION INFO */}
          {code && (
            <div className="p-3 bg-indigo-50 border-b border-indigo-100 flex flex-col items-center gap-1">
              <div className="text-xxs  text-indigo-400 uppercase tracking-wider">
                Join Code
              </div>
              <div className="text-2xl  text-indigo-600 font-mono tracking-widest">
                {code}
              </div>
              <div className="text-xxs text-indigo-400">
                {joinUrl?.replace(/^https?:\/\//, '')}
              </div>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto p-1">
            {students.length === 0 && (
              <div className="p-4 text-center text-xs text-slate-400">
                Waiting for students to join...
              </div>
            )}
            {students.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg group transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${s.status === 'active' ? 'bg-green-500' : 'bg-blue-400'}`}
                  ></div>
                  <span
                    className={`text-xs  truncate max-w-[100px] font-mono ${s.status === 'frozen' ? 'text-blue-400 line-through' : 'text-slate-700'}`}
                  >
                    PIN {s.pin}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => onFreezeStudent(s.id, s.status)}
                    className={`p-1 rounded hover:bg-blue-50 ${s.status === 'frozen' ? 'text-blue-600' : 'text-slate-300 hover:text-blue-500'}`}
                    aria-label={
                      s.status === 'frozen'
                        ? `Unfreeze PIN ${s.pin}`
                        : `Freeze PIN ${s.pin}`
                    }
                  >
                    <Snowflake size={14} />
                  </button>
                  <button
                    onClick={() => onRemoveStudent(s.id)}
                    className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Remove PIN ${s.pin}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="p-2 border-t border-slate-100 bg-slate-50 rounded-b-xl">
            <button
              onClick={onFreezeAll}
              aria-pressed={
                students.length > 0 &&
                students.every((s) => s.status === 'frozen')
              }
              aria-label={
                students.length > 0 &&
                students.every((s) => s.status === 'frozen')
                  ? 'Unfreeze all students'
                  : 'Freeze all students'
              }
              className="w-full flex items-center justify-center gap-2 py-2 bg-blue-100 text-blue-700 rounded-lg text-xxs  uppercase hover:bg-blue-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-50"
            >
              <Snowflake size={12} /> Freeze / Unfreeze All
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
