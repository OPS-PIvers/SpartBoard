import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Fuse from 'fuse.js';
import { Hand, Keyboard } from 'lucide-react';
import {
  HELP_GESTURES,
  HELP_SHORTCUTS,
  type HelpShortcutGroup,
} from '@/config/helpShortcuts';

interface HelpShortcutsTabProps {
  query: string;
}

interface ShortcutRow {
  id: string;
  group: HelpShortcutGroup;
  label: string;
  keys: string[];
}

interface GestureRow {
  id: string;
  group: HelpShortcutGroup;
  label: string;
  description: string;
}

const isMac = (): boolean =>
  typeof navigator !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

const keyLabel = (token: string, mac: boolean): string => {
  if (token === 'Ctrl/⌘') return mac ? '⌘' : 'Ctrl';
  if (token === 'Ctrl') return mac ? '⌘' : 'Ctrl';
  if (token === 'Alt') return mac ? '⌥' : 'Alt';
  return token;
};

const KeyBadge: React.FC<{ label: string }> = ({ label }) => (
  <kbd className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 border border-slate-300 text-slate-700 text-xs font-mono shadow-sm">
    {label}
  </kbd>
);

const SectionHeading: React.FC<{
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon, children }) => (
  <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
    {icon}
    {children}
  </h3>
);

export const HelpShortcutsTab: React.FC<HelpShortcutsTabProps> = ({
  query,
}) => {
  const { t } = useTranslation();
  const mac = isMac();

  const shortcutRows: ShortcutRow[] = useMemo(
    () =>
      HELP_SHORTCUTS.map((s) => ({
        id: s.id,
        group: s.group,
        keys: s.keys,
        label: t(s.labelKey),
      })),
    [t]
  );

  const gestureRows: GestureRow[] = useMemo(
    () =>
      HELP_GESTURES.map((g) => ({
        id: g.id,
        group: g.group,
        label: t(g.labelKey),
        description: t(g.descriptionKey),
      })),
    [t]
  );

  const shortcutFuse = useMemo(
    () =>
      new Fuse(shortcutRows, {
        keys: ['label', 'keys'],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [shortcutRows]
  );

  const gestureFuse = useMemo(
    () =>
      new Fuse(gestureRows, {
        keys: ['label', 'description'],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [gestureRows]
  );

  const trimmed = query.trim();
  const visibleShortcuts = trimmed
    ? shortcutFuse.search(trimmed).map((r) => r.item)
    : shortcutRows;
  const visibleGestures = trimmed
    ? gestureFuse.search(trimmed).map((r) => r.item)
    : gestureRows;

  const groups: HelpShortcutGroup[] = ['board', 'widget'];
  const hasResults = visibleShortcuts.length > 0 || visibleGestures.length > 0;

  if (!hasResults) {
    return (
      <p className="text-sm text-slate-500 py-10 text-center">
        {t('helpCenter.noResults')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {visibleShortcuts.length > 0 && (
        <section>
          <SectionHeading
            icon={<Keyboard className="w-4 h-4 text-brand-blue-primary" />}
          >
            {t('helpCenter.sections.keyboard')}
          </SectionHeading>
          <div className="flex flex-col gap-5">
            {groups.map((group) => {
              const rows = visibleShortcuts.filter((r) => r.group === group);
              if (rows.length === 0) return null;
              return (
                <div key={group}>
                  <h4 className="text-xxs font-bold uppercase tracking-widest text-slate-400 mb-2">
                    {t(`helpCenter.groups.${group}`)}
                  </h4>
                  <ul className="flex flex-col divide-y divide-slate-100">
                    {rows.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-center justify-between gap-4 py-2"
                      >
                        <span className="text-sm text-slate-700 leading-snug">
                          {row.label}
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          {row.keys.map((k, i) => (
                            <React.Fragment key={k}>
                              {i > 0 && (
                                <span className="text-slate-400 text-xs">
                                  +
                                </span>
                              )}
                              <KeyBadge label={keyLabel(k, mac)} />
                            </React.Fragment>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {visibleGestures.length > 0 && (
        <section>
          <SectionHeading icon={<Hand className="w-4 h-4 text-emerald-600" />}>
            {t('helpCenter.sections.gestures')}
          </SectionHeading>
          <div className="flex flex-col gap-5">
            {groups.map((group) => {
              const rows = visibleGestures.filter((r) => r.group === group);
              if (rows.length === 0) return null;
              return (
                <div key={group}>
                  <h4 className="text-xxs font-bold uppercase tracking-widest text-slate-400 mb-2">
                    {t(`helpCenter.groups.${group}`)}
                  </h4>
                  <ul className="flex flex-col divide-y divide-slate-100">
                    {rows.map((row) => (
                      <li key={row.id} className="flex items-start gap-3 py-2">
                        <span className="shrink-0 mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium whitespace-nowrap">
                          {row.label}
                        </span>
                        <span className="text-sm text-slate-700 leading-snug">
                          {row.description}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
