import React, { useEffect, useMemo, useState } from 'react';
import { FileUp, Plus, Printer } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { usePlcs } from '@/hooks/usePlcs';
import { useRubrics } from '@/hooks/useRubrics';
import { Button } from '@/components/common/Button';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import {
  rasterizeWorksheet,
  type WorksheetPages,
} from '@/utils/scoredWorkWorksheet';
import { planScoredWork } from '@/utils/scoredWorkPlan';
import {
  openPrintWindow,
  printScoredWork,
  type WorksheetOrientation,
} from '@/utils/scoredWorkPrint';
import { saveScoredWork } from '@/utils/scoredWorkStore';
import { ensureWorkFolder, writeNamesManifest } from '@/utils/scoredWorkDrive';
import { rubricMaxPoints } from '@/utils/scoredWorkMath';
import {
  DEFAULT_SCORED_QUESTIONS,
  MAX_SCORED_QUESTIONS,
  buildQuestionsRubric,
} from '@/utils/scoredWorkQuestions';
import { WorksheetPreview } from './WorksheetPreview';

interface NewScoredWorkProps {
  onCreated: (workId: string) => void;
  onOpenRubricBuilder: () => void;
  /** A rubric just made in the builder; picked once, then the teacher can change it. */
  requestedRubricId: string | null;
}

type Scoring = 'questions' | 'rubric';

const MAX_SPARES = 10;
const PLC_PREF_KEY = 'spartboard_scored_work_plc';

const readPlcPref = (): string => {
  try {
    return localStorage.getItem(PLC_PREF_KEY) ?? '';
  } catch {
    return '';
  }
};

const titleFromFile = (name: string): string =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();

interface LoadedPages {
  file: File;
  trim: boolean;
  value: WorksheetPages;
}

export const NewScoredWork: React.FC<NewScoredWorkProps> = ({
  onCreated,
  onOpenRubricBuilder,
  requestedRubricId,
}) => {
  const { user } = useAuth();
  const { rosters, addToast } = useDashboard();
  const { driveService } = useGoogleDrive();
  const { plcs } = usePlcs();
  const { rubrics } = useRubrics(user?.uid);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [scoring, setScoring] = useState<Scoring>('questions');
  const [questionCount, setQuestionCount] = useState(DEFAULT_SCORED_QUESTIONS);
  const [rubricId, setRubricId] = useState('');
  const [rosterIds, setRosterIds] = useState<string[] | null>(null);
  const [spares, setSpares] = useState(2);
  const [orientation, setOrientation] = useState<WorksheetOrientation>('auto');
  const [trim, setTrim] = useState(true);
  const [plcId, setPlcId] = useState(readPlcPref);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState<LoadedPages | null>(null);
  const [loadError, setLoadError] = useState<{ file: File; message: string }>();
  const [adoptedRubricId, setAdoptedRubricId] = useState<string | null>(null);
  if (requestedRubricId && requestedRubricId !== adoptedRubricId) {
    setAdoptedRubricId(requestedRubricId);
    setRubricId(requestedRubricId);
    setScoring('rubric');
  }

  // Read the worksheet as soon as it is chosen, so the preview and the print share one raster.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let result: WorksheetPages | null = null;
    rasterizeWorksheet(file, { trim })
      .then((value) => {
        if (cancelled) {
          value.release();
          return;
        }
        result = value;
        setLoaded({ file, trim, value });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError({
            file,
            message:
              error instanceof Error
                ? error.message
                : 'Could not read that file.',
          });
        }
      });
    return () => {
      cancelled = true;
      // A print window may still be reading these images.
      const held = result;
      if (held) setTimeout(() => held.release(), 60_000);
    };
  }, [file, trim]);

  const pages =
    loaded && loaded.file === file && loaded.trim === trim
      ? loaded.value
      : null;
  const loading = !!file && !pages && loadError?.file !== file;
  const rubric = useMemo(
    () => rubrics.find((r) => r.id === rubricId) ?? null,
    [rubrics, rubricId]
  );
  const selectedRosters =
    rosterIds ?? (rosters.length === 1 ? [rosters[0].id] : []);
  const studentCount = rosters
    .filter((r) => selectedRosters.includes(r.id))
    .reduce((n, r) => n + r.students.length, 0);
  const scoringReady =
    scoring === 'questions' ? questionCount >= 1 : !!rubric?.criteria.length;
  const ready =
    !!user && !!title.trim() && !!pages && scoringReady && studentCount > 0;

  const chooseFile = (f: File | null) => {
    setFile(f);
    if (f && !titleEdited) setTitle(titleFromFile(f.name));
  };

  const toggleRoster = (id: string) =>
    setRosterIds(
      selectedRosters.includes(id)
        ? selectedRosters.filter((x) => x !== id)
        : [...selectedRosters, id]
    );

  const handlePrint = async () => {
    if (!user || !file || !pages || !ready) return;
    if (!driveService) {
      addToast('Connect Google Drive to keep your scans.', 'error');
      return;
    }
    let printWindow: Window;
    try {
      printWindow = openPrintWindow();
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'Printing blocked.',
        'error'
      );
      return;
    }
    setBusy(true);
    let printed = false;
    try {
      const now = Date.now();
      const chosen =
        scoring === 'questions'
          ? buildQuestionsRubric(title.trim(), questionCount, now)
          : rubric;
      if (!chosen) throw new Error('Choose a rubric first.');
      const { work, sheets } = planScoredWork({
        id: crypto.randomUUID(),
        title: title.trim(),
        rubric: chosen,
        selections: rosters
          .filter((r) => selectedRosters.includes(r.id))
          .map((roster) => ({ roster, students: roster.students })),
        spareCount: spares,
        pageCount: pages.srcs.length,
        now,
      });
      const folderId = await ensureWorkFolder(
        driveService,
        work.title,
        work.id
      );
      await writeNamesManifest(driveService, folderId, sheets);
      const worksheet = await driveService.uploadFileToFolderId(
        file,
        `worksheet-${file.name}`,
        folderId
      );
      await saveScoredWork(user.uid, {
        ...work,
        driveFolderId: folderId,
        worksheetFileId: worksheet.id,
        scoring,
        orientation,
        trimMargins: trim,
        ...(plcId ? { shareWith: { plcId } } : {}),
      });
      try {
        localStorage.setItem(PLC_PREF_KEY, plcId);
      } catch {
        // The choice just will not be remembered.
      }
      printScoredWork(
        {
          workId: work.id,
          title: work.title,
          pageCount: work.pageCount,
          sheets,
          pageImageSrc: pages.srcs,
          orientation,
        },
        pages.aspects,
        () => printWindow
      );
      printed = true;
      onCreated(work.id);
    } catch (error) {
      addToast(
        error instanceof Error
          ? error.message
          : 'Could not prepare the sheets.',
        'error'
      );
    } finally {
      if (!printed) printWindow.close();
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_auto] pb-6">
      <div className="space-y-5 max-w-xl min-w-0">
        <div>
          <span className="block text-sm font-semibold text-slate-700 mb-1">
            Worksheet
          </span>
          <label className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-600 cursor-pointer hover:bg-slate-50">
            <FileUp className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {file ? file.name : 'Choose a PDF or image'}
            </span>
            <input // no-tour-anchor: preview feature, tours are added when it opens
              type="file"
              accept="application/pdf,image/*"
              className="sr-only"
              onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {loadError && loadError.file === file && (
            <p className="text-sm text-rose-700 mt-1">{loadError.message}</p>
          )}
        </div>

        <label className="block">
          <span className="block text-sm font-semibold text-slate-700 mb-1">
            Name
          </span>
          <input // no-tour-anchor: preview feature, tours are added when it opens
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleEdited(true);
            }}
            maxLength={80}
            placeholder="Unit 3 essay"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="space-y-2">
          <span className="block text-sm font-semibold text-slate-700">
            Scoring
          </span>
          <SegmentedControl<Scoring>
            value={scoring}
            onChange={setScoring}
            ariaLabel="Scoring"
            role="radiogroup"
            options={[
              { value: 'questions', label: 'Right or wrong' },
              { value: 'rubric', label: 'Rubric' },
            ]}
          />
          {scoring === 'questions' ? (
            <label className="flex items-center gap-3 text-sm text-slate-700">
              Questions
              <input // no-tour-anchor: preview feature, tours are added when it opens
                type="number"
                min={1}
                max={MAX_SCORED_QUESTIONS}
                value={questionCount}
                onChange={(e) =>
                  setQuestionCount(
                    Math.max(
                      1,
                      Math.min(
                        MAX_SCORED_QUESTIONS,
                        Number(e.target.value) || 1
                      )
                    )
                  )
                }
                className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          ) : (
            <div className="flex gap-2">
              <select // no-tour-anchor: preview feature, tours are added when it opens
                aria-label="Rubric"
                value={rubricId}
                onChange={(e) => setRubricId(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="">Choose a rubric</option>
                {rubrics.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} ({rubricMaxPoints(r)} pts)
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                onClick={onOpenRubricBuilder}
                icon={<Plus className="w-4 h-4" aria-hidden="true" />}
              >
                New rubric
              </Button>
            </div>
          )}
        </div>

        <fieldset>
          <legend className="text-sm font-semibold text-slate-700 mb-1">
            Classes
          </legend>
          <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-40 overflow-y-auto">
            {rosters.length === 0 && (
              <p className="px-3 py-2 text-sm text-slate-500">
                Add a class first.
              </p>
            )}
            {rosters.map((r) => (
              <label
                key={r.id}
                className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50"
              >
                <input // no-tour-anchor: preview feature, tours are added when it opens
                  type="checkbox"
                  checked={selectedRosters.includes(r.id)}
                  onChange={() => toggleRoster(r.id)}
                />
                <span className="flex-1 truncate">{r.name}</span>
                <span className="text-slate-500">{r.students.length}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-end gap-4">
          <label className="block text-sm">
            <span className="block font-semibold text-slate-700 mb-1">
              Blank spares
            </span>
            <input // no-tour-anchor: preview feature, tours are added when it opens
              type="number"
              min={0}
              max={MAX_SPARES}
              value={spares}
              onChange={(e) =>
                setSpares(
                  Math.max(0, Math.min(MAX_SPARES, Number(e.target.value) || 0))
                )
              }
              className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm min-w-0 flex-1">
            <span className="block font-semibold text-slate-700 mb-1">
              Share results with
            </span>
            <select // no-tour-anchor: preview feature, tours are added when it opens
              value={plcId}
              onChange={(e) => setPlcId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
            >
              <option value="">No group yet</option>
              {plcs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Button
          onClick={() => void handlePrint()}
          disabled={!ready || busy}
          isLoading={busy}
          icon={<Printer className="w-4 h-4" aria-hidden="true" />}
        >
          Print {studentCount + spares} sheets
        </Button>
      </div>

      <aside className="space-y-3 md:w-[19rem]">
        <span className="block text-sm font-semibold text-slate-700">
          Page preview
        </span>
        {pages ? (
          <WorksheetPreview
            src={pages.srcs[0]}
            aspect={pages.aspects[0]}
            orientation={orientation}
            title={title}
          />
        ) : (
          <div className="flex h-40 w-[19rem] max-w-full items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-500">
            {loading ? 'Reading the file' : 'Choose a worksheet'}
          </div>
        )}
        <label className="block text-sm">
          <span className="block font-semibold text-slate-700 mb-1">
            Orientation
          </span>
          <select // no-tour-anchor: preview feature, tours are added when it opens
            value={orientation}
            onChange={(e) =>
              setOrientation(e.target.value as WorksheetOrientation)
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
          >
            <option value="auto">Best fit</option>
            <option value="upright">Upright</option>
            <option value="sideways">Turned sideways</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input // no-tour-anchor: preview feature, tours are added when it opens
            type="checkbox"
            checked={trim}
            onChange={(e) => setTrim(e.target.checked)}
          />
          Crop blank page margins
        </label>
      </aside>
    </div>
  );
};
