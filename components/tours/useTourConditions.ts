import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useClassLinkEnabled } from '@/hooks/useClassLinkEnabled';
import {
  checkTourCondition,
  type TourConditionCheck,
  type TourFact,
} from '@/config/tourConditions';

/** Answers live-tour conditions for the signed-in teacher. */
export function useTourConditions(): TourConditionCheck {
  const {
    selectedBuildings,
    offlineGrantPresent,
    isExternalUser,
    orgBuildings,
    orgBuildingsLoaded,
    canAccessFeature,
  } = useAuth();
  const { rosters } = useDashboard();
  const classLinkOn = useClassLinkEnabled(selectedBuildings[0]);
  const facts: Record<TourFact, boolean | undefined> = {
    'building-saved': selectedBuildings.length > 0,
    'drive-connected': offlineGrantPresent,
    'class-added': rosters.length > 0,
    'org-has-buildings': orgBuildingsLoaded
      ? orgBuildings.length > 0
      : undefined,
    'district-account': !isExternalUser,
    'classlink-on': classLinkOn,
  };
  return (ref) => checkTourCondition(ref, facts, canAccessFeature);
}
