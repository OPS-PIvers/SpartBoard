// Gear menu on the rubric grading panel: the teacher's saved grading preferences.
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Settings } from 'lucide-react';
import type { RubricLevelOrder } from '@/types';
import { useClickOutside } from '@/hooks/useClickOutside';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { tourTypeAttr } from '@/config/tourAnchors';
import { Z_INDEX } from '@/config/zIndex';

const GAP = 4;
const EDGE = 8;

// Right-aligns the menu under the gear, flips it above when there's no room below, and keeps it on screen.
function placeMenu(trigger: HTMLElement, menu: HTMLElement): boolean {
  const t = trigger.getBoundingClientRect();
  if (!gearVisible(trigger, t)) return false;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  const left = Math.min(Math.max(EDGE, t.right - w), vw - w - EDGE);
  const below = t.bottom + GAP;
  const above = t.top - GAP - h;
  const top =
    below + h <= vh - EDGE || above < EDGE
      ? Math.max(EDGE, Math.min(below, vh - h - EDGE))
      : above;
  menu.style.left = `${Math.max(EDGE, left)}px`;
  menu.style.top = `${top}px`;
  return true;
}

// False once the gear has scrolled out of any clipping ancestor, so the menu doesn't float over the header.
function gearVisible(trigger: HTMLElement, t: DOMRect): boolean {
  for (let el = trigger.parentElement; el; el = el.parentElement) {
    if (!/auto|scroll|hidden|clip/.test(getComputedStyle(el).overflowY))
      continue;
    const r = el.getBoundingClientRect();
    if (t.bottom <= r.top || t.top >= r.bottom) return false;
  }
  return true;
}

interface RubricGradingSettingsProps {
  order: RubricLevelOrder;
  onOrderChange: (order: RubricLevelOrder) => void;
  autoAdvance: boolean;
  onAutoAdvanceChange: (on: boolean) => void;
  openNext: boolean;
  onOpenNextChange: (on: boolean) => void;
}

const SwitchRow: React.FC<{
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  anchor: ReturnType<typeof tourTypeAttr>;
  disabled?: boolean;
}> = ({ label, checked, onChange, anchor, disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    {...anchor}
    className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-blue-primary"
  >
    {label}
    <span
      aria-hidden
      className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-brand-blue-primary' : 'bg-slate-300'
      }`}
    >
      <span
        className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4.5' : 'translate-x-0.5'
        }`}
      />
    </span>
  </button>
);

export const RubricGradingSettings: React.FC<RubricGradingSettingsProps> = ({
  order,
  onOrderChange,
  autoAdvance,
  onAutoAdvanceChange,
  openNext,
  onOpenNextChange,
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const ignoreRefs = useMemo(() => [menuRef], []);
  useClickOutside(wrapRef, () => setOpen(false), ignoreRefs);

  // The menu is portalled out of the panel so the grader's scroll panes can't clip it; follow the gear on scroll and resize.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = (): void => {
      if (!buttonRef.current || !menuRef.current) return;
      if (!placeMenu(buttonRef.current, menuRef.current)) setOpen(false);
    };
    place();
    let frame = 0;
    const schedule = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(schedule);
    if (menuRef.current) observer?.observe(menuRef.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  const focusables = (): HTMLElement[] =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled):not([tabindex="-1"])'
      ) ?? []
    );

  // The portal sits at the end of <body>, so carry Tab between the gear and the menu by hand.
  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open || e.key !== 'Tab' || e.shiftKey) return;
    const first = focusables()[0];
    if (!first) return;
    e.preventDefault();
    first.focus();
  };

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const items = focusables();
    const atEdge = e.shiftKey
      ? document.activeElement === items[0]
      : document.activeElement === items[items.length - 1];
    if (!atEdge) return;
    setOpen(false);
    buttonRef.current?.focus();
    // Shift+Tab lands on the gear; forward Tab lets the browser carry on from the gear.
    if (e.shiftKey) e.preventDefault();
  };

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        {...tourTypeAttr('quiz-grading.rubric-settings', 'quiz')}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Rubric settings"
        title="Rubric settings"
        className={`touch-target-expand flex h-8 w-7 items-center justify-center rounded-md transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-brand-blue-primary ${
          open ? 'bg-slate-100 text-slate-700' : 'text-slate-500'
        }`}
      >
        <Settings className="h-4 w-4" aria-hidden />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="dialog"
            aria-label="Rubric settings"
            data-click-outside-ignore="true"
            onKeyDown={onMenuKeyDown}
            style={{
              position: 'fixed',
              zIndex: Z_INDEX.popover,
            }}
            className="w-80 max-w-[calc(100vw-1rem)] divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <SwitchRow
              label="Auto-advance to next category"
              checked={autoAdvance}
              onChange={onAutoAdvanceChange}
              anchor={tourTypeAttr('quiz-grading.rubric-auto-advance', 'quiz')}
            />
            <SwitchRow
              label="Auto-open next category"
              disabled={!autoAdvance}
              checked={autoAdvance && openNext}
              onChange={onOpenNextChange}
              anchor={tourTypeAttr('quiz-grading.rubric-open-next', 'quiz')}
            />
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="whitespace-nowrap text-sm font-semibold text-slate-800">
                Level order
              </span>
              <SegmentedControl<RubricLevelOrder>
                role="radiogroup"
                ariaLabel="Level order"
                value={order}
                onChange={onOrderChange}
                anchor={tourTypeAttr('quiz-grading.rubric-order', 'quiz')}
                options={[
                  { value: 'high-first', label: 'Highest' },
                  { value: 'low-first', label: 'Lowest' },
                ]}
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
