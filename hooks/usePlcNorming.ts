import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, isAuthBypass } from '@/config/firebase';
import type { PlcNormingCopy, PlcNormingLevel } from '@/types';
import {
  isNormingLevel,
  normingFlagKey,
  parseNormingCopy,
} from '@/utils/plcNorming';

export interface NormingFlagRequest {
  sessionId: string;
  responseKey: string;
  questionId: string;
  slot: 'primary' | 'addendum';
  level: PlcNormingLevel | null;
}

interface NormingFlagResult {
  normingId: string | null;
  level: PlcNormingLevel | null;
}

export async function callSetPlcNormingFlag(
  req: NormingFlagRequest | { plcId: string; normingId: string; level: null }
): Promise<NormingFlagResult> {
  const fn = httpsCallable<typeof req, NormingFlagResult>(
    functions,
    'setPlcNormingFlagV1'
  );
  return (await fn(req)).data;
}

/** Norming copies for one PLC assessment; `enabled` false skips the listener. */
export function usePlcNormingCopies(
  plcId: string,
  assessmentId: string,
  enabled: boolean
): { copies: PlcNormingCopy[]; loading: boolean; error: boolean } {
  const [state, setState] = useState<{
    key: string;
    copies: PlcNormingCopy[];
    error: boolean;
  } | null>(null);
  const key = `${plcId}/${assessmentId}`;
  const active = enabled && !isAuthBypass && !!plcId && !!assessmentId;

  useEffect(() => {
    if (!active) return;
    return onSnapshot(
      query(
        collection(db, 'plcs', plcId, 'norming'),
        where('assessmentId', '==', assessmentId)
      ),
      (snap) => {
        const copies = snap.docs
          .map((d) => parseNormingCopy(d.id, d.data()))
          .filter((c): c is PlcNormingCopy => c !== null);
        setState({ key, copies, error: false });
      },
      () => setState({ key, copies: [], error: true })
    );
  }, [active, plcId, assessmentId, key]);

  const current = state?.key === key ? state : null;
  return {
    copies: active ? (current?.copies ?? []) : [],
    loading: active && !current,
    error: current?.error ?? false,
  };
}

/** The signed-in teacher's own flags in one session, keyed by `normingFlagKey`. */
export function useMyNormingFlags(
  uid: string | undefined,
  sessionId: string | undefined,
  enabled: boolean
): Map<string, PlcNormingLevel> {
  const [state, setState] = useState<{
    key: string;
    flags: Map<string, PlcNormingLevel>;
  } | null>(null);
  const key = `${uid ?? ''}/${sessionId ?? ''}`;
  const active = enabled && !isAuthBypass && !!uid && !!sessionId;

  useEffect(() => {
    if (!active || !uid || !sessionId) return;
    return onSnapshot(
      query(
        collection(db, 'plc_norming_sources'),
        where('flaggedByUid', '==', uid),
        where('sessionId', '==', sessionId)
      ),
      (snap) => {
        const flags = new Map<string, PlcNormingLevel>();
        for (const d of snap.docs) {
          const data = d.data();
          if (!isNormingLevel(data.level)) continue;
          flags.set(
            normingFlagKey(
              String(data.responseKey ?? ''),
              String(data.questionId ?? ''),
              String(data.slot ?? 'primary')
            ),
            data.level
          );
        }
        setState({ key, flags });
      },
      () => setState({ key, flags: new Map() })
    );
  }, [active, uid, sessionId, key]);

  return active && state?.key === key ? state.flags : EMPTY_FLAGS;
}

const EMPTY_FLAGS = new Map<string, PlcNormingLevel>();
