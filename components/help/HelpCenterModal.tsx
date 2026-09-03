import React, { useEffect, useRef, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Keyboard, LibraryBig, Search, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { HelpShortcutsTab } from './HelpShortcutsTab';
import { setLastHelpTab, type HelpTab } from './helpCenterState';

interface HelpCenterModalProps {
  isOpen: boolean;
  tab: HelpTab;
  onTabChange: (tab: HelpTab) => void;
  onClose: () => void;
}

const TABS: {
  id: HelpTab;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'shortcuts', icon: Keyboard },
  { id: 'guides', icon: LibraryBig },
];

export const HelpCenterModal: React.FC<HelpCenterModalProps> = ({
  isOpen,
  tab,
  onTabChange,
  onClose,
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Onboarding detector listens for both the flag and the event.
    try {
      localStorage.setItem('spart_cheatsheet_opened', 'true');
    } catch {
      // Ignore storage errors so Help can still open
    }
    window.dispatchEvent(new Event('spart:cheatsheet-opened'));
    searchRef.current?.focus();
  }, [isOpen]);

  const selectTab = (next: HelpTab) => {
    setLastHelpTab(next);
    onTabChange(next);
  };

  const header = (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 shrink-0">
      <h2 className="font-black text-lg text-slate-900 shrink-0">
        {t('helpCenter.title')}
      </h2>
      <div className="relative flex-1 min-w-0 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          ref={searchRef}
          type="text"
          role="searchbox"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('helpCenter.search')}
          aria-label={t('helpCenter.search')}
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-light/40"
        />
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('helpCenter.close')}
        className="ml-auto p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
      >
        <X size={20} />
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      variant="default"
      maxWidth="max-w-6xl"
      className="h-[88vh]"
      contentClassName="p-0 flex overflow-hidden"
      customHeader={header}
      ariaLabel={t('helpCenter.title')}
    >
      <div className="flex flex-1 min-h-0 min-w-0 flex-col md:flex-row">
        <nav
          role="tablist"
          aria-label={t('helpCenter.title')}
          className="hidden md:flex md:w-[220px] shrink-0 flex-col gap-1 border-r border-slate-200 p-3"
        >
          {TABS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => selectTab(id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-left transition-colors ${
                tab === id
                  ? 'bg-brand-blue-primary/10 text-brand-blue-primary'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t(`helpCenter.tabs.${id}`)}
            </button>
          ))}
        </nav>

        <div className="md:hidden p-3 border-b border-slate-200">
          <label className="sr-only" htmlFor="help-tab-select">
            {t('helpCenter.title')}
          </label>
          <select
            id="help-tab-select"
            value={tab}
            onChange={(e) => selectTab(e.target.value as HelpTab)}
            className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-800"
          >
            {TABS.map(({ id }) => (
              <option key={id} value={id}>
                {t(`helpCenter.tabs.${id}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5">
          {tab === 'shortcuts' ? (
            <HelpShortcutsTab query={query} />
          ) : (
            <p className="text-sm text-slate-500 py-16 text-center">
              {t('helpCenter.guides.placeholder')}
            </p>
          )}
          <p className="mt-8 text-center text-xs text-slate-400">
            <Trans i18nKey="helpCenter.footer" components={{ kbd: <kbd /> }} />
          </p>
        </div>
      </div>
    </Modal>
  );
};
