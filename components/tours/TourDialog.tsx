import React, { useEffect, useRef } from 'react';
import { Z_INDEX } from '@/config/zIndex';
import { chromeSurface } from '@/components/common/lightChrome';
import { Sparty } from '@/components/sparty/Sparty';
import type { SpartyPose } from '@/components/sparty/spartyFrames';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  title: string;
  body: string;
  /** Buttons; the one marked `data-autofocus` takes focus when the dialog opens. */
  children: React.ReactNode;
  /** Sparty beside the text, when the caller has checked `useShowSparty`. */
  sparty?: SpartyPose;
}

/** A modal tour prompt that traps Tab and hands focus back when it closes. */
export const TourDialog: React.FC<Props> = ({
  title,
  body,
  children,
  sparty,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const first =
      root.querySelector<HTMLElement>('[data-autofocus]') ??
      root.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  const trapTab = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !ref.current) return;
    const items = Array.from(
      ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const current = document.activeElement;
    if (e.shiftKey && (current === first || !ref.current.contains(current))) {
      e.preventDefault();
      last.focus();
    } else if (
      !e.shiftKey &&
      (current === last || !ref.current.contains(current))
    ) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-dialog-title"
      onKeyDown={trapTab}
      className="fixed inset-0 flex items-center justify-center bg-slate-950/55 p-4"
      style={{ zIndex: Z_INDEX.tourCallout }}
    >
      <div className={`w-full max-w-sm rounded-2xl p-5 ${chromeSurface}`}>
        <div className="flex items-start gap-3">
          {sparty && (
            <Sparty pose={sparty} size={64} decorative className="shrink-0" />
          )}
          <div className="min-w-0">
            <h2 id="tour-dialog-title" className="text-base font-bold">
              {title}
            </h2>
            {body && (
              <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
                {body}
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">{children}</div>
      </div>
    </div>
  );
};
