import React, {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Z_INDEX } from '@/config/zIndex';
import { filterStaff, useStaffDirectory } from '@/hooks/useStaffDirectory';

type InputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'role'
>;

interface StaffEmailInputProps extends InputProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Org whose staff directory feeds the suggestions; null turns them off. */
  orgId: string | null | undefined;
  /** Lowercase emails to leave out, such as current members. */
  exclude?: ReadonlySet<string>;
  /** Classes for the wrapper that positions the suggestion list. */
  wrapperClassName?: string;
  /** Rendered inside the wrapper before the input, e.g. a leading icon. */
  leading?: React.ReactNode;
}

const NO_EXCLUDE: ReadonlySet<string> = new Set();

/** Email input that suggests staff from the org directory as you type. */
export const StaffEmailInput: React.FC<StaffEmailInputProps> = ({
  value,
  onValueChange,
  orgId,
  exclude = NO_EXCLUDE,
  wrapperClassName = 'relative',
  leading,
  onFocus,
  onBlur,
  onKeyDown,
  ...inputProps
}) => {
  const { t } = useTranslation();
  const listId = useId();
  const { staff, load } = useStaffDirectory(orgId);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const matches = useMemo(
    () => (orgId ? filterStaff(staff, value, exclude) : []),
    [orgId, staff, value, exclude]
  );
  const showList = open && matches.length > 0;
  const active = Math.min(activeIndex, matches.length - 1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Portaled so a modal's overflow can't clip it; follows the input on scroll and resize.
  useLayoutEffect(() => {
    if (!showList) return;
    const place = () => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (rect)
        setAnchor({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [showList]);

  const pick = (email: string) => {
    onValueChange(email);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showList) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((active + 1) % matches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((active - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === 'Enter') {
        const choice = matches[active];
        if (choice) {
          e.preventDefault();
          pick(choice.email);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div ref={wrapperRef} className={wrapperClassName}>
      {leading}
      <input
        {...inputProps}
        type="email"
        {...(orgId
          ? {
              role: 'combobox',
              'aria-autocomplete': 'list' as const,
              'aria-expanded': showList,
              'aria-controls': showList ? listId : undefined,
              'aria-activedescendant': showList
                ? `${listId}-opt-${active}`
                : undefined,
              autoComplete: 'off',
            }
          : {})}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={(e) => {
          if (orgId) load();
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setOpen(false);
          onBlur?.(e);
        }}
        onKeyDown={handleKeyDown}
      />
      {showList &&
        anchor &&
        createPortal(
          <ul
            id={listId}
            role="listbox"
            aria-label={t('staffEmailInput.listLabel', {
              defaultValue: 'Staff emails',
            })}
            style={{
              position: 'fixed',
              top: anchor.top,
              left: anchor.left,
              width: anchor.width,
              zIndex: Z_INDEX.modalNestedContent,
            }}
            className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg py-1 text-left"
          >
            {matches.map((entry, index) => (
              <li
                key={entry.email}
                id={`${listId}-opt-${index}`}
                role="option"
                aria-selected={index === active}
                // mousedown keeps focus in the input so blur doesn't close the list first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(entry.email);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`cursor-pointer px-3 py-1.5 ${
                  index === active ? 'bg-brand-blue-primary/10' : ''
                }`}
              >
                {entry.name && (
                  <div className="text-sm font-semibold text-slate-800 break-words">
                    {entry.name}
                  </div>
                )}
                <div
                  className={
                    entry.name
                      ? 'text-xs text-slate-500 break-all'
                      : 'text-sm text-slate-800 break-all'
                  }
                >
                  {entry.email}
                </div>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
};
