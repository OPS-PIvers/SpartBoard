import React, { useMemo, useState } from 'react';
import { useGradebook } from '@/components/gradebook/GradebookContext';
import { GRADEBOOK_KIND_META } from '@/components/gradebook/kindMeta';
import { useCompareAverages } from '@/hooks/gradebook/useCompareAverages';
import { useTargetLookup } from '@/hooks/gradebook/useTargetLookup';
import {
  COMPLETION_ONLY_KINDS,
  GRADEBOOK_KINDS,
} from '@/utils/gradebook/gradebookCore';
import {
  collectTargets,
  type AnalysisData,
  type RosterFacts,
} from '@/utils/gradebook/gradebookAnalysis';
import { columnInPeriod, studentName } from '@/utils/gradebook/gradebookModel';
import { buildGradebookPath } from '@/utils/gradebookPath';
import { spaNavigate } from '@/utils/plcPath';
import { GradebookAnalysisView } from './GradebookAnalysisView';
import { GradebookAnalyzeModal } from './GradebookAnalyzeModal';

const KINDS = GRADEBOOK_KINDS.filter(
  (k) => !COMPLETION_ONLY_KINDS.includes(k)
).map((id) => ({ id, label: GRADEBOOK_KIND_META[id].label }));

/** Class name without the course prefix ("English 8 · Period 4" -> "Period 4"). */
function shortName(name: string): string {
  const i = name.lastIndexOf('·');
  return i >= 0 ? name.slice(i + 1).trim() : name;
}

/** D27 Data analysis tab for the selected class and grading period. */
export const GradebookAnalysis: React.FC = () => {
  const gb = useGradebook();
  const lookup = useTargetLookup();
  const [analyzeId, setAnalyzeId] = useState<string | null>(null);
  const [compareOn, setCompareOn] = useState(false);
  const others = gb.rosters.filter((r) => r.id !== gb.rosterId);
  const [compareId, setCompareId] = useState<string | null>(null);
  const compareRoster =
    others.find((r) => r.id === compareId) ?? others[0] ?? null;

  const period = gb.periods.find((p) => p.id === gb.periodId) ?? null;
  const data: AnalysisData = useMemo(
    () => ({
      students: gb.students.map((s) => ({
        uid: s.uid,
        studentId: s.student.id,
        name: studentName(s, gb.view.nameFormat),
      })),
      columns: gb.allColumns.filter(
        (c) => !c.hidden && columnInPeriod(c, period)
      ),
      cell: gb.getCell,
      overallPct: (uid) => gb.overall(uid).pct,
    }),
    [gb, period]
  );
  const roster: RosterFacts = useMemo(
    () => ({
      groups: (gb.roster.groups ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        studentIds: g.studentIds,
      })),
      accommodatedIds: new Set(
        Object.keys(gb.roster.defaultOverridesByStudentId ?? {})
      ),
    }),
    [gb.roster]
  );
  const targets = useMemo(() => collectTargets(data, lookup), [data, lookup]);
  const configs = useMemo(
    () => new Map(gb.allColumns.map((c) => [c.sessionId, c.config])),
    [gb.allColumns]
  );
  const averages = useCompareAverages(
    compareOn && compareRoster ? compareRoster.id : null,
    configs,
    gb.now,
    gb.settings,
    gb.scale
  );

  const openStudent = (uid: string) =>
    spaNavigate(buildGradebookPath(gb.rosterId, 'student', uid));

  return (
    <>
      <GradebookAnalysisView
        data={data}
        roster={roster}
        categories={gb.settings.categories}
        flags={gb.settings.flags.filter((f) => f.visibility !== 'off')}
        kinds={KINDS}
        method={gb.settings.method}
        scale={gb.scale}
        targets={targets}
        privacy={gb.privacy}
        compare={
          compareRoster
            ? {
                label: shortName(compareRoster.name),
                on: compareOn,
                setOn: setCompareOn,
                options:
                  others.length > 1
                    ? others.map((r) => ({
                        id: r.id,
                        label: shortName(r.name),
                      }))
                    : undefined,
                selectedId: compareRoster.id,
                onSelect: setCompareId,
                averages,
              }
            : null
        }
        onOpenStudent={openStudent}
        onAnalyze={setAnalyzeId}
        onGrade={() => {
          gb.setFilters({ needsGrading: true });
          spaNavigate(buildGradebookPath(gb.rosterId));
        }}
      />
      {analyzeId && (
        <GradebookAnalyzeModal
          sessionId={analyzeId}
          onClose={() => setAnalyzeId(null)}
        />
      )}
    </>
  );
};
