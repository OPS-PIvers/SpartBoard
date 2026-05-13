import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  Clock,
  Info,
  LogOut,
  Menu,
  RotateCcw,
  School,
} from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { formatExpiresAt } from './subsView';

interface SubProfileToolbarProps {
  teacherName: string;
  teacherInitials: string;
  accentColor: string;
  boardName: string;
  expiresAt: number;
  onReset: () => void;
  onBackToDirectory: () => void;
  onChangeBuilding: () => void;
}

export const SubProfileToolbar: React.FC<SubProfileToolbarProps> = ({
  teacherName,
  teacherInitials,
  accentColor,
  boardName,
  expiresAt,
  onReset,
  onBackToDirectory,
  onChangeBuilding,
}) => {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="fixed top-4 left-4 z-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-3 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-xl border border-white/25 shadow-lg shadow-black/20 px-3 py-2 transition-all cursor-pointer"
      >
        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/80">
          <Menu className="w-4 h-4" />
        </div>
        <div
          className={`w-7 h-7 rounded-full ${accentColor} flex items-center justify-center text-white font-bold text-[11px]`}
        >
          {teacherInitials}
        </div>
        <div className="text-left pr-1 hidden sm:block">
          <div className="text-xs font-bold text-white leading-tight">
            {teacherName}
          </div>
          <div className="text-[10px] text-white/70 leading-tight truncate max-w-[12rem]">
            {boardName}
          </div>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-white/70 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="mt-2 w-72 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/40 font-medium">
              <Info className="w-3 h-3" />
              About this share
            </div>
            <div className="mt-1.5 text-sm font-bold text-white">
              {teacherName}
            </div>
            <div className="text-xs text-white/60">{boardName}</div>
            <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-amber-300/90">
              <Clock className="w-3 h-3" />
              {formatExpiresAt(expiresAt)}
            </div>
          </div>

          <div className="py-1">
            <MenuItem
              icon={RotateCcw}
              label="Reset board"
              description="Return widgets to their starting state"
              onClick={() => {
                onReset();
                setOpen(false);
              }}
            />
            <MenuItem
              icon={ArrowLeft}
              label="Back to teacher list"
              description="Pick a different board in this building"
              onClick={() => {
                onBackToDirectory();
                setOpen(false);
              }}
            />
            <MenuItem
              icon={School}
              label="Change building"
              description="Switch to a different building"
              onClick={() => {
                onChangeBuilding();
                setOpen(false);
              }}
            />
          </div>

          <div className="border-t border-white/10 py-1">
            <MenuItem
              icon={LogOut}
              label="Sign out"
              description={user?.email ?? ''}
              danger
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

interface MenuItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  danger?: boolean;
  onClick: () => void;
}

const MenuItem: React.FC<MenuItemProps> = ({
  icon: Icon,
  label,
  description,
  danger,
  onClick,
}) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer ${
      danger
        ? 'text-red-300 hover:bg-red-500/10'
        : 'text-white/90 hover:bg-white/5'
    }`}
  >
    <Icon className="w-4 h-4 mt-0.5 shrink-0" />
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium leading-tight">{label}</div>
      <div className="text-[11px] text-white/50 leading-tight mt-0.5">
        {description}
      </div>
    </div>
  </button>
);
