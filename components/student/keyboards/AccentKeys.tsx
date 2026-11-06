// Accent keys under a student's answer boxes; each key types into the box last focused in the area.
import React, { useRef, useState } from 'react';
import { ArrowBigUp } from 'lucide-react';
import { accentSet, shiftedKey } from '@/config/studentKeyboards';
import type { AccentSetId } from '@/types';
import { insertAtCursor, isTypingTarget } from './insertAtCursor';

export const AccentKeysArea: React.FC<{
  accents: AccentSetId | undefined;
  disabled?: boolean;
  light?: boolean;
  /** Shown between the answer boxes and the keys, e.g. a language picker. */
  beforeKeys?: React.ReactNode;
  children: React.ReactNode;
}> = ({ accents, disabled = false, light = true, beforeKeys, children }) => {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const [shift, setShift] = useState(false);
  const set = accentSet(accents);
  if (!set) return <>{children}</>;

  const type = (key: string) => {
    const area = areaRef.current;
    let target = targetRef.current;
    if (!target || !area?.contains(target)) {
      const first =
        area?.querySelector(
          'input[type="text"], textarea, [contenteditable="true"]'
        ) ?? null;
      target = isTypingTarget(first) ? first : null;
    }
    if (!target) return;
    target.focus();
    insertAtCursor(target, shift ? shiftedKey(key) : key);
  };

  const keyCls = light
    ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
    : 'bg-slate-800 border-slate-600 text-white hover:bg-slate-700';

  return (
    <div
      ref={areaRef}
      onFocusCapture={(e) => {
        if (isTypingTarget(e.target)) targetRef.current = e.target;
      }}
      className="space-y-2"
    >
      {children}
      {beforeKeys}
      {!disabled && (
        <div
          role="group"
          aria-label="Accents"
          className="flex flex-wrap gap-1.5"
        >
          <button
            // no-tour-anchor: student quiz screen; tours walk teachers
            type="button"
            aria-pressed={shift}
            aria-label="Shift"
            title="Shift"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShift((s) => !s)}
            className={`min-w-10 h-10 px-2 rounded-lg border text-base flex items-center justify-center ${
              shift
                ? 'bg-brand-blue-primary border-brand-blue-primary text-white'
                : keyCls
            }`}
          >
            <ArrowBigUp className="w-5 h-5" />
          </button>
          {set.keys.map((key) => {
            const shown = shift ? shiftedKey(key) : key;
            return (
              <button
                // no-tour-anchor: student quiz screen; tours walk teachers
                key={key}
                type="button"
                aria-label={`Type ${shown}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => type(key)}
                className={`min-w-10 h-10 px-2 rounded-lg border text-lg font-medium ${keyCls}`}
              >
                {shown}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
