import { useEffect, useLayoutEffect, useRef, useState, type FC } from 'react';
import type { LucideIcon } from 'lucide-react';

export const RowActionButton: FC<{
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}> = ({ icon: Icon, label, onClick }) => (
  <button
    type="button"
    tabIndex={-1}
    aria-label={label}
    title={label}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className="flex h-7 w-7 items-center justify-center rounded-md text-white/70 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
  >
    <Icon className="w-3.5 h-3.5" aria-hidden="true" />
  </button>
);

interface InlineNameInputProps {
  initialValue?: string;
  placeholder: string;
  ariaLabel: string;
  /** Rename saves on blur; create discards so a stray click never makes a board. */
  commitOnBlur: boolean;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

export const InlineNameInput: FC<InlineNameInputProps> = ({
  initialValue = '',
  placeholder,
  ariaLabel,
  commitOnBlur,
  onCommit,
  onCancel,
}) => {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);
  const latestRef = useRef({ value, initialValue, commitOnBlur, onCommit });
  useLayoutEffect(() => {
    latestRef.current = { value, initialValue, commitOnBlur, onCommit };
  });

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    // An outside click unmounts the menu without a blur; still save a changed rename.
    return () => {
      const latest = latestRef.current;
      const trimmed = latest.value.trim();
      if (doneRef.current || !latest.commitOnBlur) return;
      if (!trimmed || trimmed === latest.initialValue) return;
      doneRef.current = true;
      latest.onCommit(trimmed);
    };
  }, []);

  const finish = (commit: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    const trimmed = value.trim();
    if (commit && trimmed && trimmed !== initialValue) onCommit(trimmed);
    else onCancel();
  };

  return (
    <div data-menu-row className="flex items-center px-2 py-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        maxLength={100}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // Keep caret keys and Escape away from the menu's own key handling.
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            finish(false);
          }
        }}
        onBlur={() => finish(commitOnBlur)}
        className="min-w-0 flex-1 rounded-lg border border-white/30 bg-slate-800 px-2 py-1.5 text-sm text-white placeholder:text-slate-400 selection:bg-white/30 selection:text-white focus:outline-none focus:ring-2 focus:ring-white/50"
      />
    </div>
  );
};
