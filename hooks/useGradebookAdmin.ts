import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { logError } from '@/utils/logError';
import {
  GRADEBOOK_COLLECTIONS,
  ORG_GRADEBOOK_SETTINGS_ID,
  type GradebookSettingsBody,
  type GradingPeriod,
  storedScale,
  type ProficiencyScale,
} from '@/utils/gradebook/gradebookCore';
import { useGradingPeriodSets } from '@/hooks/useGradingPeriods';
import {
  parseDistrictConfig,
  parseProficiencyScale,
  pickSettingsBody,
  type DistrictConfig,
} from '@/utils/gradebook/settingsConfig';
import type { GradingPeriodSet } from '@/utils/gradebook/gradingPeriods';

export interface GradebookAdminData {
  loading: boolean;
  orgId: string | null;
  scale: ProficiencyScale;
  periodSets: GradingPeriodSet[];
  districtConfigs: DistrictConfig[];
}

export interface GradebookAdminActions {
  saveScale: (scale: ProficiencyScale) => Promise<void>;
  newDocId: (kind: 'periods' | 'district') => string;
  savePeriodSet: (
    id: string,
    set: { name: string; buildingIds: string[]; periods: GradingPeriod[] }
  ) => Promise<void>;
  deletePeriodSet: (id: string) => Promise<void>;
  saveDistrictConfig: (
    id: string,
    config: {
      body: GradebookSettingsBody;
      buildingIds: string[];
      isDefault: boolean;
    }
  ) => Promise<void>;
  deleteDistrictConfig: (id: string) => Promise<void>;
}

/** Admin Settings > Gradebook: D17 district scale, D18 period sets, D16 district configurations. */
export function useGradebookAdmin(): GradebookAdminData &
  GradebookAdminActions {
  const { orgId, user } = useAuth();
  const live = !isAuthBypass && !!user && !!orgId;
  const { sets: periodSets, loading: periodsLoading } = useGradingPeriodSets();
  const [scale, setScale] = useState<ProficiencyScale | null>(null);
  const [district, setDistrict] = useState<{
    orgId: string | null;
    list: DistrictConfig[] | null;
  }>({ orgId: null, list: null });

  useEffect(() => {
    if (!live) return;
    return onSnapshot(
      doc(db, 'admin_settings', ORG_GRADEBOOK_SETTINGS_ID),
      (snap) => setScale(parseProficiencyScale(snap.data())),
      (err) => {
        logError('useGradebookAdmin.scale', err);
        setScale(parseProficiencyScale(undefined));
      }
    );
  }, [live]);

  useEffect(() => {
    if (!live || !orgId) return;
    return onSnapshot(
      query(
        collection(db, GRADEBOOK_COLLECTIONS.districtConfigs),
        where('orgId', '==', orgId)
      ),
      (snap) =>
        setDistrict({
          orgId,
          list: snap.docs
            .map((d) => parseDistrictConfig(d.id, d.data()))
            .sort((a, b) => a.body.name.localeCompare(b.body.name)),
        }),
      (err) => {
        logError('useGradebookAdmin.district', err);
        setDistrict({ orgId, list: [] });
      }
    );
  }, [live, orgId]);

  const saveScale = useCallback(async (next: ProficiencyScale) => {
    await setDoc(doc(db, 'admin_settings', ORG_GRADEBOOK_SETTINGS_ID), {
      ...storedScale(next),
      updatedAt: Date.now(),
    });
  }, []);

  const newDocId = useCallback(
    (kind: 'periods' | 'district') =>
      doc(
        collection(
          db,
          kind === 'periods'
            ? GRADEBOOK_COLLECTIONS.periodSets
            : GRADEBOOK_COLLECTIONS.districtConfigs
        )
      ).id,
    []
  );

  const savePeriodSet = useCallback<GradebookAdminActions['savePeriodSet']>(
    async (id, set) => {
      if (!orgId) throw new Error('No organization');
      await setDoc(doc(db, GRADEBOOK_COLLECTIONS.periodSets, id), {
        name: set.name,
        orgId,
        buildingIds: set.buildingIds,
        periods: set.periods.map((p) => ({ ...p })),
        updatedAt: Date.now(),
      });
    },
    [orgId]
  );

  const deletePeriodSet = useCallback(async (id: string) => {
    await deleteDoc(doc(db, GRADEBOOK_COLLECTIONS.periodSets, id));
  }, []);

  const saveDistrictConfig = useCallback<
    GradebookAdminActions['saveDistrictConfig']
  >(
    async (id, config) => {
      if (!orgId) throw new Error('No organization');
      await setDoc(doc(db, GRADEBOOK_COLLECTIONS.districtConfigs, id), {
        ...pickSettingsBody(config.body),
        orgId,
        buildingIds: config.buildingIds,
        isDefault: config.isDefault,
        updatedAt: Date.now(),
      });
    },
    [orgId]
  );

  const deleteDistrictConfig = useCallback(async (id: string) => {
    await deleteDoc(doc(db, GRADEBOOK_COLLECTIONS.districtConfigs, id));
  }, []);

  const districtCurrent = district.orgId === orgId ? district.list : null;
  return {
    loading:
      live && (scale === null || districtCurrent === null || periodsLoading),
    orgId,
    scale: scale ?? parseProficiencyScale(undefined),
    periodSets,
    districtConfigs: districtCurrent ?? [],
    saveScale,
    newDocId,
    savePeriodSet,
    deletePeriodSet,
    saveDistrictConfig,
    deleteDistrictConfig,
  };
}
