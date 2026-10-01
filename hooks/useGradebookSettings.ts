import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { usePlcs } from '@/hooks/usePlcs';
import { useOrganization } from '@/hooks/useOrganization';
import { logError } from '@/utils/logError';
import {
  DEFAULT_PROFICIENCY_SCALE,
  GRADEBOOK_COLLECTIONS,
  ORG_GRADEBOOK_SETTINGS_ID,
  PLC_GRADEBOOK_META_ID,
  resolveScale,
  type GradebookConfigRef,
  type GradebookSettingsBody,
  type ProficiencyScale,
} from '@/utils/gradebook/gradebookCore';
import {
  inBuildings,
  parseDistrictConfig,
  parseProficiencyScale as parseScale,
  parseSettingsBody as parseBody,
  pickSettingsBody as pickBody,
  defaultSettingsBody,
  resolveClassConfig,
  type DistrictConfig,
  type GradebookConfigEntry,
} from '@/utils/gradebook/settingsConfig';

export interface GradebookScaleOption {
  /** `district`, `plc:{plcId}` or `custom`. */
  value: string;
  label: string;
  scale: ProficiencyScale | null;
}

export interface GradebookSettingsData {
  loading: boolean;
  /** Personal, then PLC, then district configurations. */
  entries: GradebookConfigEntry[];
  /** Classes that have a state doc; a null value means built-in defaults. */
  classRefs: ReadonlyMap<string, GradebookConfigRef | null>;
  districtScale: ProficiencyScale;
  scaleOptions: GradebookScaleOption[];
}

export interface GradebookSettingsActions {
  /** Creates a personal configuration and returns its id. */
  createConfig: (body: GradebookSettingsBody, id?: string) => Promise<string>;
  saveConfig: (configId: string, body: GradebookSettingsBody) => Promise<void>;
  deleteConfig: (configId: string) => Promise<void>;
  setClassConfig: (
    rosterId: string,
    ref: GradebookConfigRef | null
  ) => Promise<void>;
  /** A fresh personal configuration id, so the caller can select it before the write lands. */
  newConfigId: () => string;
}

export type UseGradebookSettingsResult = GradebookSettingsData &
  GradebookSettingsActions & {
    configForClass: (rosterId: string) => GradebookConfigEntry;
  };

interface PlcSnapshot {
  set: GradebookSettingsBody | null;
  cutoffs: { proficient: number; approaching: number } | null;
}

/** D16 settings configurations: personal docs, PLC sets, district configs and per-class links. */
export function useGradebookSettings(
  enabled = true
): UseGradebookSettingsResult {
  const { user, orgId, selectedBuildings } = useAuth();
  const uid = user?.uid ?? null;
  const live = enabled && !isAuthBypass && !!uid;
  const { plcs } = usePlcs({ enabled: live });
  const { organization } = useOrganization(live ? orgId : null);

  const [personal, setPersonal] = useState<
    { id: string; body: GradebookSettingsBody }[] | null
  >(null);
  const [classRefs, setClassRefs] = useState<Map<
    string,
    GradebookConfigRef | null
  > | null>(null);
  const [plcData, setPlcData] = useState<Record<string, PlcSnapshot>>({});
  const [district, setDistrict] = useState<DistrictConfig[]>([]);
  const [serverLoaded, setServerLoaded] = useState({
    personal: false,
    classes: false,
  });
  const [districtScale, setDistrictScale] = useState<ProficiencyScale>(
    DEFAULT_PROFICIENCY_SCALE
  );

  useEffect(() => {
    if (!live || !uid) return;
    const unsubSettings = onSnapshot(
      collection(db, 'users', uid, GRADEBOOK_COLLECTIONS.userSettings),
      { includeMetadataChanges: true },
      (snap) => {
        setPersonal(
          snap.docs
            .map((d) => ({
              id: d.id,
              body: parseBody(d.data(), 'My settings'),
            }))
            .sort((a, b) => a.body.name.localeCompare(b.body.name))
        );
        if (!snap.metadata.fromCache)
          setServerLoaded((s) => (s.personal ? s : { ...s, personal: true }));
      },
      (err) => {
        logError('useGradebookSettings.personal', err);
        setPersonal([]);
      }
    );
    const unsubClasses = onSnapshot(
      collection(db, 'users', uid, GRADEBOOK_COLLECTIONS.userClasses),
      { includeMetadataChanges: true },
      (snap) => {
        if (!snap.metadata.fromCache)
          setServerLoaded((s) => (s.classes ? s : { ...s, classes: true }));
        const m = new Map<string, GradebookConfigRef | null>();
        snap.docs.forEach((d) => {
          const ref = d.data().configRef as
            | GradebookConfigRef
            | null
            | undefined;
          m.set(d.id, ref ?? null);
        });
        setClassRefs(m);
      },
      (err) => {
        logError('useGradebookSettings.classes', err);
        setClassRefs(new Map());
      }
    );
    const unsubOrg = onSnapshot(
      doc(db, 'admin_settings', ORG_GRADEBOOK_SETTINGS_ID),
      (snap) => setDistrictScale(parseScale(snap.data())),
      () => setDistrictScale(DEFAULT_PROFICIENCY_SCALE)
    );
    return () => {
      unsubSettings();
      unsubClasses();
      unsubOrg();
    };
  }, [live, uid]);

  useEffect(() => {
    if (!live || !orgId) return;
    return onSnapshot(
      query(
        collection(db, GRADEBOOK_COLLECTIONS.districtConfigs),
        where('orgId', '==', orgId)
      ),
      (snap) =>
        setDistrict(snap.docs.map((d) => parseDistrictConfig(d.id, d.data()))),
      (err) => {
        logError('useGradebookSettings.district', err);
        setDistrict([]);
      }
    );
  }, [live, orgId]);

  const plcKey = plcs.map((p) => p.id).join('|');
  useEffect(() => {
    if (!live || !plcKey) return;
    const unsubs = plcKey.split('|').flatMap((plcId) => [
      onSnapshot(
        doc(db, 'plcs', plcId, 'meta', PLC_GRADEBOOK_META_ID),
        (snap) =>
          setPlcData((prev) => ({
            ...prev,
            [plcId]: {
              cutoffs: prev[plcId]?.cutoffs ?? null,
              set: snap.exists()
                ? parseBody(snap.data(), 'PLC settings')
                : null,
            },
          })),
        (err) => logError('useGradebookSettings.plcSet', err, { plcId })
      ),
      onSnapshot(
        doc(db, 'plcs', plcId, 'meta', 'learningTargets'),
        (snap) => {
          const mc = snap.data()?.masteryCutoffs as
            | { proficient?: unknown; approaching?: unknown }
            | undefined;
          const cutoffs =
            typeof mc?.proficient === 'number' &&
            typeof mc?.approaching === 'number'
              ? { proficient: mc.proficient, approaching: mc.approaching }
              : null;
          setPlcData((prev) => ({
            ...prev,
            [plcId]: { set: prev[plcId]?.set ?? null, cutoffs },
          }));
        },
        (err) => logError('useGradebookSettings.plcCutoffs', err, { plcId })
      ),
    ]);
    return () => unsubs.forEach((u) => u());
  }, [live, plcKey]);

  // Every teacher starts with one configuration named My settings (D16).
  const seeded = useRef(false);
  useEffect(() => {
    if (!live || !uid || seeded.current || !personal || !classRefs) return;
    // A cache-only empty snapshot must not seed a duplicate.
    if (!serverLoaded.personal || !serverLoaded.classes) return;
    seeded.current = true;
    if (personal.length > 0 || classRefs.size > 0) return;
    const ref = doc(
      collection(db, 'users', uid, GRADEBOOK_COLLECTIONS.userSettings)
    );
    void setDoc(ref, {
      ...defaultSettingsBody('My settings'),
      ownerUid: uid,
      editorUids: [],
      isDefault: true,
      updatedAt: Date.now(),
    }).catch((err) => logError('useGradebookSettings.seed', err));
  }, [live, uid, personal, classRefs, serverLoaded]);

  const entries = useMemo<GradebookConfigEntry[]>(() => {
    const out: GradebookConfigEntry[] = (personal ?? []).map((p) => ({
      key: `personal:${p.id}`,
      ref: { source: 'personal', configId: p.id },
      source: 'personal',
      name: p.body.name,
      body: p.body,
      readOnly: false,
    }));
    for (const plc of plcs) {
      const set = plcData[plc.id]?.set;
      if (!set) continue;
      out.push({
        key: `plc:${plc.id}`,
        ref: { source: 'plc', plcId: plc.id },
        source: 'plc',
        name: plc.name,
        body: set,
        readOnly: true,
      });
    }
    for (const d of district) {
      if (!inBuildings(d.buildingIds, selectedBuildings)) continue;
      out.push({
        key: `district:${d.id}`,
        ref: { source: 'district', configId: d.id },
        source: 'district',
        name: d.body.name,
        body: d.body,
        readOnly: true,
        isDefault: d.isDefault,
      });
    }
    return out;
  }, [personal, plcs, plcData, district, selectedBuildings]);

  const scaleOptions = useMemo<GradebookScaleOption[]>(() => {
    const orgName = organization?.name?.trim();
    const out: GradebookScaleOption[] = [
      {
        value: 'district',
        label: orgName ? `${orgName} district scale` : 'District scale',
        scale: districtScale,
      },
    ];
    for (const plc of plcs) {
      const cutoffs = plcData[plc.id]?.cutoffs;
      out.push({
        value: `plc:${plc.id}`,
        label: `${plc.name} scale`,
        scale: resolveScale(
          { source: 'plc', plcId: plc.id },
          districtScale,
          cutoffs ?? null
        ),
      });
    }
    out.push({ value: 'custom', label: 'Custom', scale: null });
    return out;
  }, [organization?.name, districtScale, plcs, plcData]);

  const refs = useMemo(() => classRefs ?? new Map(), [classRefs]);

  const configForClass = useCallback(
    (rosterId: string) => resolveClassConfig(rosterId, refs, entries),
    [refs, entries]
  );

  const settingsDoc = useCallback(
    (configId: string) => {
      if (!uid) throw new Error('Not signed in');
      return doc(
        db,
        'users',
        uid,
        GRADEBOOK_COLLECTIONS.userSettings,
        configId
      );
    },
    [uid]
  );

  const createConfig = useCallback(
    async (body: GradebookSettingsBody, id?: string) => {
      if (!uid) throw new Error('Not signed in');
      const ref = id
        ? settingsDoc(id)
        : doc(collection(db, 'users', uid, GRADEBOOK_COLLECTIONS.userSettings));
      await setDoc(ref, {
        ...pickBody(body),
        ownerUid: uid,
        editorUids: [],
        updatedAt: Date.now(),
      });
      return ref.id;
    },
    [uid, settingsDoc]
  );

  const saveConfig = useCallback(
    async (configId: string, body: GradebookSettingsBody) => {
      if (!uid) throw new Error('Not signed in');
      await setDoc(
        settingsDoc(configId),
        {
          ...pickBody(body),
          ownerUid: uid,
          editorUids: [],
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    },
    [uid, settingsDoc]
  );

  const deleteConfig = useCallback(
    async (configId: string) => {
      await deleteDoc(settingsDoc(configId));
    },
    [settingsDoc]
  );

  const setClassConfig = useCallback(
    async (rosterId: string, ref: GradebookConfigRef | null) => {
      if (!uid) throw new Error('Not signed in');
      await setDoc(
        doc(db, 'users', uid, GRADEBOOK_COLLECTIONS.userClasses, rosterId),
        {
          rosterId,
          ownerUid: uid,
          editorUids: [],
          configRef: ref,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    },
    [uid]
  );

  const newConfigId = useCallback(
    () =>
      doc(
        collection(db, 'users', uid ?? '_', GRADEBOOK_COLLECTIONS.userSettings)
      ).id,
    [uid]
  );

  return {
    newConfigId,
    loading: live && (personal === null || classRefs === null),
    entries,
    classRefs: refs,
    districtScale,
    scaleOptions,
    configForClass,
    createConfig,
    saveConfig,
    deleteConfig,
    setClassConfig,
  };
}
