import React, { useState } from 'react';
import { Printer } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { Button } from '@/components/common/Button';
import { rasterizeWorksheet } from '@/utils/scoredWorkWorksheet';
import { sheetsFromWork } from '@/utils/scoredWorkPlan';
import { openPrintWindow, printScoredWork } from '@/utils/scoredWorkPrint';
import { seatDisplayName } from '@/utils/scoredWorkNames';
import type { ScoredWork } from '@/types';

interface ReprintButtonProps {
  work: ScoredWork;
}

/** Prints the set's sheets again from the worksheet kept in Drive, or from a file the teacher picks. */
export const ReprintButton: React.FC<ReprintButtonProps> = ({ work }) => {
  const { rosters, addToast } = useDashboard();
  const { driveService } = useGoogleDrive();
  const [busy, setBusy] = useState(false);

  // Called straight from a click or file pick so the print window opens inside the gesture.
  const run = async (getFile: () => Promise<Blob>) => {
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
    let pages: Awaited<ReturnType<typeof rasterizeWorksheet>> | null = null;
    let printed = false;
    try {
      pages = await rasterizeWorksheet(await getFile());
      if (pages.srcs.length !== work.pageCount) {
        throw new Error(
          `That file has ${pages.srcs.length} pages, but this worksheet has ${work.pageCount}.`
        );
      }
      printScoredWork(
        {
          workId: work.id,
          title: work.title,
          pageCount: work.pageCount,
          sheets: sheetsFromWork(work, (seat) =>
            seatDisplayName(rosters, seat)
          ),
          pageImageSrc: pages.srcs,
          onImagesReady: pages.release,
        },
        pages.aspects,
        () => printWindow
      );
      printed = true;
      pages = null;
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'Could not print the sheets.',
        'error'
      );
    } finally {
      if (!printed) printWindow.close();
      pages?.release();
      setBusy(false);
    }
  };

  const storedId = work.worksheetFileId;
  if (storedId && driveService) {
    return (
      <Button
        variant="secondary"
        disabled={busy}
        isLoading={busy}
        onClick={() => void run(() => driveService.downloadFile(storedId))}
        icon={<Printer className="w-4 h-4" aria-hidden="true" />}
      >
        Print again
      </Button>
    );
  }
  return (
    <label
      className={`inline-flex items-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-300 cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <Printer className="w-4 h-4" aria-hidden="true" />
      Print again from a file
      <input // no-tour-anchor: preview feature, tours are added when it opens
        type="file"
        accept="application/pdf,image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void run(() => Promise.resolve(f));
        }}
      />
    </label>
  );
};
