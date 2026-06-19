import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Users2 } from 'lucide-react';

import { Plc, getPlcFeatures } from '@/types';
import { useAuth } from '@/context/useAuth';
import { getPlcMembers, getPlcRole } from '@/utils/plc';
import { buildPlcPath, spaNavigate, spaReplace } from '@/utils/plcPath';
import { PlcDashboardRail, type PlcRailItem } from './PlcDashboardRail';
import { PLC_SECTIONS, type PlcSectionId } from './sections';
import { PlcHome } from './home/PlcHome';
import { PlcSharedDataBody } from './sharedData/PlcSharedDataBody';
import { NotesDocsBody } from './bodies/NotesDocsBody';
import { PlcResourcesBody } from './resources/PlcResourcesBody';
import { PlcQuizLibraryTab } from './tabs/PlcQuizLibraryTab';
import { PlcVideoActivitiesTab } from './tabs/PlcVideoActivitiesTab';
import { PlcTodosTab } from './tabs/PlcTodosTab';
import { PlcSharedBoardsTab } from './tabs/PlcSharedBoardsTab';
import { PlcSettingsTab } from './tabs/PlcSettingsTab';
import { MembersBody } from './bodies/MembersBody';
import { PlcMeetingMode } from './meeting/PlcMeetingMode';
import { PlcPresenceStrip } from './presence/PlcPresenceStrip';

interface PlcDashboardProps {
  plc: Plc;
  /**
   * The active section, derived from the pathname by the route host. The
   * dashboard is fully controlled by this prop — section changes push history
   * (`spaNavigate`) which re-derives this prop on the next render, so back /
   * forward / refresh / deep-link all preserve the section.
   */
  activeSection: PlcSectionId;
  /**
   * A specific meeting record id, present only on the
   * `/plc/:id/meeting/:meetingId` route. When set (and the active section is
   * `meeting`), Meeting Mode opens that saved record read-only; when null on the
   * `meeting` section it opens the live guided flow.
   */
  meetingId?: string | null;
  /** Navigate out of the PLC (back to the prior history entry / the board). */
  onClose: () => void;
}

/**
 * Full-screen PLC Dashboard view, mounted at `/plc/:plcId/:section`. Navigates
 * via a left-side rail (desktop) and a mobile drill-in menu, mirroring the
 * SettingsModal pattern. `activeSection` is pathname-driven (controlled); the
 * mobile drill-in (`showMobileMenu`) is local view state.
 */
export const PlcDashboard: React.FC<PlcDashboardProps> = ({
  plc,
  activeSection: requestedSection,
  meetingId = null,
  onClose,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  // On mobile, deep-linking straight to a section (anything but `home`) should
  // open that section, not the drill-in menu; landing on home shows the menu.
  const [showMobileMenu, setShowMobileMenu] = useState(
    requestedSection === 'home'
  );

  // Close on Escape (navigates back to the board / prior entry).
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

  // The requested section may not be visible: it could be a feature-gated
  // section the team has toggled off, or `meeting` (reserved, not in the rail
  // this wave). In either case fall back to `home`. We only REWRITE the URL
  // (replaceState, no history entry) when the requested section is a real
  // section id that resolved away — not for `home` itself.
  const activeSection: PlcSectionId = visibleSections.find(
    (s) => s.id === requestedSection
  )
    ? requestedSection
    : 'home';
  useEffect(() => {
    if (activeSection !== requestedSection) {
      spaReplace(buildPlcPath(plc.id, activeSection));
    }
  }, [activeSection, requestedSection, plc.id]);

  // Read membership through the T1 helpers so the lead badge + member count
  // work against the canonical `members` map AND legacy arrays.
  const isLead = user?.uid ? getPlcRole(plc, user.uid) === 'lead' : false;
  const memberCount = useMemo(() => getPlcMembers(plc).length, [plc]);

  const handleBackOrClose = () => {
    if (!showMobileMenu) {
      // Drill back out to the mobile section list without leaving the PLC.
      setShowMobileMenu(true);
    } else {
      onClose();
    }
  };

  const handleNavigateSection = (sectionId: PlcSectionId) => {
    setShowMobileMenu(false);
    if (sectionId !== activeSection) {
      spaNavigate(buildPlcPath(plc.id, sectionId));
    }
  };

  const renderSection = (id: PlcSectionId): React.ReactNode => {
    switch (id) {
      case 'home':
        return <PlcHome plc={plc} onNavigate={handleNavigateSection} />;
      case 'quizzes':
        return <PlcQuizLibraryTab plc={plc} onCloseDashboard={onClose} />;
      case 'videoActivities':
        return <PlcVideoActivitiesTab plc={plc} />;
      case 'sharedData':
        return <PlcSharedDataBody plc={plc} />;
      case 'docs':
        // The Docs section now hosts the combined Notes & Docs surface: native
        // structured meeting notes (live default) with the Google-Doc embed one
        // tab away (Decisions 2.5, 6.5).
        return <NotesDocsBody plc={plc} />;
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
      // Meeting Mode — the guided projector surface (PRD §6.2). When a
      // `meetingId` is present (the `/plc/:id/meeting/:meetingId` route) the
      // saved record opens read-only; otherwise the live guided flow runs.
      case 'meeting':
        return (
          <PlcMeetingMode
            plc={plc}
            meetingId={meetingId}
            onNavigate={handleNavigateSection}
          />
        );
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
              count: memberCount,
              defaultValue: '{{count}} Member',
              defaultValue_other: '{{count}} Members',
            })}
          </span>
          {/* Compact who's-here indicator — visible on every section (md+). */}
          <span className="hidden md:inline-flex items-center">
            <PlcPresenceStrip plc={plc} variant="compact" />
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
            onSelect={handleNavigateSection}
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
                    onClick={() => handleNavigateSection(section.id)}
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
