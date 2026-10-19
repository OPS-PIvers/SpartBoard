import React, { useRef, useState } from 'react';
import { HardDrive, ScanLine } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useGooglePicker } from '@/hooks/useGooglePicker';
import { Button } from '@/components/common/Button';
import { saveScanPageId } from '@/utils/scoredWorkStore';
import { uploadScanPage } from '@/utils/scoredWorkDrive';
import {
  scanScoredWork,
  summarizeScan,
  type ScanPageResult,
  type UnmatchedReason,
} from '@/utils/scoredWorkScan';
import { seatDisplayName } from '@/utils/scoredWorkNames';
import type { ScoredWork } from '@/types';

const REASON_TEXT: Record<UnmatchedReason, string> = {
  'no-registration':
    'The four black squares in the corners were not found. Scan the whole page with all four corners showing.',
  'no-marker': 'The corners were found, but the seat code could not be read.',
  'other-set': 'This page belongs to a different worksheet.',
  'unknown-seat': 'This seat is not part of this worksheet.',
  'bad-page': 'This page number is not part of this worksheet.',
};

interface ScanStepProps {
  work: ScoredWork;
  onDone: () => void;
}

export const ScanStep: React.FC<ScanStepProps> = ({ work, onDone }) => {
  const { user, ensureGoogleScope } = useAuth();
  const { rosters, addToast } = useDashboard();
  const { driveService, getDriveFileAsBlob } = useGoogleDrive();
  const { openPicker } = useGooglePicker();
  const [busy, setBusy] = useState(false);
  const [pagesRead, setPagesRead] = useState(0);
  const [results, setResults] = useState<ScanPageResult[]>([]);
  // Latest page ids per seat, so quick successive writes never overwrite each other.
  const scansRef = useRef<Record<number, Array<string | null>>>({});

  const handleFile = async (file: Blob) => {
    if (!user || !driveService || !work.driveFolderId) {
      addToast('Connect Google Drive to keep your scans.', 'error');
      return;
    }
    setBusy(true);
    setPagesRead(0);
    setResults([]);
    scansRef.current = { ...(work.scans ?? {}) };
    const collected: ScanPageResult[] = [];
    try {
      for await (const result of scanScoredWork(file, work)) {
        collected.push(result);
        if (result.status === 'ok') {
          const fileId = await uploadScanPage(
            driveService,
            work.driveFolderId,
            result.seat,
            result.page,
            result.blob
          );
          const next = Array.from(
            { length: work.pageCount },
            (_, i) => scansRef.current[result.seat]?.[i] ?? null
          );
          next[result.page - 1] = fileId;
          scansRef.current[result.seat] = next;
          await saveScanPageId(
            user.uid,
            work.id,
            result.seat,
            work.pageCount,
            result.page,
            next,
            fileId
          );
        }
        setPagesRead((n) => n + 1);
        // The blob is uploaded; drop it so a long stack never sits in memory.
        setResults((prev) => [
          ...prev,
          result.status === 'ok' ? { ...result, blob: new Blob() } : result,
        ]);
      }
      // A clean stack goes straight to scoring; problems stay on screen to read.
      const clean = summarizeScan(work, collected);
      if (
        collected.length > 0 &&
        clean.unmatched === 0 &&
        clean.seats.every((s) => s.missingPages.length === 0)
      ) {
        onDone();
      }
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'The scan could not be read.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  // The pick grants per-file access; the bytes come down and are read here like a chosen file.
  const chooseFromDrive = async () => {
    try {
      const token = await ensureGoogleScope('drive.file', {
        interactive: true,
      });
      if (!token) {
        throw new Error(
          'Google Drive access is required. Please sign in again.'
        );
      }
      const picked = await openPicker({ mode: 'scans', token });
      if (!picked) return;
      const downloaded = await getDriveFileAsBlob(picked.id);
      if (!downloaded) {
        throw new Error('Could not download that file from Drive.');
      }
      await handleFile(
        new File([downloaded.blob], downloaded.name || picked.name, {
          type: downloaded.mimeType || picked.mimeType,
        })
      );
    } catch (error) {
      addToast(
        error instanceof Error
          ? error.message
          : 'Could not open that file from Drive.',
        'error'
      );
    }
  };

  const summary = summarizeScan(work, results);
  const incomplete = summary.seats.filter((s) => s.missingPages.length > 0);
  const unmatched = results.flatMap((r) =>
    r.status === 'unmatched' ? [r] : []
  );
  const nameOf = (seat: number) =>
    seatDisplayName(rosters, work.seats[seat])?.name ??
    (work.spareSeats.includes(seat) ? `Spare sheet ${seat}` : `Seat ${seat}`);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex flex-wrap gap-2">
        <label
          className={`flex flex-1 min-w-56 items-center gap-3 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-600 cursor-pointer hover:bg-slate-50 ${busy ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <ScanLine className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span>
            {busy
              ? `Reading page ${pagesRead + 1}`
              : 'Choose the scanned PDF from this computer'}
          </span>
          <input // no-tour-anchor: preview feature, tours are added when it opens
            type="file"
            accept="application/pdf,image/*"
            disabled={busy}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void handleFile(f);
            }}
          />
        </label>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void chooseFromDrive()}
          icon={<HardDrive className="w-4 h-4" aria-hidden="true" />}
        >
          Choose from Google Drive
        </Button>
      </div>

      {results.length > 0 && !busy && (
        <div className="rounded-lg border border-slate-200 p-4 space-y-3 text-sm">
          <p className="font-semibold text-slate-800">
            {summary.seats.length}{' '}
            {summary.seats.length === 1 ? 'student' : 'students'} read from{' '}
            {results.length} {results.length === 1 ? 'page' : 'pages'}
          </p>
          {incomplete.length > 0 && (
            <p className="text-amber-700">
              Missing pages:{' '}
              {incomplete
                .map(
                  (s) => `${nameOf(s.seat)} (p. ${s.missingPages.join(', ')})`
                )
                .join('; ')}
            </p>
          )}
          {summary.absentSeats.length > 0 && (
            <p className="text-slate-600">
              Not in the stack: {summary.absentSeats.map(nameOf).join('; ')}
            </p>
          )}
          {unmatched.length > 0 && (
            <div className="space-y-2">
              <p className="text-rose-700">
                {unmatched.length} {unmatched.length === 1 ? 'page' : 'pages'}{' '}
                could not be matched.
              </p>
              <ul className="flex flex-wrap gap-3">
                {unmatched.slice(0, 4).map((r) => (
                  <li key={r.scanPage} className="w-40 space-y-1">
                    {r.thumb && (
                      <img
                        src={r.thumb}
                        alt={`Scanned page ${r.scanPage}`}
                        className="w-full rounded border border-slate-300"
                      />
                    )}
                    <p className="text-xs text-rose-700">
                      Page {r.scanPage}: {REASON_TEXT[r.reason]}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button onClick={onDone}>Continue to scoring</Button>
        </div>
      )}
    </div>
  );
};
