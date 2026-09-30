import { useContext, useMemo } from 'react';
import { AuthContext } from '@/context/AuthContextValue';
import { useGradebookSource } from '@/hooks/useGradebookSource';
import {
  gradebookDocId,
  resolveFinalScore,
  type GradebookColumnConfig,
  type GradebookSettingsBody,
  type ProficiencyScale,
} from '@/utils/gradebook/gradebookCore';
import { countedPct, mean } from '@/utils/gradebook/gradebookAnalysis';

const NO_BUILDINGS: string[] = [];

/** D32 Compare classes: another of the teacher's rosters' assignment averages; null while loading. */
export function useCompareAverages(
  rosterId: string | null,
  configs: ReadonlyMap<string, GradebookColumnConfig | null>,
  now: number,
  settings: GradebookSettingsBody,
  scale: ProficiencyScale
): Map<string, number | null> | null {
  // Read without throwing so the fixture harness (no auth provider) still renders.
  const auth = useContext(AuthContext);
  const source = useGradebookSource(
    rosterId ? (auth?.user?.uid ?? null) : null,
    rosterId,
    auth?.orgId ?? null,
    auth?.selectedBuildings ?? NO_BUILDINGS,
    // Scores resolve with this class's flag settings so both columns count flags alike.
    { settings, scale, loading: false }
  );
  return useMemo(() => {
    if (!rosterId || source.status !== 'ready') return null;
    const marks = new Map(
      source.marks.map((m) => [gradebookDocId(m.sessionId, m.studentUid), m])
    );
    const values = new Map<string, (number | null)[]>();
    for (const row of source.rows) {
      const final = resolveFinalScore(
        row,
        marks.get(gradebookDocId(row.sessionId, row.studentUid)) ?? null,
        configs.get(row.sessionId) ?? null,
        {
          flagDefs: source.settings.flags,
          autoFlags: source.settings.autoFlags,
          now,
        }
      );
      const list = values.get(row.sessionId) ?? [];
      list.push(countedPct(final));
      values.set(row.sessionId, list);
    }
    return new Map([...values].map(([id, v]) => [id, mean(v)]));
  }, [rosterId, source, configs, now]);
}
