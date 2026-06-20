/**
 * PlcMentionPicker — the @mention autocomplete popover for the comment composer
 * (Decision 2.6). Given the active `@`-query and the PLC member list, it renders
 * a keyboard-navigable list of matching teammates. The parent owns the textarea
 * + the query parsing; this component is presentational + interaction-only.
 *
 * Accessibility: rendered as an ARIA listbox; the active option is tracked via
 * `aria-activedescendant` on the textarea (managed by the parent) and reflected
 * here via `activeIndex`. Each option is a button with a focus ring; clicking or
 * pressing Enter on the highlighted row selects it.
 *
 * This sits on the PLC's LIGHT surface (white cards on slate-50), so the muted
 * text uses the light-surface palette (`text-slate-500`), per the project's
 * dark-vs-light contrast guidance.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { MentionCandidate } from './mentionUtils';

interface PlcMentionPickerProps {
  candidates: MentionCandidate[];
  activeIndex: number;
  onSelect: (candidate: MentionCandidate) => void;
  onHoverIndex: (index: number) => void;
  /** id prefix so the parent can wire `aria-activedescendant`. */
  idPrefix: string;
}

export const PlcMentionPicker: React.FC<PlcMentionPickerProps> = ({
  candidates,
  activeIndex,
  onSelect,
  onHoverIndex,
  idPrefix,
}) => {
  const { t } = useTranslation();

  if (candidates.length === 0) {
    return (
      <div
        className="absolute z-10 mt-1 w-64 rounded-xl border border-slate-200 bg-white shadow-lg p-3 text-xxs text-slate-500"
        role="status"
      >
        {t('plcDashboard.comments.mentionNoMatch', {
          defaultValue: 'No teammates match',
        })}
      </div>
    );
  }

  return (
    <ul
      role="listbox"
      aria-label={t('plcDashboard.comments.mentionListLabel', {
        defaultValue: 'Mention a teammate',
      })}
      className="absolute z-10 mt-1 w-64 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg py-1"
    >
      {candidates.map((candidate, index) => {
        const isActive = index === activeIndex;
        return (
          <li key={candidate.uid} role="presentation">
            <button
              type="button"
              id={`${idPrefix}-opt-${index}`}
              role="option"
              aria-selected={isActive}
              // Use onMouseDown (not onClick) so the textarea doesn't blur and
              // dismiss the popover before the selection handler runs.
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(candidate);
              }}
              onMouseEnter={() => onHoverIndex(index)}
              className={`w-full text-left px-3 py-1.5 flex flex-col gap-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${
                isActive ? 'bg-brand-blue-primary/10' : 'hover:bg-slate-50'
              }`}
            >
              <span className="text-xs font-semibold text-slate-800 truncate">
                {candidate.displayName}
              </span>
              {candidate.email && (
                <span className="text-xxs text-slate-500 truncate">
                  {candidate.email}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
};
