import React, { useMemo, useState } from 'react';
import { FileUp, Printer } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useRubrics } from '@/hooks/useRubrics';
import { Button } from '@/components/common/Button';
import { rasterizeWorksheet } from '@/utils/scoredWorkWorksheet';
import { planScoredWork } from '@/utils/scoredWorkPlan';
import { printScoredWork } from '@/utils/scoredWorkPrint';
import { saveScoredWork } from '@/utils/scoredWorkStore';
import { ensureWorkFolder, writeNamesManifest } from '@/utils/scoredWorkDrive';
import { rubricMaxPoints } from '@/utils/scoredWorkMath';

interface NewScoredWorkProps {
  onCreated: (workId: string) => void;
}

const MAX_SPARES = 10;

export const NewScoredWork: React.FC<NewScoredWorkProps> = ({ onCreated }) => {
  const { user } = useAuth();
  const { rosters, addToast } = useDashboard();
  const { driveService } = useGoogleDrive();
  const { rubrics } = useRubrics(user?.uid);
  const [title, setTitle] = useState('');
  const [rubricId, setRubricId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [rosterIds, setRosterIds] = useState<string[]>([]);
  const [spares, setSpares] = useState(2);
  const [busy, setBusy] = useState(false);

  const rubric = useMemo(
    () => rubrics.find((r) => r.id === rubricId) ?? null,
    [rubrics, rubricId]
  );
  const studentCount = rosters
    .filter((r) => rosterIds.includes(r.id))
    .reduce((n, r) => n + r.students.length, 0);
  const ready =
    !!user &&
    !!title.trim() &&
    !!rubric &&
    rubric.criteria.length > 0 &&
    !!file &&
    rosterIds.length > 0;

  const toggleRoster = (id: string) =>
    setRosterIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handlePrint = async () => {
    if (!user || !rubric || !file || !ready) return;
    if (!driveService) {
      addToast('Connect Google Drive to keep your scans.', 'error');
      return;
    }
    setBusy(true);
    let pages: Awaited<ReturnType<typeof rasterizeWorksheet>> | null = null;
    try {
      pages = await rasterizeWorksheet(file);
      const { work, sheets } = planScoredWork({
        id: crypto.randomUUID(),
        title: title.trim(),
        rubric,
        selections: rosters
          .filter((r) => rosterIds.includes(r.id))
          .map((roster) => ({ roster, students: roster.students })),
        spareCount: spares,
        pageCount: pages.srcs.length,
        now: Date.now(),
      });
      const folderId = await ensureWorkFolder(
        driveService,
        work.title,
        work.id
      );
      await writeNamesManifest(driveService, folderId, sheets);
      await saveScoredWork(user.uid, { ...work, driveFolderId: folderId });
      const release = pages.release;
      printScoredWork(
        {
          workId: work.id,
          title: work.title,
          pageCount: work.pageCount,
          sheets,
          pageImageSrc: pages.srcs,
          onImagesReady: release,
        },
        pages.aspects
      );
      pages = null;
      onCreated(work.id);
    } catch (error) {
      addToast(
        error instanceof Error
          ? error.message
          : 'Could not prepare the sheets.',
        'error'
      );
    } finally {
      pages?.release();
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <label className="block">
        <span className="block text-sm font-semibold text-slate-700 mb-1">
          Name
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="Unit 3 essay"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="block text-sm font-semibold text-slate-700 mb-1">
          Rubric
        </span>
        <select
          value={rubricId}
          onChange={(e) => setRubricId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
        >
          <option value="">Choose a rubric</option>
          {rubrics.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title} ({rubricMaxPoints(r)} pts)
            </option>
          ))}
        </select>
        {rubrics.length === 0 && (
          <span className="block text-xs text-slate-500 mt-1">
            Make a rubric in your library first.
          </span>
        )}
      </label>

      <label className="block">
        <span className="block text-sm font-semibold text-slate-700 mb-1">
          Worksheet
        </span>
        <span className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-600 cursor-pointer hover:bg-slate-50">
          <FileUp className="w-4 h-4" aria-hidden="true" />
          <span className="truncate">
            {file ? file.name : 'Choose a PDF or image'}
          </span>
          <input
            type="file"
            accept="application/pdf,image/*"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </span>
        <span
          className="block text-xs text-slate-500 mt-1"
          title="The page is scaled to leave room for the corner marks."
        >
          Prints at about two thirds size.
        </span>
      </label>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-700 mb-1">
          Classes
        </legend>
        <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-48 overflow-y-auto">
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
              <input
                type="checkbox"
                checked={rosterIds.includes(r.id)}
                onChange={() => toggleRoster(r.id)}
              />
              <span className="flex-1 truncate">{r.name}</span>
              <span className="text-slate-500">{r.students.length}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="block text-sm font-semibold text-slate-700 mb-1">
          Blank spares
        </span>
        <input
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

      <Button
        onClick={() => void handlePrint()}
        disabled={!ready || busy}
        isLoading={busy}
        icon={<Printer className="w-4 h-4" aria-hidden="true" />}
      >
        Print {studentCount + spares} sheets
      </Button>
    </div>
  );
};
