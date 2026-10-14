import React, { useRef, useState } from 'react';
import { ChevronDown, Loader2, Octagon } from 'lucide-react';
import type { QuizResponse, QuizSession } from '@/types';
import { useClickOutside } from '@/hooks/useClickOutside';
import { Z_INDEX } from '@/config/zIndex';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import {
  isResponseWaiting,
  openQuizPart,
  type OpenPartScope,
} from './openPart';
import {
  nextPartToOpen,
  openedPartFor,
  periodOfResponse,
  sessionHasStops,
  totalParts,
} from '@/utils/quizParts';

interface OpenPartControlProps {
  session: QuizSession;
  responses: QuizResponse[];
  /** Class periods on the session; a menu picks one when there are several. */
  periodNames: string[];
  disabled?: boolean;
  disabledTitle?: string;
  onError: (err: unknown) => void;
}

/** "Open Part N" on a self-paced quiz with a Stop (QUIZ_IMPORT_VERSIONS.md V22). */
export const OpenPartControl: React.FC<OpenPartControlProps> = ({
  session,
  responses,
  periodNames,
  disabled = false,
  disabledTitle,
  onError,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useClickOutside(menuRef, () => setMenuOpen(false));

  if (!sessionHasStops(session) || session.status === 'ended') return null;
  const parts = totalParts(session.sections);
  const waiting = responses.filter((r) => isResponseWaiting(session, r));
  const openedAll = openedPartFor(session.partsOpen, undefined, undefined);
  const part = nextPartToOpen(waiting) ?? openedAll + 1;
  if (part > parts) return null;

  const periodOpened = (name: string) =>
    openedPartFor(session.partsOpen, name, undefined);
  const periods = periodNames.length > 1 ? periodNames : [];
  const waitingIn = (name: string) =>
    waiting.filter((r) => periodOfResponse(session, r) === name).length;

  const run = async (scope: OpenPartScope) => {
    setMenuOpen(false);
    setBusy(true);
    try {
      await openQuizPart(session.id, scope, part);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const label = `Open Part ${part}`;
  const textStyle = { fontSize: 'min(12px, 4cqmin)' };
  const iconStyle = {
    width: 'min(14px, 4.5cqmin)',
    height: 'min(14px, 4.5cqmin)',
  };

  return (
    <div
      ref={menuRef}
      className="relative flex items-center justify-between border-b border-brand-gray-lightest font-sans text-brand-gray-dark"
      style={{
        gap: 'min(8px, 2cqmin)',
        paddingBottom: 'min(8px, 2cqmin)',
      }}
    >
      <span
        className="inline-flex items-center"
        style={{ ...textStyle, gap: 'min(6px, 1.5cqmin)' }}
      >
        <Octagon
          aria-hidden
          className="text-brand-red-primary shrink-0"
          style={iconStyle}
        />
        {`${waiting.length} waiting for Part ${part}`}
      </span>
      <button
        type="button"
        onClick={() =>
          periods.length > 0
            ? setMenuOpen((v) => !v)
            : void run({ kind: 'all' })
        }
        disabled={disabled || busy}
        title={disabledTitle}
        aria-expanded={periods.length > 0 ? menuOpen : undefined}
        {...tourTypeAttr('quiz-monitor.open-part', 'quiz')}
        className="inline-flex items-center rounded-lg bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-semibold transition-colors disabled:opacity-60"
        style={{
          ...textStyle,
          gap: 'min(4px, 1cqmin)',
          padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
        }}
      >
        {busy && (
          <Loader2 aria-hidden className="animate-spin" style={iconStyle} />
        )}
        {label}
        {periods.length > 0 && <ChevronDown aria-hidden style={iconStyle} />}
      </button>
      {menuOpen && (
        <div
          className="absolute right-0 top-full bg-white border border-brand-gray-lighter rounded-lg shadow-lg overflow-hidden"
          style={{
            zIndex: Z_INDEX.dropdown,
            marginTop: 'min(4px, 1cqmin)',
            minWidth: 'min(180px, 60cqw)',
          }}
        >
          {[
            { key: '', text: 'All classes', scope: { kind: 'all' } as const },
            ...periods
              .filter((name) => periodOpened(name) < part)
              .map((name) => ({
                key: name,
                text: `${name} · ${waitingIn(name)} waiting`,
                scope: { kind: 'period', name } as const,
              })),
          ].map((item) => (
            <button
              key={item.key || 'all'}
              type="button"
              onClick={() => void run(item.scope)}
              {...tourFieldAttr(
                'quiz-monitor.open-part-period',
                'quiz',
                item.key || 'all'
              )}
              className="block w-full text-left hover:bg-brand-blue-lighter transition-colors"
              style={{
                ...textStyle,
                padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
              }}
            >
              {item.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
