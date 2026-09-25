import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, MessageSquare } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { Z_INDEX } from '@/config/zIndex';
import { usePopoverPosition } from './usePopoverPosition';

// ─── WelcomeChip (compact "Welcome: On/Off ▾" with a textarea popover) ───────

interface WelcomeChipProps {
  enabled: boolean;
  message: string;
  onEnabledChange: (next: boolean) => void;
  onMessageChange: (next: string) => void;
}

/**
 * Compact chip that surfaces the welcome-screen toggle + message
 * textarea in a popover instead of an always-visible block. Same
 * dismiss-on-outside-click contract as `SettingChip`. Keeping the
 * textarea in a popover lets the editor body stay short — the image
 * canvas keeps its real estate even when a welcome message is set.
 */
const WELCOME_CHIP_POPOVER_WIDTH = 320;

export const WelcomeChip: React.FC<WelcomeChipProps> = ({
  enabled,
  message,
  onEnabledChange,
  onMessageChange,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, () => setOpen(false), [popoverRef]);

  const trimmed = message.trim();
  // The chip's status mirrors what the student app actually does at
  // render time: an enabled toggle without content falls back to the
  // default subtitle, so we surface it as "Off" here too.
  const status = enabled && trimmed.length > 0 ? 'On' : 'Off';
  const pos = usePopoverPosition(open, triggerRef, WELCOME_CHIP_POPOVER_WIDTH);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Welcome screen — customize what students see before they start"
        aria-label={`Welcome screen: ${status}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-bold whitespace-nowrap transition-colors ${
          open || status === 'On'
            ? 'border-brand-blue-primary bg-brand-blue-primary/10 text-brand-blue-primary'
            : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
        }`}
      >
        <MessageSquare
          className="w-3.5 h-3.5 text-slate-500"
          aria-hidden="true"
        />
        <span>{status}</span>
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>
      {open &&
        pos &&
        typeof document !== 'undefined' &&
        // Portal'd to document.body so the popover escapes the modal
        // body's `overflow-hidden` and the chip row's `overflow-x-auto`.
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Welcome screen settings"
            data-click-outside-ignore="true"
            data-widget-portal=""
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: WELCOME_CHIP_POPOVER_WIDTH,
              zIndex: Z_INDEX.modalContent,
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.nativeEvent.stopImmediatePropagation();
                // Also stop React's synthetic bubble: this popover renders in
                // the widget settings panel wrapped by DraggableWindow's
                // onKeyDown, whose flipped-close branch would otherwise fire and
                // close the whole settings panel along with this popover.
                e.stopPropagation();
                setOpen(false);
              }
            }}
          >
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => onEnabledChange(e.target.checked)}
                className="accent-brand-blue-primary w-4 h-4 mt-0.5"
              />
              <span className="font-bold text-xs">Show welcome screen</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => onMessageChange(e.target.value)}
              disabled={!enabled}
              rows={3}
              placeholder="What should students know before they begin?"
              className="mt-2 w-full bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 focus:border-brand-blue-primary px-3 py-2 text-sm resize-none disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>,
          document.body
        )}
    </div>
  );
};
