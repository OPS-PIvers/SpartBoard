import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Users2 } from 'lucide-react';

import { Plc, getPlcFeatures } from '@/types';
import { useAuth } from '@/context/useAuth';
import { PlcDashboardRail, type PlcRailItem } from './PlcDashboardRail';
import { PLC_SECTIONS, type PlcSectionId } from './sections';
import { PlcHome } from './home/PlcHome';
import { PlcAssignmentsSection } from './assignments/PlcAssignmentsSection';
import { PlcSharedDataBody } from './sharedData/PlcSharedDataBody';
import { PlcDocsBody } from './docs/PlcDocsBody';
import { PlcResourcesBody } from './resources/PlcResourcesBody';
import { PlcQuizLibraryTab } from './tabs/PlcQuizLibraryTab';
import { PlcVideoActivitiesTab } from './tabs/PlcVideoActivitiesTab';
import { PlcTodosTab } from './tabs/PlcTodosTab';
import { PlcSharedBoardsTab } from './tabs/PlcSharedBoardsTab';
import { PlcSettingsTab } from './tabs/PlcSettingsTab';
import { MembersBody } from './bodies/MembersBody';

interface PlcDashboardProps {
  plc: Plc;
  onClose: () => void;
}

/**
 * Full-screen PLC Dashboard view. Opens when a member clicks a PLC in the
 * sidebar list. Navigates via a left-side rail (desktop) and a mobile
 * drill-in menu, mirroring the SettingsModal pattern.
 */
export const PlcDashboard: React.FC<PlcDashboardProps> = ({ plc, onClose }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<PlcSectionId>('home');
  const [showMobileMenu, setShowMobileMenu] = useState(true);

  // Close on Escape.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const features = useMemo(() => getPlcFeatures(plc), [plc]);

  const visibleSections = useMemo(
    () =>
      PLC_SECTIONS.filter(
        (section) => !section.feature || features[section.feature]
      ),
    [features]
  );

  const visibleRailItems: PlcRailItem[] = useMemo(
    () =>
      visibleSections.map((s) => ({
        id: s.id,
        label: t(s.labelKey, { defaultValue: s.labelDefault }),
        icon: s.icon,
      })),
    [visibleSections, t]
  );

  // If the active section gets hidden via a settings toggle by another member,
  // fall back to "home" — which is always visible. Adjust state during render
  // rather than via an effect to avoid an extra render pass.
  if (!visibleSections.find((s) => s.id === activeSection)) {
    setActiveSection('home');
  }

  const isLead = plc.leadUid === user?.uid;

  const handleBackOrClose = () => {
    if (!showMobileMenu) {
      setShowMobileMenu(true);
    } else {
      onClose();
    }
  };

  const handleNavigateSection = (sectionId: PlcSectionId) => {
    setActiveSection(sectionId);
    setShowMobileMenu(false);
  };

  const renderSection = (id: PlcSectionId): React.ReactNode => {
    switch (id) {
      case 'home':
        return <PlcHome plc={plc} onNavigate={handleNavigateSection} />;
      case 'quizzes':
        return <PlcQuizLibraryTab plc={plc} />;
      case 'videoActivities':
        return <PlcVideoActivitiesTab plc={plc} />;
      case 'assignments':
        return <PlcAssignmentsSection plc={plc} />;
      case 'sharedData':
        return <PlcSharedDataBody plc={plc} />;
      case 'docs':
        return <PlcDocsBody plc={plc} />;
      case 'todos':
        return <PlcTodosTab plc={plc} />;
      case 'sharedBoards':
        return <PlcSharedBoardsTab plc={plc} />;
      case 'members':
        return <MembersBody plc={plc} />;
      case 'resources':
        return (
          <PlcResourcesBody plc={plc} onNavigate={handleNavigateSection} />
        );
      case 'settings':
        return <PlcSettingsTab plc={plc} />;
    }
  };

  const activeSectionDef = visibleSections.find((s) => s.id === activeSection);

  return (
    <div
      className="fixed inset-0 z-modal bg-slate-50 flex flex-col overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plc-dashboard-title"
    >
      <div className="bg-white w-full h-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-blue-primary to-brand-blue-dark text-white h-14 md:h-16 px-4 flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-2 overflow-hidden w-full md:w-auto">
            <button
              onClick={handleBackOrClose}
              className="p-2 md:p-1.5 hover:bg-white/20 rounded-lg transition-colors shrink-0 -ml-2 md:ml-0"
              aria-label={
                !showMobileMenu
                  ? t('plcDashboard.backToMenu', { defaultValue: 'Back' })
                  : t('plcDashboard.close', { defaultValue: 'Close' })
              }
            >
              <ChevronLeft className="w-6 h-6 md:w-5 md:h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Users2 className="w-5 h-5 md:w-4 md:h-4 text-white/70 shrink-0 hidden md:block" />
              <div className="flex flex-col md:flex-row md:items-baseline md:gap-2 min-w-0">
                <h2
                  id="plc-dashboard-title"
                  className="text-base md:text-lg font-bold truncate"
                >
                  {plc.name}
                </h2>
                <span className="hidden md:inline text-xxs uppercase tracking-widest text-white/60">
                  {t('plcDashboard.subtitle', {
                    defaultValue: 'PLC Dashboard',
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Sub-header: PLC meta */}
        <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-2.5 flex items-center gap-3 text-xxs text-slate-500 shrink-0">
          <span className="font-semibold uppercase tracking-widest">
            {t('plcDashboard.meta.members', {
              count: plc.memberUids.length,
              defaultValue: '{{count}} Member',
              defaultValue_other: '{{count}} Members',
            })}
          </span>
          {isLead && (
            <>
              <span className="text-slate-300">•</span>
              <span className="font-semibold uppercase tracking-widest text-brand-blue-primary">
                {t('plcDashboard.meta.youLead', {
                  defaultValue: 'You lead this PLC',
                })}
              </span>
            </>
          )}
          {!showMobileMenu && activeSectionDef && (
            <>
              <span className="text-slate-300 md:hidden">•</span>
              <span className="md:hidden font-semibold text-slate-700 truncate">
                {t(activeSectionDef.labelKey, {
                  defaultValue: activeSectionDef.labelDefault,
                })}
              </span>
            </>
          )}
        </div>

        {/* Body — rail (md+) + content column */}
        <div className="flex-1 flex overflow-hidden">
          <PlcDashboardRail
            activeSection={activeSection}
            onSelect={(id) => {
              setActiveSection(id);
              setShowMobileMenu(false);
            }}
            visibleSections={visibleRailItems}
          />

          {/* Content column */}
          <div className="flex-1 min-w-0 overflow-y-auto overscroll-none touch-pan-y bg-slate-50">
            {/* Mobile drill-in list */}
            <div className={`md:hidden ${showMobileMenu ? 'block' : 'hidden'}`}>
              <div className="flex flex-col py-2">
                {visibleSections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => {
                      setActiveSection(section.id);
                      setShowMobileMenu(false);
                    }}
                    className="flex items-center justify-between p-4 min-h-[60px] hover:bg-slate-100 active:bg-slate-200 transition-colors border-b border-slate-100 last:border-b-0 w-full text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="bg-slate-100 p-2.5 rounded-xl text-slate-600">
                        <section.icon className="w-5 h-5" />
                      </div>
                      <span className="font-semibold text-slate-700 text-base">
                        {t(section.labelKey, {
                          defaultValue: section.labelDefault,
                        })}
                      </span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </button>
                ))}
              </div>
            </div>

            {/* Active panel (md+ always; mobile when a section is selected) */}
            <div
              className={`${!showMobileMenu ? 'block' : 'hidden md:block'} h-full`}
            >
              {activeSectionDef && (
                <div
                  key={activeSection}
                  role="tabpanel"
                  id={`plc-panel-${activeSection}`}
                  aria-labelledby={`plc-tab-${activeSection}`}
                  className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full"
                >
                  {renderSection(activeSection)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
