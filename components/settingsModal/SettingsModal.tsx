/**
 * SettingsModal — the teacher-facing Settings surface.
 *
 * Replaces the three in-sidebar drill-in panels (Style, Preferences, Language)
 * with one focused modal whose own left rail switches between sections, so the
 * user never bounces back to the sidebar to reach the next setting.
 *
 * Structure mirrors the proven AdminSettings rail (rail → icon-only at md →
 * mobile drill-in below md, roving-tabindex a11y), but recolored LIGHT: the
 * dark rail stays reserved for the admin surface as its visual differentiator.
 *
 * Self-contained — it reads board/account state from context directly; the
 * sidebar only mounts it and supplies onClose.
 */

import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  PanelBottom,
  Palette,
  Settings,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGlobalStyleEditor } from '@/hooks/useGlobalStyleEditor';
import { AppearanceSection } from './sections/AppearanceSection';
import { DockSection } from './sections/DockSection';
import { BehaviorSection } from './sections/BehaviorSection';
import { LanguageSection } from './sections/LanguageSection';

interface SettingsModalProps {
  onClose: () => void;
}

type SectionId = 'appearance' | 'dock' | 'behavior' | 'language';

interface SectionConfig {
  id: SectionId;
  labelKey: string;
  fallback: string;
  icon: typeof Palette;
}

const SECTIONS: readonly SectionConfig[] = [
  {
    id: 'appearance',
    labelKey: 'sidebar.nav.globalStyle',
    fallback: 'Appearance',
    icon: Palette,
  },
  { id: 'dock', labelKey: 'style.dock', fallback: 'Dock', icon: PanelBottom },
  {
    id: 'behavior',
    labelKey: 'sidebar.nav.preferences',
    fallback: 'Behavior',
    icon: SlidersHorizontal,
  },
  {
    id: 'language',
    labelKey: 'sidebar.settings.language',
    fallback: 'Language',
    icon: Globe,
  },
];

// One nav entry in the light vertical rail. Collapses to icon-only between md
// and lg (label hidden, icon centered); `title` carries the accessible name.
const RailTab: React.FC<{
  id: SectionId;
  isActive: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ id, isActive, onClick, icon, label }) => (
  <button
    id={`settings-tab-${id}`}
    role="tab"
    aria-selected={isActive}
    aria-controls={`settings-panel-${id}`}
    tabIndex={isActive ? 0 : -1}
    onClick={onClick}
    title={label}
    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors justify-center lg:justify-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 ${
      isActive
        ? 'bg-brand-blue-primary text-white font-semibold shadow-sm'
        : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
    }`}
  >
    {icon}
    <span className="hidden lg:inline truncate">{label}</span>
  </button>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const editor = useGlobalStyleEditor();
  const [activeSection, setActiveSection] = useState<SectionId>('appearance');
  // Mobile only: the drill-in list (true) vs. the selected panel (false). The
  // rail is always visible on md+, so this flag is inert there.
  const [showMobileMenu, setShowMobileMenu] = useState(true);

  React.useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const label = (s: SectionConfig) =>
    t(s.labelKey, { defaultValue: s.fallback });
  const activeConfig = SECTIONS.find((s) => s.id === activeSection);
  const mobileTitle =
    !showMobileMenu && activeConfig
      ? label(activeConfig)
      : t('settings.title', { defaultValue: 'Settings' });

  const renderSection = (id: SectionId) => {
    switch (id) {
      case 'appearance':
        return <AppearanceSection editor={editor} />;
      case 'dock':
        return <DockSection editor={editor} />;
      case 'behavior':
        return <BehaviorSection />;
      case 'language':
        return <LanguageSection />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full h-full md:h-[85vh] md:max-h-[680px] md:max-w-4xl bg-white md:rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="h-14 md:h-16 px-4 flex items-center justify-between border-b border-slate-200 shrink-0 bg-white">
          <div className="flex items-center gap-2 overflow-hidden min-w-0">
            {!showMobileMenu && (
              <button
                onClick={() => setShowMobileMenu(true)}
                className="md:hidden p-2 hover:bg-slate-100 rounded-lg transition-colors shrink-0 -ml-2 text-slate-600"
                aria-label={t('sidebar.header.back', { defaultValue: 'Back' })}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            <Settings className="w-4 h-4 text-slate-400 shrink-0 hidden md:block" />
            <h2
              id="settings-modal-title"
              className="text-lg font-bold text-slate-800 truncate"
            >
              <span className="md:hidden">{mobileTitle}</span>
              <span className="hidden md:inline">
                {t('settings.title', { defaultValue: 'Settings' })}
              </span>
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-2 md:p-1.5 hover:bg-slate-100 rounded-lg transition-colors shrink-0 -mr-2 md:mr-0 text-slate-500"
            aria-label={t('sidebar.header.closeMenu', {
              defaultValue: 'Close settings',
            })}
          >
            <X className="w-6 h-6 md:w-5 md:h-5" />
          </button>
        </div>

        {/* Body — light rail (md+) + content panel */}
        <div className="flex-1 flex overflow-hidden">
          <nav
            role="tablist"
            aria-orientation="vertical"
            aria-label={t('settings.title', { defaultValue: 'Settings' })}
            className="hidden md:flex flex-col md:w-[76px] lg:w-56 shrink-0 bg-slate-50 border-r border-slate-200 overflow-y-auto p-2 gap-0.5"
          >
            {SECTIONS.map((section) => (
              <RailTab
                key={section.id}
                id={section.id}
                isActive={activeSection === section.id}
                onClick={() => setActiveSection(section.id)}
                icon={<section.icon className="w-5 h-5 shrink-0" />}
                label={label(section)}
              />
            ))}
          </nav>

          {/* Content column */}
          <div className="flex-1 min-w-0 overflow-y-auto bg-white">
            {/* Mobile drill-in list */}
            <div className={`md:hidden ${showMobileMenu ? 'block' : 'hidden'}`}>
              <div className="flex flex-col py-2">
                {SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => {
                      setActiveSection(section.id);
                      setShowMobileMenu(false);
                    }}
                    className="flex items-center justify-between p-4 min-h-[60px] hover:bg-slate-50 active:bg-slate-100 transition-colors border-b border-slate-100 last:border-b-0 w-full text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="bg-slate-100 p-2.5 rounded-xl text-slate-600">
                        <section.icon className="w-5 h-5" />
                      </div>
                      <span className="font-semibold text-slate-700 text-base">
                        {label(section)}
                      </span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </button>
                ))}
              </div>
            </div>

            {/* Section panel (md+ always; mobile when a section is selected) */}
            <div className={`${!showMobileMenu ? 'block' : 'hidden md:block'}`}>
              {SECTIONS.map(
                (section) =>
                  activeSection === section.id && (
                    <div
                      key={section.id}
                      id={`settings-panel-${section.id}`}
                      role="tabpanel"
                      aria-label={label(section)}
                      className="animate-in fade-in slide-in-from-bottom-1 duration-200"
                    >
                      {renderSection(section.id)}
                    </div>
                  )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
