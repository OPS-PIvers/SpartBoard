import { useCallback, useEffect, useState } from 'react';
import {
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { logError } from '@/utils/logError';
import {
  DEFAULT_PROFICIENCY_SCALE,
  ORG_GRADEBOOK_SETTINGS_ID,
  PLC_GRADEBOOK_META_ID,
  type GradebookSettingsBody,
  type ProficiencyScale,
} from '@/utils/gradebook/gradebookCore';
import {
  parseProficiencyScale,
  parseSettingsBody,
  pickSettingsBody,
} from '@/utils/gradebook/settingsConfig';

type Cutoffs = { proficient: number; approaching: number };

interface State {
  plcId: string | null;
  /** undefined while loading, null when the PLC has no set. */
  body: GradebookSettingsBody | null | undefined;
  cutoffs: Cutoffs | null;
  /** The learningTargets doc exists, so a cutoff edit can update it in place. */
  targetsDoc: boolean;
}

/** D16 PLC Gradebook subsection: `meta/gradebookSettings` plus the cutoffs on `meta/learningTargets`. */
export function usePlcGradebookSettings(plcId: string, plcName: string) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const live = !isAuthBypass && !!uid;
  const [state, setState] = useState<State>({
    plcId: null,
    body: undefined,
    cutoffs: null,
    targetsDoc: false,
  });
  const [districtScale, setDistrictScale] = useState<ProficiencyScale>(
    DEFAULT_PROFICIENCY_SCALE
  );

  useEffect(() => {
    if (!live) return;
    const unsubSet = onSnapshot(
      doc(db, 'plcs', plcId, 'meta', PLC_GRADEBOOK_META_ID),
      (snap) =>
        setState((prev) => ({
          ...(prev.plcId === plcId
            ? prev
            : { cutoffs: null, targetsDoc: false }),
          plcId,
          body: snap.exists() ? parseSettingsBody(snap.data(), plcName) : null,
        })),
      (err) => {
        logError('usePlcGradebookSettings.set', err, { plcId });
        setState((prev) => ({ ...prev, plcId, body: null }));
      }
    );
    const unsubTargets = onSnapshot(
      doc(db, 'plcs', plcId, 'meta', 'learningTargets'),
      (snap) => {
        const mc = snap.data()?.masteryCutoffs as
          | Record<string, unknown>
          | undefined;
        const cutoffs =
          typeof mc?.proficient === 'number' &&
          typeof mc?.approaching === 'number'
            ? { proficient: mc.proficient, approaching: mc.approaching }
            : null;
        setState((prev) => ({
          ...(prev.plcId === plcId ? prev : { body: undefined }),
          plcId,
          cutoffs,
          targetsDoc: snap.exists(),
        }));
      },
      (err) => logError('usePlcGradebookSettings.cutoffs', err, { plcId })
    );
    const unsubOrg = onSnapshot(
      doc(db, 'admin_settings', ORG_GRADEBOOK_SETTINGS_ID),
      (snap) => setDistrictScale(parseProficiencyScale(snap.data())),
      () => setDistrictScale(DEFAULT_PROFICIENCY_SCALE)
    );
    return () => {
      unsubSet();
      unsubTargets();
      unsubOrg();
    };
  }, [live, plcId, plcName]);

  const current = state.plcId === plcId;

  const save = useCallback(
    async (body: GradebookSettingsBody) => {
      if (!uid) throw new Error('Not signed in');
      await setDoc(doc(db, 'plcs', plcId, 'meta', PLC_GRADEBOOK_META_ID), {
        ...pickSettingsBody(body),
        updatedBy: uid,
        updatedAt: Date.now(),
      });
    },
    [plcId, uid]
  );

  const remove = useCallback(async () => {
    await deleteDoc(doc(db, 'plcs', plcId, 'meta', PLC_GRADEBOOK_META_ID));
  }, [plcId]);

  const targetsDoc = current && state.targetsDoc;
  const saveCutoffs = useCallback(
    async (cutoffs: Cutoffs) => {
      const ref = doc(db, 'plcs', plcId, 'meta', 'learningTargets');
      const masteryCutoffs = {
        proficient: Math.round(cutoffs.proficient),
        approaching: Math.round(cutoffs.approaching),
      };
      if (targetsDoc)
        await updateDoc(ref, { masteryCutoffs, updatedAt: Date.now() });
      else
        await setDoc(ref, {
          targets: [],
          masteryCutoffs,
          updatedAt: Date.now(),
        });
    },
    [plcId, targetsDoc]
  );

  return {
    loading: live && (!current || state.body === undefined),
    body: current ? (state.body ?? null) : null,
    cutoffs: current ? state.cutoffs : null,
    districtScale,
    save,
    remove,
    saveCutoffs,
  };
}
