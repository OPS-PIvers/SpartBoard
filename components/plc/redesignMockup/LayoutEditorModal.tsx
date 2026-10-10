// Screen 3: the lead's team layout editor (T2, T3, T5, T6).

import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Clock,
  ClipboardList,
  FileText,
  Home,
  Megaphone,
  RotateCcw,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import { Toggle } from '@/components/common/Toggle';
import type { TourAnchorAttrs } from '@/config/tourAnchors';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { ASSESSMENTS, LEARNING_TARGETS } from './fixtures';
import { EYEBROW, INPUT, META, TextLink } from './ui';

interface PageRow {
  id: string;
  label: string;
  icon: LucideIcon;
  on: boolean;
}
interface CardRow {
  id: string;
  label: string;
  on: boolean;
  needsUpdates?: boolean;
}

const PAGES: PageRow[] = [
  { id: 'data', label: 'Data overview', icon: BarChart3, on: true },
  { id: 'assess', label: 'Assessments', icon: ClipboardList, on: true },
  { id: 'notes', label: 'Notes & Docs', icon: FileText, on: true },
  { id: 'res', label: 'Resources', icon: Sparkles, on: true },
  { id: 'upd', label: 'Updates', icon: Megaphone, on: false },
];

const CARDS: CardRow[] = [
  { id: 'dist', label: 'Score distribution', on: true },
  { id: 'trend', label: 'Team average over time', on: true },
  { id: 'part', label: 'Participation', on: true },
  { id: 'mast', label: 'Mastery by learning target', on: true },
  { id: 'goals', label: 'Goals', on: true },
  { id: 'recent', label: 'Recent assessments', on: true },
  { id: 'strip', label: 'Next meeting and open items', on: true },
  { id: 'upd', label: 'Latest updates', on: false, needsUpdates: true },
  { id: 'cal', label: 'Calendar', on: false },
];

function move<T>(list: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Up/down plus a switch: one editable row, shared by the layout editor and admin defaults. */
export const OrderRow: React.FC<{
  label: string;
  icon?: LucideIcon;
  on: boolean;
  index: number;
  count: number;
  note?: React.ReactNode;
  lockedOn?: boolean;
  disabled?: boolean;
  onMove: (d: number) => void;
  onToggle: (on: boolean) => void;
  switchLabel?: string;
  anchors?: {
    up?: TourAnchorAttrs;
    down?: TourAnchorAttrs;
    toggle?: TourAnchorAttrs;
  };
}> = ({
  label,
  icon: Icon,
  on,
  index,
  count,
  note,
  lockedOn = false,
  disabled = false,
  onMove,
  onToggle,
  switchLabel,
  anchors,
}) => (
  <li className="flex items-center gap-3 py-2">
    {Icon && (
      <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
    )}
    <span
      className={`min-w-0 flex-1 truncate text-sm ${on && !disabled ? 'text-slate-800' : 'text-slate-400'}`}
    >
      {label}
    </span>
    {note}
    <IconButton
      icon={<ArrowUp className="h-3.5 w-3.5" />}
      label={`Move ${label} up`}
      size="sm"
      disabled={index === 0}
      onClick={() => onMove(-1)}
      {...anchors?.up}
    />
    <IconButton
      icon={<ArrowDown className="h-3.5 w-3.5" />}
      label={`Move ${label} down`}
      size="sm"
      disabled={index === count - 1}
      onClick={() => onMove(1)}
      {...anchors?.down}
    />
    <span title={lockedOn ? 'The landing page is always on' : undefined}>
      <Toggle
        size="sm"
        checked={on && !disabled}
        disabled={lockedOn || disabled}
        onChange={onToggle}
        label={switchLabel ?? `Show ${label}`}
        anchor={anchors?.toggle}
      />
    </span>
  </li>
);

export const LayoutEditorModal: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  const [pages, setPages] = useState(PAGES);
  const [cards, setCards] = useState(CARDS);
  const [landing, setLanding] = useState('data');
  const [hero, setHero] = useState<'default' | 'pinned'>('pinned');
  const [confirmReset, setConfirmReset] = useState(false);
  const updatesOn = pages.find((p) => p.id === 'upd')?.on ?? false;

  const footer = confirmReset ? (
    <div className="flex flex-wrap items-center gap-3">
      <span className="min-w-0 flex-1 text-sm text-slate-700">
        Pages, cards and the pinned item go back to the district default.
        Content stays.
      </span>
      <Button variant="secondary" onClick={() => setConfirmReset(false)}>
        Cancel
      </Button>
      <Button
        variant="danger"
        onClick={() => {
          setPages(PAGES);
          setCards(CARDS);
          setHero('default');
          setConfirmReset(false);
        }}
      >
        Reset
      </Button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
        onClick={() => setConfirmReset(true)}
      >
        Reset to district default
      </Button>
      <span className="flex-1" />
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button onClick={onClose}>Save</Button>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="max-w-2xl"
      ariaLabel="Team layout"
      customHeader={
        <div className="mb-2 flex shrink-0 items-center gap-3 p-6 pb-0">
          <h3 className="text-lg font-black text-slate-800">Team layout</h3>
          <span className={META}>Everyone on the team sees this layout.</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
      }
      footer={footer}
    >
      <h4 className={`${EYEBROW} mt-2`}>Pages</h4>
      <ul className="divide-y divide-slate-100">
        {pages.map((p, i) => (
          <OrderRow
            key={p.id}
            label={p.label}
            icon={p.icon}
            on={p.on}
            index={i}
            count={pages.length}
            lockedOn={p.id === landing}
            note={
              p.id === landing && (
                <span className="inline-flex items-center gap-1 text-xxs font-bold uppercase tracking-wider text-brand-blue-primary">
                  <Home className="h-3 w-3" aria-hidden="true" />
                  Landing page
                </span>
              )
            }
            onMove={(d) => setPages((l) => move(l, i, d))}
            onToggle={(on) =>
              setPages((l) => l.map((x) => (x.id === p.id ? { ...x, on } : x)))
            }
          />
        ))}
      </ul>
      <label className="mt-3 flex items-center gap-3 text-sm text-slate-700">
        <span className="w-28 shrink-0 font-semibold">Landing page</span>
        <select
          value={landing}
          onChange={(e) => setLanding(e.target.value)}
          className={`${INPUT} py-1.5`}
        >
          {pages
            .filter((p) => p.on)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
        </select>
      </label>

      <div className="mt-6 border-t border-slate-200 pt-5">
        <h4 className={`${EYEBROW} mb-3`}>First thing the team sees</h4>
        <SegmentedControl
          role="radiogroup"
          ariaLabel="First thing the team sees"
          value={hero}
          onChange={setHero}
          options={[
            { value: 'default', label: 'Follow default' },
            { value: 'pinned', label: 'Pin an item' },
          ]}
        />
        {hero === 'pinned' ? (
          <>
            <label className="mt-3 flex items-center gap-3 text-sm text-slate-700">
              <span className="w-28 shrink-0 font-semibold">Pinned item</span>
              <select
                defaultValue="u3"
                className={`${INPUT} min-w-0 flex-1 py-1.5`}
              >
                <optgroup label="Assessment results">
                  {[...ASSESSMENTS].reverse().map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Learning target trend">
                  {LEARNING_TARGETS.map((t) => (
                    <option key={t.id} value={`t:${t.id}`}>
                      {t.code} {t.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Goals">
                  <option value="g1">80% at 75% or higher by May</option>
                </optgroup>
                <optgroup label="Notes & Docs">
                  <option value="d1">Unit 3 reteach plan</option>
                  <option value="d2">PLC meeting Oct 9</option>
                </optgroup>
                <optgroup label="Calendar">
                  <option value="c1">Math PLC calendar</option>
                </optgroup>
              </select>
            </label>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Clock
                  className="h-3.5 w-3.5 text-slate-400"
                  aria-hidden="true"
                />
                Newer results: Unit 4 Proportions Quick Check, Oct 6.
              </span>
              <TextLink onClick={() => setHero('default')}>
                Follow latest
              </TextLink>
            </p>
          </>
        ) : (
          <p className={`${META} mt-3`}>Shows the latest common assessment.</p>
        )}
      </div>

      <div className="mt-6 border-t border-slate-200 pt-5">
        <h4 className={EYEBROW}>Landing page cards</h4>
        <ul className="divide-y divide-slate-100">
          {cards.map((c, i) => {
            const blocked = !!c.needsUpdates && !updatesOn;
            return (
              <OrderRow
                key={c.id}
                label={c.label}
                on={c.on}
                index={i}
                count={cards.length}
                disabled={blocked}
                note={
                  blocked && <span className={META}>Turn on Updates first</span>
                }
                onMove={(d) => setCards((l) => move(l, i, d))}
                onToggle={(on) =>
                  setCards((l) =>
                    l.map((x) => (x.id === c.id ? { ...x, on } : x))
                  )
                }
              />
            );
          })}
        </ul>
      </div>
    </Modal>
  );
};
