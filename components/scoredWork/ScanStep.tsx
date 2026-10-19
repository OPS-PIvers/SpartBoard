import React, { useRef, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
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
  'no-registration': 'Corner marks not found',
  'no-marker': 'Seat code not readable',
  'other-set': 'Belongs to a different worksheet',
  'unknown-seat': 'Seat not in this set',
  'bad-page': 'Page number not in this worksheet',
};

interface ScanStepProps {
  work: ScoredWork;
  onDone: () => void;
}

export const ScanStep: React.FC<ScanStepProps> = ({ work, onDone }) => {
  const { user } = useAuth();
  const { rosters, addToast } = useDashboard();
  const { driveService } = useGoogleDrive();
  const [busy, setBusy] = useState(false);
  const [pagesRead, setPagesRead] = useState(0);
  const [results, setResults] = useState<ScanPageResult[]>([]);
  // Latest page ids per seat, so quick successive writes never overwrite each other.
  const scansRef = useRef<Record<number, Array<string | null>>>({});

  const handleFile = async (file: File) => {
    if (!user || !driveService || !work.driveFolderId) {
      addToast('Connect Google Drive to keep your scans.', 'error');
      return;
    }
    setBusy(true);
    setPagesRead(0);
    setResults([]);
    scansRef.current = { ...(work.scans ?? {}) };
    try {
      for await (const result of scanScoredWork(file, work)) {
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
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'The scan could not be read.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  const summary = summarizeScan(work, results);
  const incomplete = summary.seats.filter((s) => s.missingPages.length > 0);
  const unmatched = results.filter((r) => r.status === 'unmatched');
  const nameOf = (seat: number) =>
    seatDisplayName(rosters, work.seats[seat])?.name ??
    (work.spareSeats.includes(seat) ? `Spare sheet ${seat}` : `Seat ${seat}`);

  return (
    <div className="space-y-4 max-w-2xl">
      <label className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-600 cursor-pointer hover:bg-slate-50">
        <ScanLine className="w-5 h-5" aria-hidden="true" />
        <span>
          {busy
            ? `Reading page ${pagesRead + 1}`
            : 'Choose the scanned PDF of the whole stack'}
        </span>
        <input
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

      {results.length > 0 && !busy && (
        <div className="rounded-lg border border-slate-200 p-4 space-y-2 text-sm">
          <p className="font-semibold text-slate-800">
            {summary.seats.length} students read from {results.length} pages
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
            <p className="text-rose-700">
              {unmatched.length} pages could not be matched:{' '}
              {unmatched
                .map(
                  (r) =>
                    `scan page ${r.scanPage} (${r.status === 'unmatched' ? REASON_TEXT[r.reason] : ''})`
                )
                .join('; ')}
            </p>
          )}
          <Button onClick={onDone}>Start scoring</Button>
        </div>
      )}
    </div>
  );
};
