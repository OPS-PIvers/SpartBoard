import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { modShortcutLabel } from './useStudioShortcuts';
import {
  useReturnFocusOnClose,
  useStudioFocusTrap,
} from './useStudioFocusTrap';

interface ShortcutRow {
  id: string;
  keys: string[];
}

interface ShortcutGroup {
  id: string;
  rows: ShortcutRow[];
}

/** Every Studio shortcut, grouped; `keys` are alternatives for the same action. */
function useShortcutGroups(): ShortcutGroup[] {
  const { t } = useTranslation();
  const shift = t('glStudio.key_shift');
  const space = t('glStudio.key_space');
  const enter = t('glStudio.key_enter');
  const esc = t('glStudio.key_escape');
  const tab = t('glStudio.key_tab');
  return [
    {
      id: 'edit',
      rows: [
        { id: 'undo', keys: [modShortcutLabel('z')] },
        {
          id: 'redo',
          keys: [modShortcutLabel('z', true), modShortcutLabel('y')],
        },
        { id: 'duplicate', keys: [modShortcutLabel('d')] },
        { id: 'copy', keys: [modShortcutLabel('c')] },
        { id: 'paste', keys: [modShortcutLabel('v')] },
        { id: 'delete', keys: [t('glStudio.key_delete')] },
        { id: 'prevNext', keys: ['[', ']'] },
        { id: 'play', keys: [`${shift}+${space}`] },
        { id: 'exitPlay', keys: [esc] },
        { id: 'help', keys: ['?'] },
      ],
    },
    {
      id: 'canvas',
      rows: [
        { id: 'addMode', keys: ['A'] },
        { id: 'tools', keys: ['R', 'E', 'P'] },
        { id: 'blur', keys: ['B'] },
        { id: 'place', keys: [enter] },
        { id: 'editCallout', keys: [enter] },
        { id: 'closePolygon', keys: [enter] },
        { id: 'cancel', keys: [esc] },
        { id: 'nudge', keys: ['← ↑ → ↓'] },
        { id: 'nudgeFar', keys: [`${shift}+← ↑ → ↓`] },
        { id: 'cycle', keys: [tab, `${shift}+${tab}`] },
        { id: 'pan', keys: [space] },
        { id: 'zoomFit', keys: ['0'] },
        { id: 'zoomActual', keys: ['1'] },
      ],
    },
    {
      id: 'text',
      rows: [
        { id: 'bold', keys: [modShortcutLabel('b')] },
        { id: 'link', keys: [modShortcutLabel('k')] },
        { id: 'doneEditing', keys: [esc] },
      ],
    },
  ];
}

/** The `?` sheet: a modal list of every Studio shortcut. */
export const StudioShortcutSheet: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  useStudioFocusTrap(rootRef);
  useReturnFocusOnClose();
  const groups = useShortcutGroups();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gl-studio-shortcuts-title"
        tabIndex={-1}
        data-testid="gl-studio-shortcuts"
        onKeyDown={(e) => {
          if (e.key !== 'Escape' && e.key !== '?') return;
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl focus:outline-none"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2
            id="gl-studio-shortcuts-title"
            className="text-base font-black text-slate-800"
          >
            {t('glStudio.shortcutsTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('glStudio.shortcutsClose')}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="grid gap-6 overflow-y-auto px-5 py-4 custom-scrollbar md:grid-cols-2">
          {groups.map((group) => (
            <section
              key={group.id}
              aria-labelledby={`gl-studio-shortcuts-${group.id}`}
            >
              <h3
                id={`gl-studio-shortcuts-${group.id}`}
                className="mb-2 text-xxs font-bold uppercase tracking-wider text-slate-500"
              >
                {t(`glStudio.shortcutGroup_${group.id}`)}
              </h3>
              <dl className="flex flex-col gap-1.5">
                {group.rows.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <dt className="text-slate-700">
                      {t(`glStudio.shortcut_${row.id}`)}
                    </dt>
                    <dd className="flex shrink-0 flex-wrap justify-end gap-1">
                      {row.keys.map((k) => (
                        <kbd
                          key={k}
                          className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-700"
                        >
                          {k}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
